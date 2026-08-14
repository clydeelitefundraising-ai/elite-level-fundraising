import { getAnnouncements, getCalendarEvents, getTeamSponsors, getDonationStats, getTeamFundraiserSummary } from "@/lib/teamData";
import type { SponsorRow } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getCampaignSettings } from "@/lib/supabase";
import { getPendingRequestSummary } from "@/lib/platform/requests";
import { getDisplayGoalCents } from "@/lib/platform/donations";
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
  const pendingRequestCount = isHeadCoach(actor) ? (await getPendingRequestSummary(slug)).total : 0;
  const [announcements, upcoming, allSponsors, settings, donationStats, fundraiserSummary] = await Promise.all([
    getAnnouncements(slug),
    getCalendarEvents(slug, true),
    getTeamSponsors(slug),
    getCampaignSettings(slug),
    getDonationStats(slug),
    getTeamFundraiserSummary(slug),
  ]);
  const sponsors: SponsorRow[] = allSponsors.filter(s => s.visible !== false);
  return (
    <HomeView
      slug={slug}
      initialAnnouncements={announcements}
      initialUpcoming={upcoming}
      actor={actor}
      sponsors={sponsors}
      raisedCents={donationStats.raised_cents}
      // Phase 3D: Home's fundraising progress tile is fundraising-facing —
      // shows the dynamic display goal, never the raw base goal_cents.
      goalCents={getDisplayGoalCents(settings?.goal_cents ?? 0, donationStats.raised_cents)}
      topAthleteName={fundraiserSummary.topAthleteName}
      primaryColor={settings?.primary_color ?? "#0b1e3d"}
      pendingRequestCount={pendingRequestCount}
    />
  );
}
