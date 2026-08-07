#!/usr/bin/env node
// One-time bulk calendar-event import for Monroe Valley High School Track and
// Field, 2027 Season (campaign_slug: monroe-valley-track-and-field-2027,
// team_id: 1a22fd17-de3e-47ec-8534-fd084aa70b3e).
//
// Schema discovery (see conversation record): `calendar_events` is a single
// shared table for meets/fundraiser-activities/general dates, discriminated
// by `type` ("practice" | "meet" | "fundraiser" | "team"). It has no
// `end_date`/`all_day` column (multi-day events are represented as one row
// per day) and, as of the phase_a23 migration, a nullable `description`
// column (must be applied to the live DB before a real — non-dry-run —
// import will succeed; PostgREST will reject unknown columns until then).
//
// Auth: the only real event-creation route, POST /api/team/[slug]/events,
// requires a coach/staff session — this script has no coach credentials and
// won't fabricate any. There is also no admin-facing event-creation route.
// Following this repo's own existing precedent for admin-driven
// `calendar_events` writes (src/app/api/admin/campaigns/duplicate/route.ts,
// src/app/api/admin/demo/[slug]/route.ts — both write this table directly
// via the service-role key, gated by the elf_admin cookie), this script logs
// in through the real POST /api/admin/login route as an authorization gate,
// then writes directly to calendar_events with the service-role key. The
// real team route's only additional logic is a trim/default and a type-set
// check (both replicated exactly here) plus a push notification, which is
// intentionally skipped for this bulk historical/demo import (approved).
//
// Idempotency: matches existing rows by (campaign_slug, normalized title,
// event_date, type) — the safest key available, since calendar_events has no
// DB-level uniqueness constraint at all. Exact matches are left untouched.
// If a match exists with the same key but different time/location/
// description, it's reported as a conflict and left unchanged (never
// overwritten).
//
// Audit logging: calendar_events creation has no existing audit-log
// precedent to reuse. Per instruction, this script writes exactly ONE
// summary audit_logs entry after a successful real (non-dry-run) import —
// never during dry runs.
//
// Usage:
//   1. Set ADMIN_PASSWORD (and ADMIN_PEPPER) in .env.local, `npm run dev`.
//   2. Apply supabase/migrations/phase_a23_calendar_event_description.sql
//      in the Supabase SQL editor (required before a REAL import; dry runs
//      work either way since they never write).
//   3. Dry run (no writes):  node scripts/import-monroe-track-events.mjs --dry-run
//   4. Real import:          node scripts/import-monroe-track-events.mjs
//   Optional: APP_BASE=http://localhost:3000 (default) to point at a different origin.

import { readFileSync } from "node:fs";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadEnv(new URL("../.env.local", import.meta.url));
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
const APP_BASE = process.env.APP_BASE || "http://localhost:3000";
const DRY_RUN = process.argv.includes("--dry-run");

if (!SUPA_URL || !SUPA_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const TARGET_SLUG = "monroe-valley-track-and-field-2027";
const TARGET_TEAM_ID = "1a22fd17-de3e-47ec-8534-fd084aa70b3e";
const EXPECTED = { school_name: "Monroe Valley High School", sport_name: "Track and Field", season: "2027 Season" };

const VALID_TYPES = new Set(["practice", "meet", "fundraiser", "team"]);

// ── Event data ───────────────────────────────────────────────────────────
// { title, event_date, event_time, location, type, description }
// event_time "" means all-day / no specific time.
const SEASON_NOTE = "Track and Field competition for the Monroe Valley Falcons' 2027 season.";

const MEETS = [
  { title: "Falcon Icebreaker Invitational", event_date: "2027-02-20", event_time: "8:00 AM – 2:00 PM", location: "Monroe Valley High School",
    description: `${SEASON_NOTE} Meet type: Home. This is also the team's first competition of the season.` },
  { title: "Desert Valley Classic", event_date: "2027-02-27", event_time: "8:00 AM – 2:00 PM", location: "Canyon Ridge High School",
    description: `${SEASON_NOTE} Meet type: Away.` },
  { title: "Eagle Invitational", event_date: "2027-03-06", event_time: "8:00 AM – 2:00 PM", location: "Riverside High School",
    description: `${SEASON_NOTE} Meet type: Away.` },
  { title: "Pioneer Relays", event_date: "2027-03-13", event_time: "8:00 AM – 2:00 PM", location: "Pioneer High School",
    description: `${SEASON_NOTE} Meet type: Away.` },
  { title: "Monroe Spring Classic", event_date: "2027-03-20", event_time: "8:00 AM – 2:00 PM", location: "Monroe Valley High School",
    description: `${SEASON_NOTE} Meet type: Home.` },
  { title: "Copper State Challenge", event_date: "2027-03-27", event_time: "8:00 AM – 3:00 PM", location: "Mesa Stadium",
    description: `${SEASON_NOTE} Meet type: Invitational.` },
  { title: "Desert Sky Dual Meet", event_date: "2027-04-03", event_time: "4:00 PM – 8:00 PM", location: "Desert Sky High School",
    description: `${SEASON_NOTE} Meet type: Away.` },
  { title: "Valley Championships", event_date: "2027-04-10", event_time: "8:00 AM – 3:00 PM", location: "Liberty High School",
    description: `${SEASON_NOTE} Meet type: Championship.` },
  { title: "Regional Qualifier", event_date: "2027-04-17", event_time: "8:00 AM – 3:00 PM", location: "North Valley High School",
    description: `${SEASON_NOTE} Meet type: Postseason.` },
  { title: "State Qualifier", event_date: "2027-04-24", event_time: "8:00 AM – 3:00 PM", location: "Pinnacle High School",
    description: `${SEASON_NOTE} Meet type: Postseason.` },
  { title: "Arizona State Championships (Day 1)", event_date: "2027-05-01", event_time: "8:00 AM – 5:00 PM", location: "Mesa Community College",
    description: `${SEASON_NOTE} Meet type: State Meet. Day 1 of 2 (May 1–2).` },
  { title: "Arizona State Championships (Day 2)", event_date: "2027-05-02", event_time: "8:00 AM – 5:00 PM", location: "Mesa Community College",
    description: `${SEASON_NOTE} Meet type: State Meet. Day 2 of 2 (May 1–2) — final day of the Arizona State Championships.` },
].map(e => ({ ...e, type: "meet" }));

const FUNDRAISER = [
  { title: "Athlete Fundraiser Kickoff Meeting", event_date: "2027-01-10", event_time: "6:00 PM – 7:00 PM", location: "Monroe Valley High School",
    description: "Season launch, athlete expectations, and fundraiser training" },
  { title: "Online Donation Campaign Opens", event_date: "2027-01-12", event_time: "", location: "Online",
    description: "Official opening of the Monroe Valley Track and Field online donation campaign" },
  { title: "Local Sponsor Drive Begins", event_date: "2027-01-15", event_time: "", location: "Community outreach",
    description: "Athletes and supporters begin outreach to local businesses" },
  { title: "Monroe Falcons Team Car Wash", event_date: "2027-01-22", event_time: "9:00 AM – 1:00 PM", location: "Monroe Valley High School parking lot",
    description: "Community car wash supporting the track and field program" },
  { title: "Track and Field Spirit Night", event_date: "2027-01-29", event_time: "5:00 PM – 8:00 PM", location: "Local restaurant partner",
    description: "Restaurant fundraiser supporting the Monroe Valley Falcons" },
  { title: "Corporate Sponsorship Deadline", event_date: "2027-02-05", event_time: "", location: "Online/Admin milestone",
    description: "Deadline for businesses to secure season sponsorship packages" },
  { title: "Youth Speed and Agility Clinic", event_date: "2027-02-12", event_time: "9:00 AM – 12:00 PM", location: "Monroe Valley High School track",
    description: "Youth clinic led by coaches and Monroe Valley athletes" },
  { title: "Falcons Pancake Breakfast", event_date: "2027-02-19", event_time: "8:00 AM – 11:00 AM", location: "Monroe Valley High School cafeteria",
    description: "Booster-supported community breakfast fundraiser" },
  { title: "Team Merchandise Store Opens", event_date: "2027-03-05", event_time: "", location: "Online",
    description: "Launch of the Monroe Valley Track and Field merchandise store" },
  { title: "Social Media Giving Week Begins", event_date: "2027-03-12", event_time: "", location: "Online",
    description: "One-week online fundraising and awareness push (schema has no end-date field — this week-long push runs March 12 through March 18)" },
  { title: "Monroe Valley Alumni Track Meet", event_date: "2027-03-26", event_time: "5:00 PM – 8:00 PM", location: "Monroe Valley High School track",
    description: "Alumni competition and community fundraising event" },
  { title: "Falcons Silent Auction", event_date: "2027-04-02", event_time: "6:00 PM – 8:30 PM", location: "Monroe Valley High School cafeteria",
    description: "Silent auction featuring donated community items and services" },
  { title: "Sponsor Appreciation Night", event_date: "2027-04-16", event_time: "5:30 PM – 7:30 PM", location: "Monroe Valley High School",
    description: "Recognition event for participating business sponsors" },
  { title: "Fundraiser Celebration and Campaign Wrap-Up", event_date: "2027-04-30", event_time: "6:00 PM – 8:00 PM", location: "Monroe Valley High School",
    description: "Fundraising results, sponsor recognition, and campaign closeout" },
].map(e => ({ ...e, type: "fundraiser" }));

const SEASON_DATES = [
  { title: "First Official Practice", event_date: "2027-01-08", event_time: "3:00 PM – 5:30 PM", location: "", type: "practice",
    description: "First official practice for the 2027 Track and Field season" },
  { title: "Parent Information Meeting", event_date: "2027-01-15", event_time: "6:00 PM – 7:00 PM", location: "", type: "team",
    description: "Parent meeting covering season expectations, schedules, travel, communication, and fundraising" },
  { title: "Track and Field Team Photos", event_date: "2027-02-01", event_time: "3:30 PM – 5:00 PM", location: "", type: "team",
    description: "Individual and team photo session" },
  // "First Competition" (2027-02-20) merged into Falcon Icebreaker Invitational's description above — not a separate row.
  { title: "Spring Break — No Practice", event_date: "2027-03-15", event_time: "", location: "", type: "team",
    description: "No scheduled team practice (Spring Break)" },
  { title: "Senior Recognition Day", event_date: "2027-04-24", event_time: "7:30 AM – 8:00 AM", location: "", type: "team",
    description: "Recognition of Monroe Valley Track and Field seniors during the State Qualifier weekend" },
  // "State Championships Final Day" (2027-05-02) merged into Arizona State Championships (Day 2) above — not a separate row.
  { title: "End-of-Season Awards Banquet", event_date: "2027-05-08", event_time: "6:00 PM – 8:30 PM", location: "", type: "team",
    description: "Athlete awards, senior recognition, coach remarks, and season celebration" },
];

const ALL_EVENTS = [...MEETS, ...FUNDRAISER, ...SEASON_DATES];

function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
function matchKey(title, event_date, type) {
  return `${normalize(title)}|${event_date}|${type}`;
}

function sbHeaders(extra = {}) {
  return { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", ...extra };
}

function validateRow(row) {
  const errors = [];
  if (!row.title?.trim()) errors.push("missing title");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.event_date ?? "")) errors.push(`invalid event_date "${row.event_date}"`);
  if (!VALID_TYPES.has(row.type)) errors.push(`invalid type "${row.type}"`);
  return errors;
}

async function resolveTargetCampaign() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(TARGET_SLUG)}&select=campaign_slug,team_id,school_name,sport_name,season,archived,is_demo,status`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`campaign_settings lookup failed: ${await res.text()}`);
  const rows = await res.json();
  if (rows.length !== 1) throw new Error(`Expected exactly 1 campaign for slug "${TARGET_SLUG}", found ${rows.length}. Aborting.`);
  const c = rows[0];
  if (c.school_name !== EXPECTED.school_name || c.sport_name !== EXPECTED.sport_name || c.season !== EXPECTED.season) {
    throw new Error(`Campaign "${TARGET_SLUG}" does not match expected identity (got ${c.school_name} / ${c.sport_name} / ${c.season}). Aborting.`);
  }
  if (c.team_id !== TARGET_TEAM_ID) throw new Error(`team_id mismatch: expected ${TARGET_TEAM_ID}, got ${c.team_id}. Aborting.`);
  if (c.is_demo) throw new Error(`Campaign "${TARGET_SLUG}" is flagged is_demo=true. Aborting.`);
  if (c.archived) throw new Error(`Campaign "${TARGET_SLUG}" is archived. Aborting.`);
  return c;
}

async function getExistingEvents(slug) {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendar_events?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,title,event_date,event_time,location,type`,
    { headers: sbHeaders() },
  );
  if (!res.ok) throw new Error(`calendar_events lookup failed: ${await res.text()}`);
  return res.json();
}

async function adminLogin() {
  if (!ADMIN_PASSWORD) throw new Error("ADMIN_PASSWORD is not set in .env.local — required for the real import run.");
  const res = await fetch(`${APP_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Admin login failed (${res.status}): ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.match(/elf_admin=([^;]+)/)?.[1];
  if (!cookie) throw new Error("No elf_admin cookie in login response.");
  return cookie;
}

async function createEvent(slug, row) {
  const res = await fetch(`${SUPA_URL}/rest/v1/calendar_events`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      title: row.title.trim(),
      event_date: row.event_date,
      event_time: row.event_time ?? "",
      location: row.location ?? "",
      type: row.type,
      description: row.description ?? null,
    }),
  });
  if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
  return (await res.json())[0];
}

async function writeSummaryAuditEntry(totals, byType) {
  const summary =
    `Bulk calendar import for ${TARGET_SLUG} (team ${TARGET_TEAM_ID}): ` +
    `${totals.created} created, ${totals.already_existed} already existed, ${totals.conflict} conflicts, ${totals.failed} failed. ` +
    `By type — meet: ${byType.meet}, fundraiser: ${byType.fundraiser}, practice: ${byType.practice}, team: ${byType.team}. ` +
    `Push notifications were intentionally suppressed for this bulk demo-data import.`;

  const res = await fetch(`${SUPA_URL}/rest/v1/audit_logs`, {
    method: "POST",
    headers: sbHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify({
      action: "calendar.bulk_import",
      entity_type: "calendar_event",
      entity_id: null,
      campaign_slug: TARGET_SLUG,
      summary,
      new_value: {
        campaign_slug: TARGET_SLUG,
        team_id: TARGET_TEAM_ID,
        created: totals.created,
        already_existed: totals.already_existed,
        conflict: totals.conflict,
        failed: totals.failed,
        by_type: byType,
        push_notifications_suppressed: true,
      },
      admin_identifier: "admin",
      ip_address: null,
      user_agent: null,
    }),
  });
  if (!res.ok) console.error(`  (warning) audit_logs insert failed: ${await res.text()}`);
}

async function main() {
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Import target: ${TARGET_SLUG}\n`);

  const campaign = await resolveTargetCampaign();
  console.log(`Resolved campaign: ${campaign.school_name} — ${campaign.sport_name} — ${campaign.season} (team_id=${campaign.team_id}, status=${campaign.status})\n`);

  const existing = await getExistingEvents(TARGET_SLUG);
  const existingByKey = new Map(existing.map(e => [matchKey(e.title, e.event_date, e.type), e]));

  if (!DRY_RUN) await adminLogin(); // authorization gate only — writes go via service-role REST, see header note.

  const results = [];
  const totals = { created: 0, already_existed: 0, conflict: 0, failed: 0 };
  const byType = { meet: 0, fundraiser: 0, practice: 0, team: 0 };

  for (const row of ALL_EVENTS) {
    const errors = validateRow(row);
    if (errors.length > 0) {
      results.push({ label: row.title, event_date: row.event_date, status: "failed", reason: errors.join("; ") });
      totals.failed++;
      continue;
    }

    const key = matchKey(row.title, row.event_date, row.type);
    const match = existingByKey.get(key);
    if (match) {
      const conflicting = (match.event_time ?? "") !== row.event_time || (match.location ?? "") !== (row.location ?? "");
      if (conflicting) {
        results.push({
        label: row.title, event_date: row.event_date, status: "conflict",
          reason: `existing row has event_time="${match.event_time}" location="${match.location}" — differs from spec, left unchanged`,
        });
        totals.conflict++;
      } else {
        results.push({ label: row.title, event_date: row.event_date, status: "already_existed" });
        totals.already_existed++;
      }
      byType[row.type]++;
      continue;
    }

    if (DRY_RUN) {
      results.push({ label: row.title, event_date: row.event_date, status: "would_create" });
      totals.created++;
      byType[row.type]++;
      continue;
    }

    try {
      await createEvent(TARGET_SLUG, row);
      results.push({ label: row.title, event_date: row.event_date, status: "created" });
      totals.created++;
      byType[row.type]++;
    } catch (err) {
      results.push({ label: row.title, event_date: row.event_date, status: "failed", reason: err instanceof Error ? err.message : String(err) });
      totals.failed++;
    }
  }

  console.log("Row-level results:");
  for (const r of results) {
    const bits = [r.status];
    if (r.reason) bits.push(r.reason);
    console.log(`  ${r.event_date ?? ""} ${r.label.padEnd(42)} ${bits.join(" — ")}`);
  }

  console.log("\nTotals:");
  console.log(`  ${DRY_RUN ? "would create" : "created"}: ${totals.created}`);
  console.log(`  already existed: ${totals.already_existed}`);
  console.log(`  conflicts:       ${totals.conflict}`);
  console.log(`  failed:          ${totals.failed}`);
  console.log(`  total rows:      ${ALL_EVENTS.length}`);
  console.log("\nBy type:");
  for (const [t, n] of Object.entries(byType)) console.log(`  ${t}: ${n}`);

  if (!DRY_RUN && totals.failed === 0) {
    await writeSummaryAuditEntry(totals, byType);
    console.log("\nSummary audit_logs entry written.");
  }

  process.exit(totals.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("\nFatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
