import { NextRequest } from "next/server";
import { loadTaskCompletion } from "@/lib/teamTaskCompletionStore";
import { completionFailure, completionResponse, denyUnlessCompletionViewer } from "../../_shared";

type RouteContext = { params: Promise<{ slug: string; taskId: string }> };

// Phase 3C: GET — one active task on this team: each athlete's athlete
// and/or parent requirement (state and date only). Coaches and platform
// admins only.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, taskId } = await params;
  const denied = await denyUnlessCompletionViewer(slug);
  if (denied) return denied;

  const result = await loadTaskCompletion(slug, taskId);
  if (!result.ok) return completionFailure(result.reason);
  return completionResponse(result.value);
}
