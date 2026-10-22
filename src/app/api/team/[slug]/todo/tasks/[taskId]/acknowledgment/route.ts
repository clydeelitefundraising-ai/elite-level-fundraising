import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canViewTask, taskViewerFor } from "@/lib/teamTasks";
import { getTask } from "@/lib/teamTasksStore";
import { allChildrenNamed, buildAckView, normalizeAckName, requirementsFor, sameAthleteSet, type AckIdentity } from "@/lib/teamTaskAcks";
import {
  getAckStatus,
  getAthleteNamesStrict,
  resolveAckIdentity,
  submitAcknowledgment,
  type AckFailure,
} from "@/lib/teamTaskAcksStore";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { failureResponse } from "../../../_shared";

type RouteContext = { params: Promise<{ slug: string; taskId: string }> };

// Team Management Phase 3 — an athlete's or parent's acknowledgment of one
// task. Identity, role and linked athletes are derived on the server from
// the signed session (resolveAckIdentity); the browser only sends the
// revision it reviewed, the typed name, the checkbox, and the athletes it
// was shown (checked against the server's own list, never trusted). The
// database function re-checks everything in one transaction.

type AckErrorReason = AckFailure | "names_unavailable" | "already_satisfied" | "children_changed" | "not_confirmed" | "invalid_request";

const ACK_ERRORS: Record<AckErrorReason, { status: number; error: string }> = {
  unavailable:       { status: 503, error: "Acknowledgments are temporarily unavailable. Please try again." },
  names_unavailable: { status: 503, error: "Acknowledgments are temporarily unavailable. Please try again." },
  not_found:         { status: 404, error: "Task not found." },
  inactive:          { status: 409, error: "This task is no longer active." },
  not_required:      { status: 400, error: "This task doesn't need your acknowledgment." },
  revision_changed:  { status: 409, error: "This task was updated. Please review the changes and acknowledge again." },
  not_eligible:      { status: 403, error: "You can't acknowledge this task for these athletes. If your family links changed, reload and try again." },
  invalid_name:      { status: 400, error: "Enter your full name (2–120 characters)." },
  error:             { status: 500, error: "Something went wrong. Please try again." },
  already_satisfied: { status: 409, error: "This task is already acknowledged for the current version." },
  children_changed:  { status: 409, error: "The athletes this acknowledgment covers have changed. Please review and submit again." },
  not_confirmed:     { status: 400, error: "Check the acknowledgment box to continue." },
  invalid_request:   { status: 400, error: "Invalid request." },
};

function ackError(reason: AckErrorReason, extra?: Record<string, unknown>) {
  const { status, error } = ACK_ERRORS[reason];
  return NextResponse.json({ error, reason, ...extra }, { status });
}

/** The task (if this actor may see it) and the actor's acknowledgment
 *  identity, or an early response. */
async function load(slug: string, taskId: string) {
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const task = await getTask(slug, taskId);
  if (!task.ok) return { response: failureResponse(task.reason) };
  if (!canViewTask(taskViewerFor(actor), task.value)) return { response: failureResponse("not_found") };

  let identity: AckIdentity | null;
  try {
    identity = await resolveAckIdentity(actor, slug);
  } catch (err) {
    console.error("[todo/acknowledgment] identity lookup failed:", err);
    return { response: ackError("error") };
  }
  return { actor, task: task.value, identity };
}

async function viewFor(slug: string, task: { id: string; revision: number; audience: string; status: string }, identity: AckIdentity | null) {
  if (!identity || task.status !== "active" || !requirementsFor(task.audience).includes(identity.requirement)) {
    return { ok: true as const, view: null };
  }
  const status = await getAckStatus(slug, identity.athleteIds, [task.id]);
  if (!status.ok) return { ok: false as const, reason: status.reason };
  // Names for exactly the server-verified children in the view. If any
  // can't be resolved there is no view (and so no form or submission) —
  // never a generic "Athlete" in the coverage statement.
  const childIds = buildAckView(task, identity, status.value, new Map())?.children.map(c => c.athleteId) ?? [];
  let names: Map<string, string>;
  try {
    names = await getAthleteNamesStrict(slug, childIds);
  } catch (err) {
    console.error("[todo/acknowledgment] athlete names unavailable:", err);
    return { ok: false as const, reason: "names_unavailable" as const };
  }
  const view = buildAckView(task, identity, status.value, names);
  if (view && !allChildrenNamed(view)) return { ok: false as const, reason: "names_unavailable" as const };
  return { ok: true as const, view };
}

// GET: what this athlete/parent sees for the task — per child and
// requirement, done or outstanding, and who the form would cover. null
// for anyone the task doesn't ask (coaches, boosters, other audience).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const loaded = await load(slug, taskId);
  if ("response" in loaded) return loaded.response;

  const result = await viewFor(slug, loaded.task, loaded.identity);
  if (!result.ok) {
    if (result.reason === "unavailable") return NextResponse.json({ available: false, acknowledgment: null });
    return ackError(result.reason);
  }
  return NextResponse.json({ available: true, acknowledgment: result.view });
}

// POST { expected_revision, full_name, confirmed: true, athlete_ids }
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return ackError("invalid_request");

  const loaded = await load(slug, taskId);
  if ("response" in loaded) return loaded.response;
  const { task, identity } = loaded;

  if (!identity) {
    return NextResponse.json({ error: "Only athletes and their linked parents can acknowledge tasks.", reason: "not_eligible" }, { status: 403 });
  }
  if (task.status !== "active") return ackError("inactive");
  if (!requirementsFor(task.audience).includes(identity.requirement)) return ackError("not_required");

  const expectedRevision = body.expected_revision;
  const shown = body.athlete_ids;
  if (!Number.isInteger(expectedRevision) || !Array.isArray(shown) || !shown.every(id => typeof id === "string")) {
    return ackError("invalid_request");
  }
  const fullName = normalizeAckName(body.full_name);
  if (!fullName) return ackError("invalid_name");
  if (body.confirmed !== true) return ackError("not_confirmed");

  const current = await viewFor(slug, task, identity);
  if (!current.ok) return ackError(current.reason);
  const view = current.view;
  if (expectedRevision !== task.revision) return ackError("revision_changed", { acknowledgment: view });
  if (!view || view.children.length === 0) return ackError("not_eligible");
  if (view.outstandingAthleteIds.length === 0) return ackError("already_satisfied", { acknowledgment: view });
  // The browser must have shown exactly the athletes this would cover now.
  if (!sameAthleteSet(shown as string[], view.outstandingAthleteIds)) return ackError("children_changed", { acknowledgment: view });

  const result = await submitAcknowledgment({
    slug,
    taskId: task.id,
    expectedRevision: task.revision,
    identity,
    athleteIds: view.outstandingAthleteIds,
    fullName,
  });
  if (!result.ok) {
    const fresh = await viewFor(slug, task, identity);
    return ackError(result.reason, { acknowledgment: fresh.ok ? fresh.view : null });
  }

  const recorded = result.value.filter(r => r.outcome === "recorded");
  const after = await viewFor(slug, task, identity);
  const acknowledgment = after.ok ? after.view : null;
  if (recorded.length === 0) return ackError("already_satisfied", { acknowledgment });

  logAuditEvent({
    actor: { type: "member", id: identity.memberId, name: identity.memberName },
    action: "todo_task.acknowledged",
    entity_type: "team_task",
    entity_id: task.id,
    campaign_slug: slug,
    summary: `Acknowledged "${task.title}" as ${identity.requirement} for ${recorded.length} athlete${recorded.length === 1 ? "" : "s"}`,
    new_value: {
      revision: task.revision,
      requirement: identity.requirement,
      athlete_ids: recorded.map(r => r.athlete_id),
      acknowledgment_ids: recorded.map(r => r.acknowledgment_id),
    },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, recorded: recorded.length, acknowledgment });
}
