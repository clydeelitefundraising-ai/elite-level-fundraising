import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageTasks, taskViewerFor } from "@/lib/teamTasks";
import { setTaskArchived, taskActorIdentity } from "@/lib/teamTasksStore";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { failureResponse, ONLY_HEAD_COACH } from "../../../_shared";

type RouteContext = { params: Promise<{ slug: string; taskId: string }> };

// POST { archived: true | false }: archive or restore a task. Head Coach
// only. There is deliberately no delete endpoint — archived tasks are kept
// for history and (from Phase 3) acknowledgment integrity.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const actor = await getTeamActor(slug);
  if (!canManageTasks(taskViewerFor(actor)) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) {
    return NextResponse.json({ error: ONLY_HEAD_COACH }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const archived = body?.archived;
  if (typeof archived !== "boolean") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const identity = await taskActorIdentity(actor);
  const result = await setTaskArchived(slug, taskId, archived, identity);
  if (!result.ok) return failureResponse(result.reason);

  logAuditEvent({
    actor: toAuditActor(actor),
    action: archived ? "todo_task.archived" : "todo_task.restored",
    entity_type: "team_task",
    entity_id: taskId,
    campaign_slug: slug,
    summary: `${archived ? "Archived" : "Restored"} a To-Do task on ${slug}`,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
