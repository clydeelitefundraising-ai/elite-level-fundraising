import { getAnnouncements, getCalendarEvents, getTeamSponsors, getDonationStats, getTeamFundraiserSummary } from "@/lib/teamData";
import type { SponsorRow } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import HomeView from "./HomeView";

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [announcements, upcoming, actor, allSponsors, settings, donationStats, fundraiserSummary] = await Promise.all([
    getAnnouncements(slug),
    getCalendarEvents(slug, true),
    getTeamActor(slug),
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
    />
  );
}
