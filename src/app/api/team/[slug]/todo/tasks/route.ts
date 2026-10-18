import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  TaskValidationError,
  canManageTasks,
  canViewArchived,
  fileIdsOf,
  taskViewerFor,
  validateTaskInput,
  visibleAudiences,
} from "@/lib/teamTasks";
import { createTask, filesBelongToTeam, listTasks, taskActorIdentity } from "@/lib/teamTasksStore";
import { ackRowStatus, buildAckView } from "@/lib/teamTaskAcks";
import { getAckStatus, resolveAckIdentity } from "@/lib/teamTaskAcksStore";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { failureResponse, ONLY_HEAD_COACH } from "../_shared";

type RouteContext = { params: Promise<{ slug: string }> };

// GET: the tasks this actor may see on this team.
//   Head Coach / platform admin — every audience; ?status=archived for the archive.
//   Assistant Coach — every audience, active only, read-only.
//   Athlete — Athlete + Both. Parent — Parent + Both. Booster — none.
// While the task tables aren't migrated yet this returns
// { available: false, tasks: [] } (200) so the To-Do tab still renders its
// Resources section; any other database failure is a real 500.
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = taskViewerFor(actor);
  const wantArchived = req.nextUrl.searchParams.get("status") === "archived";
  if (wantArchived && !canViewArchived(viewer)) {
    return NextResponse.json({ error: ONLY_HEAD_COACH }, { status: 403 });
  }

  const result = await listTasks(slug, {
    status: wantArchived ? "archived" : "active",
    audiences: visibleAudiences(viewer),
  });
  if (!result.ok) {
    if (result.reason === "unavailable") {
      return NextResponse.json({ available: false, tasks: [], canManage: false, viewer });
    }
    return failureResponse(result.reason);
  }
  const tasks = viewer === "athlete" || viewer === "parent"
    ? await withAckRowStatus(actor, slug, result.value)
    : result.value;
  return NextResponse.json({ available: true, tasks, canManage: canManageTasks(viewer), viewer });
}

// Phase 3: each task's row icon for an athlete or parent — "done" when
// their acknowledgment requirement is met for every linked athlete, "todo"
// otherwise. Best-effort: if the status can't be read, the list still
// loads, just without icons.
async function withAckRowStatus<T extends { id: string; revision: number; audience: string }>(
  actor: Parameters<typeof resolveAckIdentity>[0],
  slug: string,
  tasks: T[],
): Promise<(T & { my_ack: "done" | "todo" | null })[]> {
  const none = tasks.map(t => ({ ...t, my_ack: null }));
  if (tasks.length === 0) return none;
  try {
    const identity = await resolveAckIdentity(actor, slug);
    if (!identity) return none;
    const status = await getAckStatus(slug, identity.athleteIds, tasks.map(t => t.id));
    if (!status.ok) return none;
    return tasks.map(t => ({ ...t, my_ack: ackRowStatus(buildAckView(t, identity, status.value, new Map())) }));
  } catch (err) {
    console.error("[todo/tasks] acknowledgment status failed:", err);
    return none;
  }
}

// POST: create a task. Head Coach (or platform admin) only — enforced here,
// never trusted from the client.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageTasks(taskViewerFor(actor)) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) {
    return NextResponse.json({ error: ONLY_HEAD_COACH }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  let task;
  try {
    task = validateTaskInput(body);
  } catch (err) {
    if (err instanceof TaskValidationError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const files = await filesBelongToTeam(slug, fileIdsOf(task.resources));
  if (!files.ok) return failureResponse(files.reason);
  if (!files.value) return NextResponse.json({ error: "One or more documents aren't available on this team." }, { status: 400 });

  const identity = await taskActorIdentity(actor);
  const result = await createTask(slug, task, identity);
  if (!result.ok) return failureResponse(result.reason);

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "todo_task.created",
    entity_type: "team_task",
    entity_id: result.value.id,
    campaign_slug: slug,
    summary: `Added To-Do task "${task.title}" (${task.audience}) on ${slug}`,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, task: result.value });
}
