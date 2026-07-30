import { getAnnouncements, getCalendarEvents, getTeamSponsors, getDonationStats, getTeamFundraiserSummary } from "@/lib/teamData";
import type { SponsorRow } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { sortSponsorsForHome } from "@/lib/sponsorRotation";
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
  const [announcements, upcoming, allSponsors, settings, donationStats, fundraiserSummary] = await Promise.all([
    getAnnouncements(slug),
    getCalendarEvents(slug, true),
    getTeamSponsors(slug),
    getCampaignSettings(slug),
    getDonationStats(slug),
    getTeamFundraiserSummary(slug),
  ]);
  const visibleSponsors: SponsorRow[] = allSponsors.filter(s => s.visible !== false);
  // Gold-and-above always outrank Silver, Silver above Bronze, Bronze above
  // untiered; only the order within a tier rotates — see sponsorRotation.ts.
  const sponsors = sortSponsorsForHome(visibleSponsors, slug);
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
    />
  );
}
