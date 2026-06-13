// Server-only. Imports next/headers transitively via session helpers.
// Never import this file from a "use client" component.
import { getCoachSession } from "@/lib/teamSession";
import { getMemberSession } from "@/lib/memberSession";
import { getAccountSession, getActorForAccount } from "@/lib/accountSession";
import type { TeamActor } from "@/lib/permissions";

export type { TeamActor } from "@/lib/permissions";
export { isStaff, isHeadCoach, isMember, coachSession, isHeadCoachRole, staffRoleLabel, canWrite } from "@/lib/permissions";

/** Resolves which actor is making this request for the given campaign.
 *
 * Priority: elf_session (global account) > member cookie > coach cookie > public.
 *
 * elf_session is the Phase 21+ global identity layer. Legacy per-team cookies
 * remain active as fallback for users who joined before Phase 21.
 * getAccountSession is memoized per-request via React.cache so calling it
 * here and in the layout incurs only one DB round-trip.
 */
export async function getTeamActor(slug: string): Promise<TeamActor> {
  const account = await getAccountSession();
  if (account) {
    const actor = await getActorForAccount(slug, account);
    if (actor) return actor;
  }

  const [coach, member] = await Promise.all([
    getCoachSession(slug),
    getMemberSession(slug),
  ]);
  if (member) return { kind: "member", session: member };
  if (coach)  return { kind: "coach",  session: coach  };
  return { kind: "public" };
}
