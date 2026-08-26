// Server-only. Imports next/headers transitively via session helpers.
// Never import this file from a "use client" component.
import { redirect } from "next/navigation";
import { getCoachSession } from "@/lib/teamSession";
import { getMemberSession } from "@/lib/memberSession";
import { getAccountSession, getActorForAccount } from "@/lib/accountSession";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import type { TeamActor } from "@/lib/permissions";

export type { TeamActor } from "@/lib/permissions";
export { isStaff, isHeadCoach, isCoachOnly, isMember, isPlatformAdmin, coachSession, isHeadCoachRole, staffRoleLabel, canWrite } from "@/lib/permissions";

/** Resolves which actor is making this request for the given campaign.
 *
 * Priority: platform admin > elf_session (global account) > member cookie
 * > coach cookie > public.
 *
 * Platform admin resolves first and unconditionally — an authorized ELF
 * employee gets Head-Coach-equivalent access to every team under their own
 * identity even if they also happen to hold a team_coaches/team_members row
 * somewhere (e.g. an employee who is also a booster on their kid's team):
 * platform-admin status must never be shadowed by a narrower per-team role.
 * This never fabricates a head_coach role in session data — it's a
 * distinct TeamActor kind, resolved from the platform_admins table, not
 * team_coaches.
 *
 * elf_session is the Phase 21+ global identity layer. Legacy per-team cookies
 * remain active as fallback for users who joined before Phase 21.
 * getAccountSession/getPlatformAdminSession are memoized per-request via
 * React.cache so calling them here and in a layout incurs only one DB
 * round-trip each.
 */
export async function getTeamActor(slug: string): Promise<TeamActor> {
  const platformAdmin = await getPlatformAdminSession();
  if (platformAdmin) {
    return {
      kind: "platform_admin",
      session: { ...platformAdmin, campaign_slug: slug },
    };
  }

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
export type AuthedTeamActor = Extract<TeamActor, { kind: "coach" | "member" | "platform_admin" }>;

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
