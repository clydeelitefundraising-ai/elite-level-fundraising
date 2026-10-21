import { getAnnouncements, getCalendarEvents, getDonationStats, getTeamFundraiserSummary } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getCampaignSettings } from "@/lib/supabase";
import { isAthleteFundraisingVisible } from "@/lib/fundraiserAccess";
import { getPendingRequestSummary } from "@/lib/platform/requests";
import { getDisplayGoalCents } from "@/lib/platform/donations";
import { getSchoolAdvertisingSetting } from "@/lib/platform/schoolAdvertising";
import { listActiveCommunityPartnersForGrid, listAllLockedPositions, listFeaturedCommunityPartners } from "@/lib/platform/communityPartners";
import { resolveGridSlots, getUtcDayTick, pickFeaturedPartner, type GridSlot, type FeaturedPartner } from "@/lib/platform/communityPartnerRotation";
import HomeView from "./HomeView";

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Home is not a public-facing route (unlike Fundraiser/athlete donor
  // pages) — gate it to logged-in members of this team.
  const actor = await requireTeamMembership(slug);
  // Head-Coach-only. Phase 3B-2: the Home badge now reflects the FULL
  // Requests total (athlete requests + comment approvals) via the shared
  // aggregator — unlike layout.tsx's nav badge and team/page.tsx's roster
  // banner, which intentionally stay athlete-request-only since their
  // meaning is specifically roster-page-adjacent, not "all Requests."
  // D2: the full summary (not just .total) is also threaded through to
  // HomeView for the desktop Coach Dashboard's Requests card — same call,
  // no new query, mobile's pendingRequestCount usage is unchanged.
  const pendingRequestSummary = isHeadCoach(actor) ? await getPendingRequestSummary(slug) : undefined;
  const pendingRequestCount = pendingRequestSummary?.total ?? 0;
  // Phase: Home Screen Cleanup — getTeamSponsors(slug) was removed from
  // this Promise.all along with the Home Screen "Our Sponsors" section
  // it existed solely to feed; Team Sponsors is now fetched only by the
  // Partners page (sponsors/page.tsx), which already has its own
  // independent getTeamSponsors call.
  const [announcements, upcoming, settings, donationStats, fundraiserSummary] = await Promise.all([
    getAnnouncements(slug, actor),
    getCalendarEvents(slug, true),
    getCampaignSettings(slug),
    getDonationStats(slug),
    getTeamFundraiserSummary(slug),
  ]);

  // Phase 2.2D-2 — resolved ONCE here, server-side, and handed to both the
  // mobile HomeContent render path and the desktop CoachDashboard render
  // path via the single `communityPartnerGridSlots` prop below. Neither
  // component recomputes this independently, which is what guarantees
  // they can never disagree about which partner occupies which position
  // — not a coincidence of identical logic, a structural guarantee from
  // computing it exactly once. A campaign with no organization_id (never
  // backfilled) degrades to an empty grid rather than erroring, same
  // pattern as the Partners tab (Phase 2.2C) and the admin toggle
  // (Phase 2.2B).
  // Bug fix — Home Screen Fundraiser card visibility: same fail-closed
  // "archived wins, else fundraising_enabled decides, missing settings
  // row hides" precedence already enforced for checkout, the public
  // campaign page, and the athlete-profile routes. Computed once,
  // server-side, and threaded through unchanged — no new definition of
  // "active" is introduced here. Deliberately independent of
  // raisedCents: an active fundraiser with $0 raised must still show the
  // card (see FundraiserSnapshot/FundraisingCard's own $0 presentation
  // branch, untouched by this fix).
  const hasActiveFundraiser = isAthleteFundraisingVisible(settings);

  const organizationId = settings?.organization_id ?? null;
  const schoolAdvertising = organizationId ? await getSchoolAdvertisingSetting(organizationId) : null;
  const showCommunityPartners = schoolAdvertising?.show_community_partners ?? false;
  // null = advertising off (no section); an array, even an empty one, =
  // advertising on: CommunityPartnerGrid then shows all 21 positions,
  // blank ones included.
  let communityPartnerGridSlots: GridSlot[] | null = null;
  let featuredPartner: FeaturedPartner | null = null;
  if (showCommunityPartners) {
    const tick = getUtcDayTick();
    // Phase 2.2D-3 — the featured-partner read runs in the SAME
    // Promise.all as the grid's two reads (no duplicate
    // getSchoolAdvertisingSetting lookup, no duplicate getUtcDayTick
    // call). listFeaturedCommunityPartners()/pickFeaturedPartner() are
    // otherwise fully independent of the grid's reads/computation below
    // — they share no input, output, or state with resolveGridSlots or
    // its locked-position handling. A featured partner may also appear
    // in the grid (approved decision: these are independent placements).
    const [gridPartners, reservedPositions, featuredPartners] = await Promise.all([
      listActiveCommunityPartnersForGrid(),
      listAllLockedPositions(),
      listFeaturedCommunityPartners(),
    ]);
    // Two separate reads, both needed for the grid: the active partners
    // actually eligible to render, and EVERY currently-locked position
    // regardless of is_active — an inactive partner keeps its
    // reservation (approved decision), so resolveGridSlots must know
    // that position is spoken for even though it will never render that
    // partner's card.
    communityPartnerGridSlots = resolveGridSlots(gridPartners, reservedPositions, tick);
    featuredPartner = pickFeaturedPartner(featuredPartners, tick);
  }

  return (
    <HomeView
      slug={slug}
      initialAnnouncements={announcements}
      initialUpcoming={upcoming}
      actor={actor}
      raisedCents={donationStats.raised_cents}
      // Phase 3D: Home's fundraising progress tile is fundraising-facing —
      // shows the dynamic display goal, never the raw base goal_cents.
      goalCents={getDisplayGoalCents(settings?.goal_cents ?? 0, donationStats.raised_cents)}
      topAthleteName={fundraiserSummary.topAthleteName}
      primaryColor={settings?.primary_color ?? "#0b1e3d"}
      // Phase 4 revision: already-fetched by getCampaignSettings above —
      // just newly threaded through for the identity header (desktop
      // dashboard) and mobile identity block. No new query.
      logoUrl={settings?.logo_url ?? null}
      pendingRequestCount={pendingRequestCount}
      // D2 — already-fetched values, newly threaded through for the
      // desktop Coach Dashboard only (see HomeView.tsx/CoachDashboard.tsx).
      donorCount={donationStats.donor_count}
      pendingRequestSummary={pendingRequestSummary}
      schoolName={settings?.school_name}
      sportName={settings?.sport_name}
      season={settings?.season ?? undefined}
      communityPartnerGridSlots={communityPartnerGridSlots}
      featuredPartner={featuredPartner}
      hasActiveFundraiser={hasActiveFundraiser}
    />
  );
}
