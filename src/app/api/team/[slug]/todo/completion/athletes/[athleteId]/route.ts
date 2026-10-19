import { NextRequest } from "next/server";
import { loadAthleteCompletion } from "@/lib/teamTaskCompletionStore";
import { completionFailure, completionResponse, denyUnlessCompletionViewer } from "../../_shared";

type RouteContext = { params: Promise<{ slug: string; athleteId: string }> };

// Phase 3C: GET — one athlete on this team: every active task's
// applicable requirements (state and date only). Coaches and platform
// admins only.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, athleteId } = await params;
  const denied = await denyUnlessCompletionViewer(slug);
  if (denied) return denied;

  const result = await loadAthleteCompletion(slug, athleteId);
  if (!result.ok) return completionFailure(result.reason);
  return completionResponse(result.value);
}
