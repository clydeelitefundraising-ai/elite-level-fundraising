import { getTeamSponsors } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { getSchoolAdvertisingSetting } from "@/lib/platform/schoolAdvertising";
import { listActiveCommunityPartners, type ActiveCommunityPartner } from "@/lib/platform/communityPartners";
import PartnersView from "./PartnersView";

// Phase 2.1 — same data fetch as before this phase (no new queries); only
// the rendered component changed, from SponsorsView directly to the new
// PartnersView tab shell, which renders SponsorsView unmodified as its
// "Team Sponsors" tab.
//
// Phase 2.2C — resolves whether THIS school has advertising on, and if so
// fetches the real active partner list. `getCampaignSettings(slug)` is a
// new call on this specific page (it's not fetched here before), but
// costs nothing extra elsewhere — layout.tsx/home/page.tsx already fetch
// it independently for their own needs; nothing here changes their
// behavior. `getSchoolAdvertisingSetting` is called directly (no HTTP
// round-trip to the Phase 2.2B admin API) — same "server component calls
// the service layer directly" pattern the admin Control Center uses; it's
// a plain read of two non-sensitive fields (school_name, a boolean), not
// a privileged write, so no additional auth check is needed here beyond
// this page's own existing getTeamActor()-based access.
export default async function SponsorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [sponsors, actor, settings] = await Promise.all([
    getTeamSponsors(slug),
    getTeamActor(slug),
    getCampaignSettings(slug),
  ]);

  // A campaign with no organization link (never backfilled, or a brand
  // new team not yet assigned to a school) has no shared setting to read
  // — degrades to "advertising off" rather than erroring or guessing.
  const organizationId = settings?.organization_id ?? null;
  const schoolAdvertising = organizationId ? await getSchoolAdvertisingSetting(organizationId) : null;
  const showCommunityPartners = schoolAdvertising?.show_community_partners ?? false;

  // Only fetch the partner list when it could actually be shown — avoids
  // a pointless query for every team at a school with advertising off.
  const activePartners: ActiveCommunityPartner[] = showCommunityPartners
    ? await listActiveCommunityPartners()
    : [];

  return (
    <PartnersView
      slug={slug}
      initialSponsors={sponsors}
      actor={actor}
      showCommunityPartners={showCommunityPartners}
      activePartners={activePartners}
    />
  );
}
