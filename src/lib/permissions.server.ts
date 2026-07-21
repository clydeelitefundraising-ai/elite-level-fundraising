// Server-only. Imports next/headers transitively via session helpers.
// Never import this file from a "use client" component.
import { redirect } from "next/navigation";
import { getCoachSession } from "@/lib/teamSession";
import { getMemberSession } from "@/lib/memberSession";
import { getAccountSession, getActorForAccount } from "@/lib/accountSession";
import type { TeamActor } from "@/lib/permissions";

export type { TeamActor } from "@/lib/permissions";
export { isStaff, isHeadCoach, isCoachOnly, isMember, coachSession, isHeadCoachRole, staffRoleLabel, canWrite } from "@/lib/permissions";

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

/** Narrowed actor type once `requireTeamMembership` has ruled out "public". */
export type AuthedTeamActor = Extract<TeamActor, { kind: "coach" | "member" }>;

/** Guard for team-hub pages that are not meant for anonymous/public
 *  browsing (Home, Communications, Team roster — as opposed to Fundraiser
 *  or the athlete donor profile, which intentionally support public
 *  visitors and must keep working unauthenticated).
 *
 *  - No account/session at all              -> redirect to /login
 *  - Logged in, but not a member of `slug`   -> redirect to /teams
 *  - Otherwise                               -> returns the resolved actor
 */
export async function requireTeamMembership(slug: string): Promise<AuthedTeamActor> {
  const actor = await getTeamActor(slug);
  if (actor.kind !== "public") return actor;

  const account = await getAccountSession();
  if (account) redirect("/teams");
  redirect("/login");
}
