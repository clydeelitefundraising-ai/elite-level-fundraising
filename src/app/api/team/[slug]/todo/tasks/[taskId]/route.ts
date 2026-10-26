import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  TaskValidationError,
  canManageTasks,
  canViewTask,
  fileIdsOf,
  taskViewerFor,
  validateTaskInput,
} from "@/lib/teamTasks";
import { filesBelongToTeam, getTask, taskActorIdentity, updateTask } from "@/lib/teamTasksStore";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { failureResponse, ONLY_HEAD_COACH } from "../../_shared";

type RouteContext = { params: Promise<{ slug: string; taskId: string }> };

// GET: one task, if this actor may see it. A task the actor can't see
// (other audience, archived for a non-Head-Coach, other team) is a 404 —
// indistinguishable from a task that doesn't exist.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = taskViewerFor(actor);
  const result = await getTask(slug, taskId);
  if (!result.ok) return failureResponse(result.reason);
  if (!canViewTask(viewer, result.value)) return failureResponse("not_found");
  return NextResponse.json({ task: result.value, canManage: canManageTasks(viewer) });
}

// PATCH: edit a task (title, text, audience, links, documents). Head Coach
// only. Requires the task's current `version` (optimistic concurrency).
// Whether `revision` increases (so Phase 3 acknowledgments of the old
// revision stop counting) is decided by the database, not here — see
// team_task_update()/team_tasks_guard() in phase_t2_team_tasks.sql.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const actor = await getTeamActor(slug);
  if (!canManageTasks(taskViewerFor(actor)) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) {
    return NextResponse.json({ error: ONLY_HEAD_COACH }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const expectedVersion = (body as { expected_version?: unknown }).expected_version;
  if (!Number.isInteger(expectedVersion) || (expectedVersion as number) < 1) {
    return NextResponse.json({ error: "Missing task version. Reload and try again." }, { status: 400 });
  }

  let task;
  try {
    task = validateTaskInput(body);
  } catch (err) {
    if (err instanceof TaskValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const current = await getTask(slug, taskId);
  if (!current.ok) return failureResponse(current.reason);
  if (current.value.status !== "active") return failureResponse("not_active");
  if (current.value.version !== expectedVersion) return failureResponse("conflict");

  const files = await filesBelongToTeam(slug, fileIdsOf(task.resources));
  if (!files.ok) return failureResponse(files.reason);
  if (!files.value) return NextResponse.json({ error: "One or more documents aren't available on this team." }, { status: 400 });

  const identity = await taskActorIdentity(actor);
  const result = await updateTask(slug, taskId, task, { expectedVersion: expectedVersion as number }, identity);
  if (!result.ok) return failureResponse(result.reason);
  const revisionChanged = result.value.revision > current.value.revision;

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "todo_task.updated",
    entity_type: "team_task",
    entity_id: taskId,
    campaign_slug: slug,
    summary: revisionChanged
      ? `Edited To-Do task "${task.title}" on ${slug} (requirements changed — revision ${result.value.revision})`
      : `Edited To-Do task "${task.title}" on ${slug} (no change to requirements)`,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, task: result.value, revisionChanged });
}
