// The Team App API, answered in memory for the isolated demo
// (/preview/team-app). The generated twins' `fetch` (demoGlobals.ts) lands
// here, so the real components run unchanged against fictional records —
// nothing is ever sent to the app, a database, Stripe, or anyone.
//
// Each handler answers like the real route under src/app/api/team/[slug]/
// (named beside it): the same permission helpers decide who may do what
// (isStaff / isHeadCoach / isCoachOnly, taskViewerFor, canViewTask,
// canViewCompletion), the same pure validators check the input
// (validateTaskInput, normalizeAckName, validateLocation, normalizeAbout),
// the same builders shape the answer (buildAckView, buildTeamSummary,
// buildTaskCompletion, buildAthleteCompletion, buildCompletionCsv), with the
// same error messages. What the database would do (revisions, versions,
// ordering) is restated in a few lines, commented where it happens.
//
// Things the demo deliberately doesn't do answer with a "Preview only"
// error the real component shows in its own error area: donating
// (/api/checkout), uploading documents, and opening document contents.

import type { CampaignSettings, DonationRow, SponsorRow } from "@/lib/supabase";
import type { OutreachRow, TeamAthleteRow, TeamProductRow } from "@/lib/teamData";
import type { StaffDisplayEntry } from "@/lib/staffAggregation";
import type { DemoRequest, DemoResponse, DemoServer } from "./demoGlobals";
import { isCoachOnly, isHeadCoach, isStaff, type TeamActor } from "../../../lib/permissions.ts";
import {
  TaskValidationError, canManageTasks, canViewArchived, canViewTask, sortTasks, taskViewerFor, validateTaskInput, visibleAudiences,
  type ValidatedTask,
} from "../../../lib/teamTasks.ts";
import { ackRowStatus, allChildrenNamed, buildAckView, normalizeAckName, requirementsFor, sameAthleteSet, type AckIdentity } from "../../../lib/teamTaskAcks.ts";
import {
  buildAthleteCompletion, buildTaskCompletion, buildTeamSummary, canViewCompletion, familyAthleteCompletion,
  type CompletionAthlete, type CompletionTask,
} from "../../../lib/teamTaskCompletion.ts";
import { buildCompletionCsv, buildCompletionCsvRows, completionCsvFilename, exportDate } from "../../../lib/teamTaskCompletionCsv.ts";
import { attributeDonationsToAthletes } from "../../../lib/donationAttribution.ts";
import { FOLLOW_UP_STATUS_LABEL } from "../../../lib/followUps.ts";
import { MAX_BANNER_BYTES, isAllowedBannerMimeType, normalizeAbout, validateLocation } from "../../../lib/teamOverview.ts";
import { DEMO_SLUG } from "./demoData.ts";
import {
  DEMO_COACH_PARTICIPANTS, DEMO_CONTACT_GOAL, DEMO_TEAM_ATHLETES, buildDemoContacts, buildDemoDonations, buildDemoOutreach,
  buildDemoSettings, coachOwner, type DemoCoachParticipant, type DemoContact,
} from "./fundraisingData.ts";
import {
  DEMO_FAMILY_MEMBERS, DEMO_TEAM_FILES, buildDemoAcks, buildDemoResources, buildDemoTasks, demoAckIdentity, demoAckStatusRows,
  toCompletionRows, type DemoAck, type DemoAttachment, type DemoClearanceResource, type DemoTask,
} from "./todoData.ts";
import { DEMO_OVERVIEW, DEMO_STAFF, DEMO_STORE_URL, buildDemoProducts, buildDemoSponsors } from "./teamInfoData.ts";

// ── The demo's records ──────────────────────────────────────────────────────

export type DemoDb = {
  settings: CampaignSettings;
  athletes: TeamAthleteRow[];
  donations: DonationRow[];
  coachParticipants: DemoCoachParticipant[];
  /** Owner (athlete id or "coach:<id>") -> contacts, newest first. */
  contacts: Record<string, DemoContact[]>;
  /** Athlete id or "coach:<id>" -> follow-up history, newest first. */
  outreach: Record<string, OutreachRow[]>;
  tasks: DemoTask[];
  acks: DemoAck[];
  resources: DemoClearanceResource[];
  files: DemoAttachment[];
  staff: StaffDisplayEntry[];
  products: TeamProductRow[];
  sponsors: SponsorRow[];
  seq: number;
};

export function buildDemoDb(now: Date): DemoDb {
  const tasks = buildDemoTasks(now);
  return {
    settings: { ...buildDemoSettings(now), ...DEMO_OVERVIEW, external_store_url: DEMO_STORE_URL, store_provider: null },
    athletes: DEMO_TEAM_ATHLETES,
    donations: buildDemoDonations(now),
    coachParticipants: DEMO_COACH_PARTICIPANTS,
    contacts: buildDemoContacts(now),
    outreach: buildDemoOutreach(now),
    tasks,
    acks: buildDemoAcks(now, tasks),
    resources: buildDemoResources(now),
    files: DEMO_TEAM_FILES,
    staff: DEMO_STAFF,
    products: buildDemoProducts(now),
    sponsors: buildDemoSponsors(now),
    seq: 0,
  };
}

// ── Messages the demo answers with ──────────────────────────────────────────

export const PREVIEW_DONATION = "Preview only — no donation is made in this demo. In the app, this continues to secure checkout.";
export const PREVIEW_UPLOAD = "Preview only — uploading documents isn't part of this demo.";
export const PREVIEW_DOCUMENT = "Preview only — this sample document isn't included in the demo.";

const ONLY_HEAD_COACH = "Only this team's Head Coach can manage To-Do tasks."; // todo/_shared.ts
const TASK_FAILURES = {                                                         // todo/_shared.ts
  not_found: { status: 404, error: "Task not found." },
  not_active: { status: 409, error: "Archived tasks can't be edited. Restore the task first." },
  conflict: { status: 409, error: "This task was changed by someone else. Reload and try again." },
} as const;
const ACK_ERRORS = {                                                            // tasks/[taskId]/acknowledgment
  not_found: { status: 404, error: "Task not found." },
  inactive: { status: 409, error: "This task is no longer active." },
  not_required: { status: 400, error: "This task doesn't need your acknowledgment." },
  revision_changed: { status: 409, error: "This task was updated. Please review the changes and acknowledge again." },
  not_eligible: { status: 403, error: "You can't acknowledge this task for these athletes. If your family links changed, reload and try again." },
  invalid_name: { status: 400, error: "Enter your full name (2–120 characters)." },
  already_satisfied: { status: 409, error: "This task is already acknowledged for the current version." },
  children_changed: { status: 409, error: "The athletes this acknowledgment covers have changed. Please review and submit again." },
  not_confirmed: { status: 400, error: "Check the acknowledgment box to continue." },
  invalid_request: { status: 400, error: "Invalid request." },
} as const;
const COMPLETION_FAILURES = {                                                   // todo/completion/_shared.ts
  not_found: { status: 404, error: "Not found." },
  inactive: { status: 409, error: "This task is archived, so it isn't a current requirement." },
} as const;

const json = (body: unknown, status = 200): DemoResponse => ({ status, json: body });
const err = (error: string, status: number, extra?: Record<string, unknown>): DemoResponse => ({ status, json: { error, ...extra } });

// ── Helpers ─────────────────────────────────────────────────────────────────

const ALLOWED_RELATIONSHIPS = new Set(["Family", "Friend", "Coworker", "Neighbor", "Coach", "Teacher", "Business", "Other"]);

/** contacts/route.ts validateBody, restated. */
function validateContact(body: Record<string, unknown>): string | null {
  const phone = (body.phone as string | undefined)?.trim() || null;
  const email = (body.email as string | undefined)?.trim() || null;
  if (!phone && !email) return "At least one of phone or email is required.";
  if (phone && phone.length > 30) return "Phone must be 30 characters or fewer.";
  if (email && email.length > 254) return "Email must be 254 characters or fewer.";
  if (email && !email.includes("@")) return "Email must contain @.";
  const rel = body.relationship as string | undefined;
  if (rel && !ALLOWED_RELATIONSHIPS.has(rel)) return "Invalid relationship value.";
  const relOther = (body.relationship_other as string | undefined)?.trim() || null;
  if (relOther && relOther.length > 100) return "Relationship note must be 100 characters or fewer.";
  for (const [field, label] of [["first_name", "First name"], ["last_name", "Last name"]] as const) {
    const v = (body[field] as string | undefined)?.trim() || null;
    if (v && v.length > 100) return `${label} must be 100 characters or fewer.`;
  }
  const notes = (body.notes as string | undefined)?.trim() || null;
  if (notes && notes.length > 500) return "Notes must be 500 characters or fewer.";
  return null;
}

function contactFields(body: Record<string, unknown>) {
  const text = (k: string) => ((body[k] as string | undefined | null)?.trim() || null);
  return {
    phone: text("phone"),
    email: text("email"),
    first_name: text("first_name"),
    last_name: text("last_name"),
    relationship: text("relationship"),
    relationship_other: body.relationship === "Other" ? text("relationship_other") : null,
    notes: text("notes"),
  };
}

function csvField(val: string | number | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

type Ctx = {
  db: DemoDb;
  actor: TeamActor;
  now: Date;
  write: (fn: (db: DemoDb) => DemoDb) => void;
  nextId: () => string;
};

/** Contacts owner for this actor (contacts/route.ts): a participating
 *  coach's own list, or the linked athlete's for an athlete/parent. */
type OwnerResult = { ok: true; owner: string; addedBy: DemoContact["added_by_type"] } | { ok: false; res: DemoResponse };

function memberOwner(ctx: Ctx, requestedAthleteId: string | null): OwnerResult {
  const no = (res: DemoResponse): OwnerResult => ({ ok: false, res });
  const { actor } = ctx;
  if (actor.kind === "public") return no(err("Unauthorized", 401));
  if (actor.kind === "coach" && isCoachOnly(actor) && ctx.db.coachParticipants.some(p => p.coach_id === actor.session.id)) {
    return { ok: true, owner: coachOwner(actor.session.id), addedBy: "coach" };
  }
  if (isStaff(actor)) return no(err("Use /coach/summary for staff access.", 403));
  if (actor.kind !== "member" || (actor.session.role !== "athlete" && actor.session.role !== "parent")) return no(err("Unauthorized", 403));
  const linked = actor.session.athlete_id ? [actor.session.athlete_id] : [];
  if (!linked.length) return no(err("No athlete linked to this account.", 400));
  const athleteId = requestedAthleteId && linked.includes(requestedAthleteId) ? requestedAthleteId : linked[0];
  return { ok: true, owner: athleteId, addedBy: actor.session.role };
}

function findContact(db: DemoDb, contactId: string): { owner: string; contact: DemoContact } | null {
  for (const [owner, list] of Object.entries(db.contacts)) {
    const contact = list.find(c => c.id === contactId);
    if (contact) return { owner, contact };
  }
  return null;
}

/** The task list item the To-Do List renders (TaskItem). */
function taskItem(task: DemoTask) {
  return { ...task, resources: task.resources.map(r => ({ id: r.id, kind: r.kind, url: r.url, attachment_id: r.attachment_id, label: r.label, attachment: r.attachment })) };
}

function activeTasks(db: DemoDb) {
  return sortTasks(db.tasks.filter(t => t.status === "active"));
}

const completionTask = (t: DemoTask): CompletionTask => ({ id: t.id, title: t.title, audience: t.audience, revision: t.revision });
const completionAthletes = (db: DemoDb): CompletionAthlete[] =>
  db.athletes.map(a => ({ id: a.id, name: a.name, class_year: a.class_year ?? null, jersey_number: a.jersey_number }));

function ackView(db: DemoDb, task: DemoTask, identity: AckIdentity | null) {
  if (!identity || task.status !== "active" || !requirementsFor(task.audience).includes(identity.requirement)) return null;
  const rows = demoAckStatusRows([task], identity.athleteIds, db.acks);
  const names = new Map(db.athletes.map(a => [a.id, a.name]));
  return buildAckView(task, identity, rows, names);
}

/** What the database decides on an edit (team_task_update /
 *  team_tasks_guard): version always +1; revision +1 when the title,
 *  instructions, body, audience or the SET of links/files changed. */
function applyTaskEdit(task: DemoTask, v: ValidatedTask, files: DemoAttachment[], at: string, nextId: () => string): DemoTask {
  const set = (rs: readonly { kind: string; url: string | null; attachment_id: string | null }[]) =>
    rs.map(r => (r.kind === "link" ? `link:${r.url}` : `file:${r.attachment_id}`)).sort().join("|");
  const substantive = task.title !== v.title || task.instructions !== v.instructions || task.body_text !== v.body_text
    || task.audience !== v.audience || set(task.resources) !== set(v.resources);
  return {
    ...task,
    title: v.title,
    instructions: v.instructions,
    body_text: v.body_text,
    audience: v.audience,
    revision: task.revision + (substantive ? 1 : 0),
    revised_at: substantive ? at : task.revised_at,
    version: task.version + 1,
    updated_at: at,
    resources: v.resources.map((r, k) => ({
      id: task.resources.find(x => (x.kind === "link" ? x.url === r.url : x.attachment_id === r.attachment_id))?.id ?? nextId(),
      kind: r.kind, url: r.url, attachment_id: r.attachment_id, label: r.label, sort_order: k,
      attachment: r.kind === "file" ? files.find(f => f.id === r.attachment_id) ?? null : null,
    })),
  } as DemoTask;
}

function objectUrlFor(file: unknown): string | null {
  if (typeof File === "undefined" || !(file instanceof File) || typeof URL.createObjectURL !== "function") return null;
  return URL.createObjectURL(file);
}

// ── Routes ──────────────────────────────────────────────────────────────────

type Handler = (ctx: Ctx, req: DemoRequest, params: string[]) => DemoResponse;
type Route = [method: string, pattern: RegExp, handler: Handler];

const TEAM = "^/api/team/[^/]+";

const ROUTES: Route[] = [
  // /api/checkout — never a donation.
  ["POST", /^\/api\/checkout$/, () => err(PREVIEW_DONATION, 503)],

  // ── contacts/route.ts ──
  ["GET", new RegExp(`${TEAM}/contacts$`), (ctx, req) => {
    const o = memberOwner(ctx, req.query.get("athleteId"));
    if (!o.ok) return o.res;
    const contacts = ctx.db.contacts[o.owner] ?? [];
    if (req.query.get("summary") === "1") return json({ count: contacts.length, goal: DEMO_CONTACT_GOAL });
    return json({ contacts, goal: DEMO_CONTACT_GOAL });
  }],
  ["POST", new RegExp(`${TEAM}/contacts$`), (ctx, req) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return err("Invalid request body.", 400);
    const o = memberOwner(ctx, typeof body.athleteId === "string" ? body.athleteId : null);
    if (!o.ok) return o.res;
    const problem = validateContact(body);
    if (problem) return err(problem, 400);
    const contact: DemoContact = { id: ctx.nextId(), ...contactFields(body), added_by_type: o.addedBy, created_at: ctx.now.toISOString() };
    ctx.write(db => ({ ...db, contacts: { ...db.contacts, [o.owner]: [contact, ...(db.contacts[o.owner] ?? [])] } }));
    return json(contact);
  }],
  // contacts/[id]/route.ts — the owner, or staff.
  ["PATCH", new RegExp(`${TEAM}/contacts/([^/]+)$`), (ctx, req, [contactId]) => {
    const found = findContact(ctx.db, contactId);
    if (!found) return err("Contact not found.", 404);
    const mine = memberOwner(ctx, found.owner);
    if (!isStaff(ctx.actor) && (!mine.ok || mine.owner !== found.owner)) return err("Unauthorized", 403);
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return err("Invalid request body.", 400);
    const problem = validateContact(body);
    if (problem) return err(problem, 400);
    const updated: DemoContact = { ...found.contact, ...contactFields(body) };
    ctx.write(db => ({ ...db, contacts: { ...db.contacts, [found.owner]: db.contacts[found.owner].map(c => (c.id === contactId ? updated : c)) } }));
    return json(updated);
  }],
  ["DELETE", new RegExp(`${TEAM}/contacts/([^/]+)$`), (ctx, _req, [contactId]) => {
    const found = findContact(ctx.db, contactId);
    if (!found) return err("Contact not found.", 404);
    const mine = memberOwner(ctx, found.owner);
    if (!isStaff(ctx.actor) && (!mine.ok || mine.owner !== found.owner)) return err("Unauthorized", 403);
    ctx.write(db => ({ ...db, contacts: { ...db.contacts, [found.owner]: db.contacts[found.owner].filter(c => c.id !== contactId) } }));
    return json({ ok: true });
  }],
  // contacts/coach/athlete/[athleteId] and contacts/coach/summary — staff.
  ["GET", new RegExp(`${TEAM}/contacts/coach/athlete/([^/]+)$`), (ctx, _req, [athleteId]) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    return json({ contacts: ctx.db.contacts[athleteId] ?? [] });
  }],
  ["POST", new RegExp(`${TEAM}/contacts/coach/athlete/([^/]+)$`), (ctx, req, [athleteId]) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    if (!ctx.db.athletes.some(a => a.id === athleteId)) return err("Athlete not found.", 404);
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return err("Invalid request body.", 400);
    const problem = validateContact(body);
    if (problem) return err(problem, 400);
    const contact: DemoContact = { id: ctx.nextId(), ...contactFields(body), added_by_type: "coach", created_at: ctx.now.toISOString() };
    ctx.write(db => ({ ...db, contacts: { ...db.contacts, [athleteId]: [contact, ...(db.contacts[athleteId] ?? [])] } }));
    return json(contact);
  }],
  ["GET", new RegExp(`${TEAM}/contacts/coach/summary$`), ctx => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    const athletes = ctx.db.athletes.map(a => {
      const list = ctx.db.contacts[a.id] ?? [];
      const total = list.length;
      return {
        athlete_id: a.id, name: a.name, reachable_count: total,
        phone_count: list.filter(c => c.phone && !c.email).length, email_count: list.filter(c => c.email && !c.phone).length,
        both_count: list.filter(c => c.phone && c.email).length, goal: DEMO_CONTACT_GOAL,
        pct: Math.round((total / DEMO_CONTACT_GOAL) * 100),
        status: total === 0 ? "Not Started" : total >= DEMO_CONTACT_GOAL ? "Goal Met" : "In Progress",
      };
    });
    return json({ athletes, team_goal: DEMO_CONTACT_GOAL * athletes.length });
  }],

  // ── outreach/[athleteId] and outreach/coach/[coachId] — staff ──
  ["GET", new RegExp(`${TEAM}/outreach/(coach/)?([^/]+)$`), (ctx, _req, [coach, subject]) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 401);
    return json(ctx.db.outreach[coach ? coachOwner(subject) : subject] ?? []);
  }],
  ["POST", new RegExp(`${TEAM}/outreach/(coach/)?([^/]+)$`), (ctx, req, [coach, subject]) => {
    if (!isStaff(ctx.actor) || ctx.actor.kind === "public") return err("Unauthorized", 401);
    const body = req.body as { status?: string; note?: string | null } | null;
    if (!body) return err("Invalid request body", 400);
    const statuses = ["contacted", "needs_follow_up", "resolved"];
    if (!body.status || !statuses.includes(body.status)) return err(`status must be one of: ${statuses.join(", ")}`, 400);
    const key = coach ? coachOwner(subject) : subject;
    const row: OutreachRow = {
      id: ctx.nextId(), athlete_id: coach ? "" : subject, campaign_slug: DEMO_SLUG,
      status: body.status as OutreachRow["status"], note: body.note?.trim() || null,
      contacted_by: ctx.actor.kind === "platform_admin" ? null : ctx.actor.session.name,
      coach_id: coach ? subject : null, created_at: ctx.now.toISOString(),
    };
    ctx.write(db => ({ ...db, outreach: { ...db.outreach, [key]: [row, ...(db.outreach[key] ?? [])] } }));
    return json(row);
  }],

  // ── analytics/export/athletes — the athlete report (same columns) ──
  ["GET", new RegExp(`${TEAM}/analytics/export/athletes$`), ctx => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 401);
    const { db } = ctx;
    const { totalsCents, donorCounts } = attributeDonationsToAthletes(db.athletes, db.donations);
    const coachTotals = (cid: string) => db.donations.filter(d => d.coach_id === cid).reduce((s, d) => s + d.amount_cents, 0);
    const latest = (key: string) => db.outreach[key]?.[0] ?? null;
    const rows = [
      ...db.athletes.map(a => ({
        name: a.name, type: "Athlete", grade: a.class_year ?? (a.grad_year ? `Class of ${a.grad_year}` : ""), event: a.event,
        jersey: a.jersey_number, gradYear: a.grad_year, contacts: db.contacts[a.id]?.length ?? 0, donors: donorCounts[a.id] ?? 0,
        raised: totalsCents[a.id] ?? 0, goal: a.goal_cents ?? db.settings.default_athlete_goal_cents ?? null, outreach: latest(a.id),
      })),
      ...db.coachParticipants.map(c => ({
        name: c.name, type: "Coach", grade: c.role === "head_coach" ? "Head Coach" : "Assistant Coach", event: null, jersey: null,
        gradYear: null, contacts: db.contacts[coachOwner(c.coach_id)]?.length ?? 0,
        donors: db.donations.filter(d => d.coach_id === c.coach_id).length, raised: coachTotals(c.coach_id), goal: c.goal_cents,
        outreach: latest(coachOwner(c.coach_id)),
      })),
    ].sort((a, b) => b.raised - a.raised);
    const header = "Rank,Name,Participant Type,Role / Grade,Event,Jersey #,Grad Year,Fundraising Contacts,Donor Count,Amount Raised,Goal,% of Goal,Follow-Up Status,Last Outreach";
    const lines = rows.map((r, i) => [
      csvField(i + 1), csvField(r.name), csvField(r.type), csvField(r.grade), csvField(r.event), csvField(r.jersey), csvField(r.gradYear),
      csvField(r.contacts), csvField(r.donors), csvField(`$${(r.raised / 100).toFixed(2)}`),
      csvField(r.goal != null ? `$${(r.goal / 100).toFixed(2)}` : ""),
      csvField(r.goal && r.goal > 0 ? `${Math.min(100, Math.round((r.raised / r.goal) * 100))}%` : ""),
      csvField(r.outreach ? FOLLOW_UP_STATUS_LABEL[r.outreach.status] : ""), csvField(r.outreach?.created_at.slice(0, 10) ?? ""),
    ].join(","));
    return { text: "﻿" + [header, ...lines].join("\r\n") + "\r\n", headers: { "Content-Type": "text/csv; charset=utf-8" } };
  }],

  // ── staff-roster and settings/booster-visibility ──
  ["GET", new RegExp(`${TEAM}/staff-roster$`), ctx => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    const show = ctx.db.settings.show_booster_in_staff_roster !== false;
    return json({
      staff: ctx.db.staff.filter(s => show || s.role !== "booster"),
      canManageBoosterVisibility: isHeadCoach(ctx.actor),
      showBoosterInStaffRoster: show,
    });
  }],
  ["PATCH", new RegExp(`${TEAM}/settings/booster-visibility$`), (ctx, req) => {
    if (!isHeadCoach(ctx.actor)) return err("Only the Head Coach can change this setting.", 403);
    const value = (req.body as { show_booster_in_staff_roster?: unknown } | null)?.show_booster_in_staff_roster;
    if (typeof value !== "boolean") return err("Invalid request.", 400);
    ctx.write(db => ({ ...db, settings: { ...db.settings, show_booster_in_staff_roster: value } }));
    return json({ ok: true, show_booster_in_staff_roster: value });
  }],

  // ── overview and overview/banner — Head Coach ──
  ["PATCH", new RegExp(`${TEAM}/overview$`), (ctx, req) => {
    if (!isHeadCoach(ctx.actor)) return err("Only the Head Coach can edit the team overview.", 403);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if ("location" in body) {
      const r = validateLocation(body.location);
      if (!r.ok) return err(r.error, 400);
      ctx.write(db => ({ ...db, settings: { ...db.settings, ...r.value } }));
      return json(r.value);
    }
    if ("team_about" in body) {
      const r = normalizeAbout(body.team_about);
      if (!r.ok) return err(r.error, 400);
      ctx.write(db => ({ ...db, settings: { ...db.settings, team_about: r.value } }));
      return json({ team_about: r.value });
    }
    return err("Nothing to update.", 400);
  }],
  ["POST", new RegExp(`${TEAM}/overview/banner$`), (ctx, req) => {
    if (!isHeadCoach(ctx.actor)) return err("Only the Head Coach can change the banner.", 403);
    const file = req.body instanceof FormData ? req.body.get("banner") : null;
    if (!(file instanceof File)) return err("Choose an image to upload.", 400);
    if (!isAllowedBannerMimeType(file.type)) return err("Banner must be a JPG, PNG or WebP image.", 400);
    if (file.size > MAX_BANNER_BYTES) return err("Image is too large (max 8 MB).", 400);
    // The picture never leaves the visitor's browser: a local object URL.
    const url = objectUrlFor(file);
    if (!url) return err(PREVIEW_UPLOAD, 503);
    ctx.write(db => ({ ...db, settings: { ...db.settings, team_banner_url: url } }));
    return json({ team_banner_url: url });
  }],
  ["DELETE", new RegExp(`${TEAM}/overview/banner$`), ctx => {
    if (!isHeadCoach(ctx.actor)) return err("Only the Head Coach can change the banner.", 403);
    ctx.write(db => ({ ...db, settings: { ...db.settings, team_banner_url: null } }));
    return json({ ok: true });
  }],

  // ── todo/tasks ──
  ["GET", new RegExp(`${TEAM}/todo/tasks$`), (ctx, req) => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    const viewer = taskViewerFor(ctx.actor);
    const wantArchived = req.query.get("status") === "archived";
    if (wantArchived && !canViewArchived(viewer)) return err(ONLY_HEAD_COACH, 403);
    const audiences = visibleAudiences(viewer) as readonly string[];
    const tasks = sortTasks(ctx.db.tasks.filter(t => t.status === (wantArchived ? "archived" : "active") && audiences.includes(t.audience)));
    const identity = demoAckIdentity(ctx.actor);
    const items = viewer === "athlete" || viewer === "parent"
      ? tasks.map(t => ({ ...taskItem(t), my_ack: identity ? ackRowStatus(ackView(ctx.db, t, identity)) : null }))
      : tasks.map(taskItem);
    return json({ available: true, tasks: items, canManage: canManageTasks(viewer), viewer });
  }],
  ["POST", new RegExp(`${TEAM}/todo/tasks$`), (ctx, req) => {
    if (!canManageTasks(taskViewerFor(ctx.actor)) || ctx.actor.kind !== "coach") return err(ONLY_HEAD_COACH, 403);
    let v: ValidatedTask;
    try { v = validateTaskInput((req.body ?? {}) as Parameters<typeof validateTaskInput>[0]); } catch (e) {
      if (e instanceof TaskValidationError) return err(e.message, 400);
      throw e;
    }
    if (v.resources.some(r => r.kind === "file" && !ctx.db.files.some(f => f.id === r.attachment_id))) {
      return err("One or more documents aren't available on this team.", 400);
    }
    const at = ctx.now.toISOString();
    const base = {
      id: ctx.nextId(), campaign_slug: DEMO_SLUG, title: "", instructions: null, body_text: null, audience: v.audience,
      status: "active", sort_order: Math.max(0, ...ctx.db.tasks.map(t => t.sort_order)) + 1, revision: 1, revised_at: at, version: 0,
      created_by_name: ctx.actor.session.name, updated_by_name: ctx.actor.session.name, created_at: at, updated_at: at, archived_at: null, resources: [],
    } as unknown as DemoTask;
    const task = { ...applyTaskEdit(base, v, ctx.db.files, at, ctx.nextId), revision: 1, version: 1 };
    ctx.write(db => ({ ...db, tasks: [...db.tasks, task] }));
    return json({ ok: true, task: { id: task.id, revision: task.revision } });
  }],
  ["PATCH", new RegExp(`${TEAM}/todo/tasks/([^/]+)$`), (ctx, req, [taskId]) => {
    if (!canManageTasks(taskViewerFor(ctx.actor)) || ctx.actor.kind !== "coach") return err(ONLY_HEAD_COACH, 403);
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return err("Invalid request.", 400);
    const expected = body.expected_version;
    if (!Number.isInteger(expected) || (expected as number) < 1) return err("Missing task version. Reload and try again.", 400);
    let v: ValidatedTask;
    try { v = validateTaskInput(body as Parameters<typeof validateTaskInput>[0]); } catch (e) {
      if (e instanceof TaskValidationError) return err(e.message, 400);
      throw e;
    }
    const current = ctx.db.tasks.find(t => t.id === taskId);
    if (!current) return err(TASK_FAILURES.not_found.error, TASK_FAILURES.not_found.status);
    if (current.status !== "active") return err(TASK_FAILURES.not_active.error, TASK_FAILURES.not_active.status);
    if (current.version !== expected) return err(TASK_FAILURES.conflict.error, TASK_FAILURES.conflict.status);
    if (v.resources.some(r => r.kind === "file" && !ctx.db.files.some(f => f.id === r.attachment_id))) {
      return err("One or more documents aren't available on this team.", 400);
    }
    const updated = { ...applyTaskEdit(current, v, ctx.db.files, ctx.now.toISOString(), ctx.nextId), updated_by_name: ctx.actor.session.name };
    ctx.write(db => ({ ...db, tasks: db.tasks.map(t => (t.id === taskId ? updated : t)) }));
    return json({ ok: true, task: { id: updated.id, revision: updated.revision, version: updated.version }, revisionChanged: updated.revision > current.revision });
  }],
  ["POST", new RegExp(`${TEAM}/todo/tasks/([^/]+)/archive$`), (ctx, req, [taskId]) => {
    if (!canManageTasks(taskViewerFor(ctx.actor))) return err(ONLY_HEAD_COACH, 403);
    const archived = (req.body as { archived?: unknown } | null)?.archived;
    if (typeof archived !== "boolean") return err("Invalid request.", 400);
    if (!ctx.db.tasks.some(t => t.id === taskId)) return err(TASK_FAILURES.not_found.error, 404);
    // Never touches revision or version (setTaskArchived).
    ctx.write(db => ({
      ...db,
      tasks: db.tasks.map(t => (t.id === taskId ? { ...t, status: archived ? "archived" : "active", archived_at: archived ? ctx.now.toISOString() : null } as DemoTask : t)),
    }));
    return json({ ok: true });
  }],
  ["POST", new RegExp(`${TEAM}/todo/tasks/([^/]+)/move$`), (ctx, req, [taskId]) => {
    if (!canManageTasks(taskViewerFor(ctx.actor))) return err(ONLY_HEAD_COACH, 403);
    const direction = (req.body as { direction?: unknown } | null)?.direction;
    if (direction !== "up" && direction !== "down") return err("Direction must be up or down.", 400);
    const list = activeTasks(ctx.db);
    const i = list.findIndex(t => t.id === taskId);
    if (i < 0) return err(TASK_FAILURES.not_found.error, 404);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j >= 0 && j < list.length) {
      // team_task_move: swaps sort_order only — never revision or version.
      const a = list[i], b = list[j];
      ctx.write(db => ({
        ...db,
        tasks: db.tasks.map(t => (t.id === a.id ? { ...t, sort_order: b.sort_order } : t.id === b.id ? { ...t, sort_order: a.sort_order } : t)),
      }));
    }
    return json({ ok: true });
  }],
  ["GET", new RegExp(`${TEAM}/todo/files$`), ctx => {
    if (!canManageTasks(taskViewerFor(ctx.actor))) return err(ONLY_HEAD_COACH, 403);
    return json({ files: ctx.db.files });
  }],

  // ── todo/tasks/[taskId]/acknowledgment ──
  ["GET", new RegExp(`${TEAM}/todo/tasks/([^/]+)/acknowledgment$`), (ctx, _req, [taskId]) => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    const task = ctx.db.tasks.find(t => t.id === taskId);
    if (!task || !canViewTask(taskViewerFor(ctx.actor), task)) return err(TASK_FAILURES.not_found.error, 404);
    return json({ available: true, acknowledgment: ackView(ctx.db, task, demoAckIdentity(ctx.actor)) });
  }],
  ["POST", new RegExp(`${TEAM}/todo/tasks/([^/]+)/acknowledgment$`), (ctx, req, [taskId]) => {
    const fail = (reason: keyof typeof ACK_ERRORS, extra?: Record<string, unknown>) =>
      err(ACK_ERRORS[reason].error, ACK_ERRORS[reason].status, { reason, ...extra });
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return fail("invalid_request");
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    const task = ctx.db.tasks.find(t => t.id === taskId);
    if (!task || !canViewTask(taskViewerFor(ctx.actor), task)) return fail("not_found");
    const identity = demoAckIdentity(ctx.actor);
    if (!identity) return err("Only athletes and their linked parents can acknowledge tasks.", 403, { reason: "not_eligible" });
    if (task.status !== "active") return fail("inactive");
    if (!requirementsFor(task.audience).includes(identity.requirement)) return fail("not_required");
    const shown = body.athlete_ids;
    if (!Number.isInteger(body.expected_revision) || !Array.isArray(shown) || !shown.every(x => typeof x === "string")) return fail("invalid_request");
    const fullName = normalizeAckName(body.full_name);
    if (!fullName) return fail("invalid_name");
    if (body.confirmed !== true) return fail("not_confirmed");
    const view = ackView(ctx.db, task, identity);
    if (body.expected_revision !== task.revision) return fail("revision_changed", { acknowledgment: view });
    if (!view || view.children.length === 0 || !allChildrenNamed(view)) return fail("not_eligible");
    if (view.outstandingAthleteIds.length === 0) return fail("already_satisfied", { acknowledgment: view });
    if (!sameAthleteSet(shown as string[], view.outstandingAthleteIds)) return fail("children_changed", { acknowledgment: view });
    const at = ctx.now.toISOString();
    const recorded: DemoAck[] = view.outstandingAthleteIds.map(athleteId => ({
      task_id: task.id, athlete_id: athleteId, requirement: identity.requirement, revision: task.revision,
      member_id: identity.memberId, full_name: fullName, at,
    }));
    const next = { ...ctx.db, acks: [...ctx.db.acks, ...recorded] };
    ctx.write(() => next);
    return json({ ok: true, recorded: recorded.length, acknowledgment: ackView(next, task, identity) });
  }],

  // ── todo/completion (coaches) and todo/family-completion ──
  ["GET", new RegExp(`${TEAM}/todo/completion$`), ctx => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    if (!canViewCompletion(taskViewerFor(ctx.actor))) return err("Only this team's coaches can view task completion.", 403);
    const tasks = activeTasks(ctx.db);
    const athletes = completionAthletes(ctx.db);
    const rows = toCompletionRows(demoAckStatusRows(tasks, athletes.map(a => a.id), ctx.db.acks));
    return json({ available: true, athleteCount: athletes.length, tasks: buildTeamSummary(tasks.map(completionTask), athletes, rows) });
  }],
  ["GET", new RegExp(`${TEAM}/todo/completion/tasks/([^/]+)$`), (ctx, _req, [taskId]) => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    if (!canViewCompletion(taskViewerFor(ctx.actor))) return err("Only this team's coaches can view task completion.", 403);
    const task = ctx.db.tasks.find(t => t.id === taskId);
    if (!task) return err(COMPLETION_FAILURES.not_found.error, 404, { reason: "not_found" });
    if (task.status !== "active") return err(COMPLETION_FAILURES.inactive.error, 409, { reason: "inactive" });
    const athletes = completionAthletes(ctx.db);
    const rows = toCompletionRows(demoAckStatusRows([task], athletes.map(a => a.id), ctx.db.acks));
    return json({ available: true, ...buildTaskCompletion(completionTask(task), athletes, rows) });
  }],
  ["GET", new RegExp(`${TEAM}/todo/completion/athletes/([^/]+)$`), (ctx, _req, [athleteId]) => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    if (!canViewCompletion(taskViewerFor(ctx.actor))) return err("Only this team's coaches can view task completion.", 403);
    const athlete = completionAthletes(ctx.db).find(a => a.id === athleteId);
    if (!athlete) return err(COMPLETION_FAILURES.not_found.error, 404, { reason: "not_found" });
    const tasks = activeTasks(ctx.db);
    const rows = toCompletionRows(demoAckStatusRows(tasks, [athlete.id], ctx.db.acks));
    return json({ available: true, ...buildAthleteCompletion(athlete, tasks.map(completionTask), rows) });
  }],
  ["GET", new RegExp(`${TEAM}/todo/family-completion/([^/]+)$`), (ctx, _req, [athleteId]) => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    const viewer = taskViewerFor(ctx.actor);
    if (ctx.actor.kind !== "member" || (viewer !== "athlete" && viewer !== "parent")) {
      return err("Only athletes and their linked parents can view this.", 403);
    }
    const linked = demoAckIdentity(ctx.actor)?.athleteIds ?? [];
    const athlete = completionAthletes(ctx.db).find(a => a.id === athleteId);
    if (!linked.includes(athleteId) || !athlete) return err(COMPLETION_FAILURES.not_found.error, 404, { reason: "not_found" });
    const tasks = activeTasks(ctx.db);
    const rows = toCompletionRows(demoAckStatusRows(tasks, [athlete.id], ctx.db.acks));
    return json({ available: true, ...familyAthleteCompletion(buildAthleteCompletion(athlete, tasks.map(completionTask), rows), visibleAudiences(viewer)) });
  }],
  // todo/completion/export and todo/completion/tasks/[taskId]/export — the real CSV.
  ["GET", new RegExp(`${TEAM}/todo/completion(?:/tasks/([^/]+))?/export$`), (ctx, _req, [taskId]) => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    if (!canViewCompletion(taskViewerFor(ctx.actor))) return err("Only this team's coaches can view task completion.", 403);
    const all = activeTasks(ctx.db);
    const tasks = taskId ? ctx.db.tasks.filter(t => t.id === taskId) : all;
    if (taskId && !tasks.length) return err("Not found.", 404, { reason: "not_found" });
    if (taskId && tasks[0].status !== "active") return err(COMPLETION_FAILURES.inactive.error, 409, { reason: "inactive" });
    const athletes = completionAthletes(ctx.db);
    const inputs = tasks.map(t => {
      const rows = toCompletionRows(demoAckStatusRows([t], athletes.map(a => a.id), ctx.db.acks));
      return { task: completionTask(t), athletes: buildTaskCompletion(completionTask(t), athletes, rows).athletes };
    });
    const filename = completionCsvFilename({
      schoolName: ctx.db.settings.school_name, sportName: ctx.db.settings.sport_name, slug: DEMO_SLUG,
      taskTitle: taskId ? tasks[0].title : null, date: exportDate(ctx.now),
    });
    return {
      text: buildCompletionCsv(buildCompletionCsvRows(inputs)),
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}` },
    };
  }],

  // ── clearance (Resources) — read for everyone, managed by the Head Coach ──
  ["GET", new RegExp(`${TEAM}/clearance$`), ctx => {
    if (ctx.actor.kind === "public") return err("Unauthorized", 401);
    return json({ resources: [...ctx.db.resources].sort((a, b) => a.sort_order - b.sort_order), canManage: isHeadCoach(ctx.actor) });
  }],
  ["POST", new RegExp(`${TEAM}/clearance/upload$`), () => err(PREVIEW_UPLOAD, 503)],
  ["POST", new RegExp(`${TEAM}/clearance$`), (ctx, req) => saveResource(ctx, req, null)],
  ["PATCH", new RegExp(`${TEAM}/clearance/([^/]+)$`), (ctx, req, [rid]) => saveResource(ctx, req, rid)],
  ["DELETE", new RegExp(`${TEAM}/clearance/([^/]+)$`), (ctx, _req, [rid]) => {
    if (!isHeadCoach(ctx.actor)) return err("Only this team's Head Coach can remove Clearance resources.", 403);
    ctx.write(db => ({ ...db, resources: db.resources.filter(r => r.id !== rid) }));
    return json({ ok: true });
  }],
  ["POST", new RegExp(`${TEAM}/clearance/([^/]+)/reorder$`), (ctx, req, [rid]) => {
    if (!isHeadCoach(ctx.actor)) return err("Only this team's Head Coach can reorder Clearance resources.", 403);
    const direction = (req.body as { direction?: unknown } | null)?.direction;
    const list = [...ctx.db.resources].sort((a, b) => a.sort_order - b.sort_order);
    const i = list.findIndex(r => r.id === rid);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < list.length) {
      const a = list[i], b = list[j];
      ctx.write(db => ({ ...db, resources: db.resources.map(r => (r.id === a.id ? { ...r, sort_order: b.sort_order } : r.id === b.id ? { ...r, sort_order: a.sort_order } : r)) }));
    }
    return json({ ok: true });
  }],

  // ── files — the sample documents' contents aren't part of the demo ──
  ["GET", new RegExp(`${TEAM}/files/([^/]+)$`), () => err(PREVIEW_DOCUMENT, 404)],

  // ── shop — staff manage the Gear Gallery ──
  ["PATCH", new RegExp(`${TEAM}/shop/store$`), (ctx, req) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    const body = (req.body ?? {}) as { external_store_url?: string | null; store_provider?: string | null };
    const url = body.external_store_url?.trim() || null;
    if (url && !/^https?:\/\//i.test(url)) return err("Store URL must start with http:// or https://.", 400);
    ctx.write(db => ({ ...db, settings: { ...db.settings, external_store_url: url, store_provider: body.store_provider || null } }));
    return json({ ok: true });
  }],
  ["POST", new RegExp(`${TEAM}/shop/products/image$`), (ctx, req) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    const file = req.body instanceof FormData ? req.body.get("image") : null;
    const url = objectUrlFor(file);
    return url ? json({ url }) : err(PREVIEW_UPLOAD, 503);
  }],
  ["GET", new RegExp(`${TEAM}/shop/products$`), ctx => json(ctx.db.products)],
  ["POST", new RegExp(`${TEAM}/shop/products$`), (ctx, req) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    const b = (req.body ?? {}) as Partial<TeamProductRow>;
    if (!b.name || typeof b.price_cents !== "number" || Number.isNaN(b.price_cents)) return err("Name and price are required.", 400);
    const product: TeamProductRow = {
      id: ctx.nextId(), campaign_slug: DEMO_SLUG, name: b.name, description: b.description ?? null, category: b.category ?? "general",
      price_cents: b.price_cents, cost_cents: b.cost_cents ?? null, image_url: b.image_url ?? null, visible: b.visible ?? true,
      display_order: b.display_order ?? ctx.db.products.length, created_at: ctx.now.toISOString(), variants: [], external_url: b.external_url ?? null,
    };
    ctx.write(db => ({ ...db, products: [...db.products, product] }));
    return json(product);
  }],
  ["PUT", new RegExp(`${TEAM}/shop/products/([^/]+)$`), (ctx, req, [pid]) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    const b = (req.body ?? {}) as Partial<TeamProductRow>;
    if (!ctx.db.products.some(p => p.id === pid)) return err("Product not found.", 404);
    ctx.write(db => ({ ...db, products: db.products.map(p => (p.id === pid ? { ...p, ...b, id: p.id, variants: p.variants } : p)) }));
    return json({ ok: true });
  }],
  ["DELETE", new RegExp(`${TEAM}/shop/products/([^/]+)$`), (ctx, _req, [pid]) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    ctx.write(db => ({ ...db, products: db.products.filter(p => p.id !== pid) }));
    return json({ ok: true });
  }],
  ["POST", new RegExp(`${TEAM}/shop/variants/([^/]+)$`), (ctx, req, [pid]) => {
    if (!isStaff(ctx.actor)) return err("Unauthorized", 403);
    const b = (req.body ?? {}) as { name?: string; price_delta?: number };
    if (!b.name) return err("Variant name is required.", 400);
    const variant = { id: ctx.nextId(), product_id: pid, name: b.name, price_delta: b.price_delta ?? 0 };
    ctx.write(db => ({ ...db, products: db.products.map(p => (p.id === pid ? { ...p, variants: [...p.variants, variant] } : p)) }));
    return json(variant);
  }],

  // ── sponsors — coaches manage Team Sponsors ──
  ["POST", new RegExp(`${TEAM}/sponsors/logo$`), (ctx, req) => {
    if (!isCoachOnly(ctx.actor)) return err("Unauthorized", 403);
    const file = req.body instanceof FormData ? req.body.get("logo") : null;
    const url = objectUrlFor(file);
    return url ? json({ url }) : err(PREVIEW_UPLOAD, 503);
  }],
  ["POST", new RegExp(`${TEAM}/sponsors$`), (ctx, req) => {
    if (!isCoachOnly(ctx.actor)) return err("Unauthorized", 403);
    const b = (req.body ?? {}) as Partial<SponsorRow>;
    if (!b.name || !b.url) return err("Name and URL are required.", 400);
    const sponsor: SponsorRow = {
      id: ctx.nextId(), campaign_slug: DEMO_SLUG, name: b.name, url: b.url, tier: b.tier ?? "gold", logo_url: b.logo_url ?? null,
      description: b.description ?? null, display_order: b.display_order ?? ctx.db.sponsors.length, visible: b.visible ?? true,
      sponsorship_amount_cents: b.sponsorship_amount_cents ?? null, contact_name: b.contact_name ?? null,
      contact_email: b.contact_email ?? null, contact_phone: b.contact_phone ?? null, created_at: ctx.now.toISOString(),
    };
    ctx.write(db => ({ ...db, sponsors: [...db.sponsors, sponsor] }));
    return json(sponsor);
  }],
  ["PUT", new RegExp(`${TEAM}/sponsors/([^/]+)$`), (ctx, req, [sid]) => {
    if (!isCoachOnly(ctx.actor)) return err("Unauthorized", 403);
    const b = (req.body ?? {}) as Partial<SponsorRow>;
    if (!ctx.db.sponsors.some(s => s.id === sid)) return err("Sponsor not found.", 404);
    ctx.write(db => ({ ...db, sponsors: db.sponsors.map(s => (s.id === sid ? { ...s, ...b, id: s.id } : s)) }));
    return json({ ok: true });
  }],
  ["DELETE", new RegExp(`${TEAM}/sponsors/([^/]+)$`), (ctx, _req, [sid]) => {
    if (!isCoachOnly(ctx.actor)) return err("Unauthorized", 403);
    ctx.write(db => ({ ...db, sponsors: db.sponsors.filter(s => s.id !== sid) }));
    return json({ ok: true });
  }],
];

/** clearance POST / PATCH (lib/clearance.ts rules, restated). */
function saveResource(ctx: Ctx, req: DemoRequest, rid: string | null): DemoResponse {
  if (!isHeadCoach(ctx.actor)) return err("Only this team's Head Coach can add Clearance resources.", 403);
  const b = (req.body ?? {}) as { title?: string; description?: string | null; url?: string | null; attachment_id?: string | null };
  const title = b.title?.trim();
  if (!title) return err("Title is required.", 400);
  const url = b.url?.trim() || null;
  const attachment = b.attachment_id ? ctx.db.files.find(f => f.id === b.attachment_id) ?? null : null;
  if (!url && !attachment) return err("Provide a link, an attachment, or both.", 400);
  if (url && !/^https?:\/\//i.test(url)) return err("Links must start with http:// or https://.", 400);
  const fields = { title, description: b.description?.trim() || null, url, attachment_id: attachment?.id ?? null, attachment };
  if (rid) {
    if (!ctx.db.resources.some(r => r.id === rid)) return err("Resource not found.", 404);
    ctx.write(db => ({ ...db, resources: db.resources.map(r => (r.id === rid ? { ...r, ...fields } : r)) }));
    return json({ ok: true, resource: { id: rid, ...fields } });
  }
  const resource: DemoClearanceResource = {
    id: ctx.nextId(), ...fields, sort_order: Math.max(0, ...ctx.db.resources.map(r => r.sort_order)) + 1, created_at: ctx.now.toISOString(),
  };
  ctx.write(db => ({ ...db, resources: [...db.resources, resource] }));
  return json({ ok: true, resource });
}

/** The demo's API for one run of the demo. Like the real server it owns the
 *  records: it starts from `initial` and reports every change through
 *  `onChange` (TeamAppDemo mirrors it into the screens that read it). */
export function createDemoApi(opts: {
  initial: DemoDb;
  actor: () => TeamActor;
  notify: (message: string) => void;
  onChange?: (db: DemoDb) => void;
  now?: () => Date;
}): DemoServer & { db: () => DemoDb } {
  let current = opts.initial;
  const now = opts.now ?? (() => new Date());
  return {
    db: () => current,
    notify: opts.notify,
    handle(req) {
      for (const [method, pattern, handler] of ROUTES) {
        if (method !== req.method) continue;
        const m = pattern.exec(req.path);
        if (!m) continue;
        const ctx: Ctx = {
          db: current,
          actor: opts.actor(),
          now: now(),
          write: fn => { current = fn(current); opts.onChange?.(current); },
          nextId: () => {
            current = { ...current, seq: current.seq + 1 };
            return `00000000-0000-4000-9000-${String(current.seq).padStart(12, "0")}`;
          },
        };
        return handler(ctx, req, m.slice(1).map(x => x ?? ""));
      }
      return null;
    },
  };
}

/** The family members linked to an athlete (getAthleteLinkedMembers). */
export function demoLinkedMembers(athleteId: string) {
  return DEMO_FAMILY_MEMBERS.filter(m => m.athlete_id === athleteId).map(m => ({ id: m.id, name: m.name, role: m.role, athlete_id: m.athlete_id }));
}
