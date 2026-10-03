import { redirect } from "next/navigation";
import { getTeamActor } from "@/lib/permissions.server";
import { getAccountSession } from "@/lib/accountSession";
import { getFamilyAthleteIdsForAccount } from "@/lib/familyRelationships";
import { getVisiblePendingRequestsForAccount } from "@/lib/platform/parentAccessRequests";
import { getTeamAthletes } from "@/lib/teamData";
import { computeFamilyStatus } from "./familyStatus";
import FamilyView from "./FamilyView";

export const dynamic = "force-dynamic";

// Family Relationships Phase D — "My Athletes". Reachable by any
// authenticated account with standing on this team (member OR coach — a
// Head Coach/Assistant Coach who is also a parent needs this exactly as
// much as any other parent). Entirely account-based, not actor-kind-based:
// getTeamActor() here answers ONLY "does this account belong to this team
// at all" (never "member" vs "coach"), and getAccountSession() is the sole
// source of the account_id used for every family lookup below — never
// actor.session.id, which for a coach-kind actor carries no account_id at
// all (see accountSession.ts's toCoachActor).
export default async function FamilyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const actor = await getTeamActor(slug);
  if (actor.kind === "public") redirect(`/team/${slug}/login`);

  // A legacy team_coach/team_member-cookie-only session (no elf_session) has
  // no account_id to resolve family data with — this account-based feature
  // isn't available to it, the same limitation Phase C2 already has.
  const account = await getAccountSession();
  if (!account) redirect(`/team/${slug}/login`);

  const [linkedIds, pendingRequests, roster] = await Promise.all([
    getFamilyAthleteIdsForAccount(account.id, slug),
    getVisiblePendingRequestsForAccount(account.id),
    getTeamAthletes(slug),
  ]);

  // getVisiblePendingRequestsForAccount() is NOT campaign-scoped — it
  // answers "every team this account has ever requested on" (used by
  // /teams for exactly that cross-team view). Filter to THIS team's pending
  // requests only, so a parent linked to Jake on Football never sees that
  // request bleed into Track's My Athletes page.
  const pendingIds = pendingRequests
    .filter(r => r.campaign_slug === slug && r.status === "pending")
    .map(r => r.athlete_id);

  const rosterForStatus = roster.map(a => ({ id: a.id, name: a.name, event: a.event }));
  const { linked, pending, searchable } = computeFamilyStatus(rosterForStatus, linkedIds, pendingIds);

  return (
    <FamilyView
      slug={slug}
      linked={linked}
      pending={pending}
      searchable={searchable}
    />
  );
}
