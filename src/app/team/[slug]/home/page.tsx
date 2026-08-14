import { getAnnouncements, getCalendarEvents, getTeamSponsors, getDonationStats, getTeamFundraiserSummary } from "@/lib/teamData";
import type { SponsorRow } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getCampaignSettings } from "@/lib/supabase";
import { getPendingRequestCount } from "@/lib/platform/athleteRequests";
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
  // Head-Coach-only — same canonical count function/gating already used by
  // layout.tsx (nav badge) and team/page.tsx (Phase 3B-1).
  const pendingRequestCount = isHeadCoach(actor) ? await getPendingRequestCount(slug) : 0;
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
      goalCents={settings?.goal_cents ?? 0}
      topAthleteName={fundraiserSummary.topAthleteName}
      primaryColor={settings?.primary_color ?? "#0b1e3d"}
      pendingRequestCount={pendingRequestCount}
    />
  );
}
