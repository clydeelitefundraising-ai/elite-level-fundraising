import { NextRequest } from "next/server";
import { loadTaskCompletion } from "@/lib/teamTaskCompletionStore";
import { denyUnlessCompletionViewer } from "../../../_shared";
import { completionCsvResponse, exportFailure } from "../../../export/csvResponse";

type RouteContext = { params: Promise<{ slug: string; taskId: string }> };

// Phase 4: GET — CSV of one active task's completion for every athlete on
// the roster. Head Coach, Assistant Coach and platform admins only.
// Another team's task or a malformed id is 404; an archived task is 409.
// Read-only; returns text/csv only for a fully verified report.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const denied = await denyUnlessCompletionViewer(slug);
  if (denied) return denied;

  const result = await loadTaskCompletion(slug, taskId);
  if (!result.ok) return exportFailure(result.reason);
  const { summary, athletes } = result.value;
  return completionCsvResponse(slug, [{ task: summary.task, athletes }], summary.task.title);
}
