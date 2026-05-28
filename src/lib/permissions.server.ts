// Server-only. Imports next/headers transitively via session helpers.
// Never import this file from a "use client" component.
import { getCoachSession } from "@/lib/teamSession";
import { getMemberSession } from "@/lib/memberSession";
import type { TeamActor } from "@/lib/permissions";

export type { TeamActor } from "@/lib/permissions";
export { canWrite, isHeadCoach, coachSession } from "@/lib/permissions";

/** Resolves which actor is making this request for the given campaign.
 *  Checks coach cookie first, then member cookie. Server-only. */
export async function getTeamActor(slug: string): Promise<TeamActor> {
  const [coach, member] = await Promise.all([
    getCoachSession(slug),
    getMemberSession(slug),
  ]);
  if (coach)  return { kind: "coach",  session: coach  };
  if (member) return { kind: "member", session: member };
  return { kind: "public" };
}
