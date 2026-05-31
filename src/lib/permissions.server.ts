// Server-only. Imports next/headers transitively via session helpers.
// Never import this file from a "use client" component.
import { getCoachSession } from "@/lib/teamSession";
import { getMemberSession } from "@/lib/memberSession";
import type { TeamActor } from "@/lib/permissions";

export type { TeamActor } from "@/lib/permissions";
export { canWrite, isHeadCoach, coachSession } from "@/lib/permissions";

/** Resolves which actor is making this request for the given campaign.
 *
 * Priority: member > coach > public.
 *
 * Member wins when both cookies are present for the same slug. The join
 * flow (/join/[code]) is an explicit "I am joining as athlete/parent"
 * action and must not be silently overridden by a stale coach cookie.
 * A coach who has NOT used the join flow has no team_member cookie and
 * continues to resolve as coach. A coach who wants to restore coach
 * access after joining can log in again at /coach-login.
 */
export async function getTeamActor(slug: string): Promise<TeamActor> {
  const [coach, member] = await Promise.all([
    getCoachSession(slug),
    getMemberSession(slug),
  ]);
  if (member) return { kind: "member", session: member };
  if (coach)  return { kind: "coach",  session: coach  };
  return { kind: "public" };
}
