import { getAnnouncements, getCalendarEvents, getTeamSponsors, getDonationStats, getTeamFundraiserSummary, getTeamAthletes } from "@/lib/teamData";
import type { SponsorRow } from "@/lib/teamData";
import { requireTeamMembership } from "@/lib/permissions.server";
import { isHeadCoach, isStaff } from "@/lib/permissions";
import { getCampaignSettings } from "@/lib/supabase";
import { listTeamCoaches } from "@/lib/staffInvite";
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

  // Fundraiser Setup checklist data (Phase 3A-1) — only fetched for staff,
  // since the card itself is staff-only (mirrors layout.tsx's existing
  // isHeadCoach-gated pendingAthleteRequestCount fetch pattern). All reads
  // reuse existing, already-established helpers — no new services.
  const staffActor = isStaff(actor);
  const headCoachActor = staffActor && isHeadCoach(actor);

  const [announcements, upcoming, allSponsors, settings, donationStats, fundraiserSummary, athletes, staff, pendingRequestCount] = await Promise.all([
    getAnnouncements(slug),
    getCalendarEvents(slug, true),
    getTeamSponsors(slug),
    getCampaignSettings(slug),
    getDonationStats(slug),
    getTeamFundraiserSummary(slug),
    staffActor ? getTeamAthletes(slug) : Promise.resolve([]),
    staffActor ? listTeamCoaches(slug) : Promise.resolve([]),
    headCoachActor ? getPendingRequestCount(slug) : Promise.resolve(0),
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
      athleteCount={athletes.length}
      staffCount={staff.length}
      pendingRequestCount={pendingRequestCount}
    />
  );
}
