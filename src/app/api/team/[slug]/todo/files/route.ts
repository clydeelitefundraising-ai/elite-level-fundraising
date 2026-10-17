import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageTasks, taskViewerFor } from "@/lib/teamTasks";
import { listTeamFilesForPicker } from "@/lib/teamTasksStore";
import { failureResponse, ONLY_HEAD_COACH } from "../_shared";

type RouteContext = { params: Promise<{ slug: string }> };

// GET: this team's existing files, for "attach an existing document" in the
// task form. Head Coach only; returns metadata only (downloads still go
// through the existing authenticated /api/team/[slug]/files/[id] route).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageTasks(taskViewerFor(actor))) return NextResponse.json({ error: ONLY_HEAD_COACH }, { status: 403 });

  const result = await listTeamFilesForPicker(slug);
  if (!result.ok) return failureResponse(result.reason);
  return NextResponse.json({ files: result.value });
}
