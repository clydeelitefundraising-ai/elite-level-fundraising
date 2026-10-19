import { NextRequest } from "next/server";
import { loadTeamCompletionExport } from "@/lib/teamTaskCompletionStore";
import { denyUnlessCompletionViewer } from "../_shared";
import { completionCsvResponse, exportFailure } from "./csvResponse";

type RouteContext = { params: Promise<{ slug: string }> };

// Phase 4: GET — CSV of every active task's completion for every athlete
// on the roster (one row per athlete per task). Head Coach, Assistant
// Coach and platform admins only. Read-only; returns text/csv only for a
// fully verified report, otherwise a JSON error.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const denied = await denyUnlessCompletionViewer(slug);
  if (denied) return denied;

  const result = await loadTeamCompletionExport(slug);
  if (!result.ok) return exportFailure(result.reason);
  return completionCsvResponse(slug, result.value.tasks.map(t => ({ task: t.summary.task, athletes: t.athletes })));
}
