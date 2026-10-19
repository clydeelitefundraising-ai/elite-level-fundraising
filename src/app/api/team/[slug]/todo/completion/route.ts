import { NextRequest } from "next/server";
import { loadTeamCompletion } from "@/lib/teamTaskCompletionStore";
import { completionFailure, completionResponse, denyUnlessCompletionViewer } from "./_shared";

type RouteContext = { params: Promise<{ slug: string }> };

// Phase 3C: GET — every active task's completion counts for the whole
// roster (counts only, no names). Coaches and platform admins only.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const denied = await denyUnlessCompletionViewer(slug);
  if (denied) return denied;

  const result = await loadTeamCompletion(slug);
  if (!result.ok) return completionFailure(result.reason);
  return completionResponse(result.value);
}
