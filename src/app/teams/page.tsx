import { redirect } from "next/navigation";
import { getAccountSession, getAccountTeams } from "@/lib/accountSession";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { getVisiblePendingRequestsForAccount as getVisiblePendingAthleteRequests } from "@/lib/platform/athleteRequests";
import { getVisiblePendingRequestsForAccount as getVisiblePendingParentRequests } from "@/lib/platform/parentAccessRequests";
import { getCampaign } from "@/lib/platform/campaigns";
import { entryPhotoForOffset, ENTRY_PHOTO_OFFSET } from "@/components/auth/entryPhotos";
import TeamsView, { type PendingTeamCard } from "./TeamsView";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const session = await getAccountSession();
  if (!session) redirect("/login");

  // Platform-admin landing takes precedence over the normal Team Selector,
  // even for an account that also happens to be a coach/parent/booster/
  // athlete somewhere — matches the precedence rule enforced by
  // resolveAuthenticatedLandingPath()/getTeamActor() elsewhere. A direct
  // visit to /teams (bookmark, back button, etc.) must not show the
  // selector to a platform admin.
  const platformAdmin = await getPlatformAdminSession();
  if (platformAdmin) redirect("/platform-admin/schools");

  const [teams, pendingAthleteRequests, pendingParentRequests] = await Promise.all([
    getAccountTeams(session.id),
    getVisiblePendingAthleteRequests(session.id),
    getVisiblePendingParentRequests(session.id),
  ]);

  const athleteCards = await Promise.all(
    pendingAthleteRequests.map(async (request) => {
      const campaign = await getCampaign(request.campaign_slug);
      if (!campaign) return null;
      return {
        campaign_slug:  request.campaign_slug,
        school_name:    campaign.school_name,
        sport_name:     campaign.sport_name,
        status:         request.status as "pending" | "declined",
        created_at:     request.created_at,
        decline_reason: request.decline_reason,
      };
    }),
  );

  const parentCards = await Promise.all(
    pendingParentRequests.map(async (request) => {
      const campaign = await getCampaign(request.campaign_slug);
      if (!campaign) return null;
      return {
        campaign_slug:  request.campaign_slug,
        school_name:    campaign.school_name,
        sport_name:     campaign.sport_name,
        status:         request.status as "pending" | "declined",
        created_at:     request.created_at,
        decline_reason: request.decline_reason,
        // Distinguishes this card as a parent-child access request rather
        // than an athlete self-registration request.
        note: `Requesting access as parent of ${request.athlete_name}`,
      };
    }),
  );

  const pendingCards: PendingTeamCard[] = [...athleteCards, ...parentCards]
    .filter((c): c is PendingTeamCard => c !== null);

  // Always show the selector, even with exactly one team — keeps the flow
  // consistent and gives users a visible way to add another team (dual-sport
  // athletes, multi-team coaches, parents with kids on different teams).
  return (
    <TeamsView
      teams={teams}
      pendingCards={pendingCards}
      accountName={session.name}
      photo={entryPhotoForOffset(ENTRY_PHOTO_OFFSET.teams)}
    />
  );
}
