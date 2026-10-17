import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageTasks, taskViewerFor } from "@/lib/teamTasks";
import { moveTask } from "@/lib/teamTasksStore";
import { failureResponse, ONLY_HEAD_COACH } from "../../../_shared";

type RouteContext = { params: Promise<{ slug: string; taskId: string }> };

// POST { direction: "up" | "down" }: move an active task one place.
// Head Coach only. Changes display order only — never the task's revision
// (so it can't invalidate acknowledgments) or its edit version.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageTasks(taskViewerFor(actor))) return NextResponse.json({ error: ONLY_HEAD_COACH }, { status: 403 });

  const body = await req.json().catch(() => null);
  const direction = body?.direction;
  if (direction !== "up" && direction !== "down") {
    return NextResponse.json({ error: "Direction must be up or down." }, { status: 400 });
  }

  const result = await moveTask(slug, taskId, direction);
  if (!result.ok) return failureResponse(result.reason);
  return NextResponse.json({ ok: true });
}
