import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { taskViewerFor, visibleAudiences } from "@/lib/teamTasks";
import { resolveAckIdentity } from "@/lib/teamTaskAcksStore";
import { familyAthleteCompletion } from "@/lib/teamTaskCompletion";
import { loadAthleteCompletion } from "@/lib/teamTaskCompletionStore";
import { completionFailure, completionResponse } from "../../completion/_shared";

type RouteContext = { params: Promise<{ slug: string; athleteId: string }> };

// Phase 3C (family): GET — an athlete's or parent's view of To-Do task
// completion for ONE athlete they are linked to, for the family athlete
// profile (/team/[slug]/athlete/[id]). Separate from the coach-only
// /todo/completion routes, which stay coach-only.
//
//  - Identity comes from the signed session only (resolveAckIdentity, the
//    same strict Phase 3B lookup the acknowledgment form uses): an
//    athlete's own roster athlete; a parent's CURRENT links — legacy
//    athlete_id and team_member_athletes (second/later children). A
//    failed lookup is a failure, never "no children".
//  - Only athlete and parent members. Coaches (including coach-parents)
//    use the coach view; boosters and everyone else are refused.
//  - Any athlete outside those links — another family's child, another
//    team's athlete, an unlinked child — is "not found".
//  - Data: the same strict, paged, verified per-athlete completion the
//    coach view uses, limited to the tasks this viewer can see in their
//    To-Do List. Requirement, state and date only — never typed names,
//    member names or ids.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, athleteId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = taskViewerFor(actor);
  if (actor.kind !== "member" || (viewer !== "athlete" && viewer !== "parent")) {
    return NextResponse.json({ error: "Only athletes and their linked parents can view this." }, { status: 403 });
  }

  let linked: string[];
  try {
    linked = (await resolveAckIdentity(actor, slug))?.athleteIds ?? [];
  } catch (err) {
    console.error("[todo/family-completion] identity lookup failed:", err);
    return completionFailure("error");
  }
  if (!linked.includes(athleteId)) return completionFailure("not_found");

  const result = await loadAthleteCompletion(slug, athleteId); // also checks the athlete is on this team
  if (!result.ok) return completionFailure(result.reason);
  return completionResponse(familyAthleteCompletion(result.value, visibleAudiences(viewer)));
}
