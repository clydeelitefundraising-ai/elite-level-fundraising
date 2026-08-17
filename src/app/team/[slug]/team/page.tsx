import { getTeamAthletes } from "@/lib/teamData";
import { getCampaignSettings } from "@/lib/supabase";
import { requireTeamMembership } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getPendingRequestCount } from "@/lib/platform/athleteRequests";
import TeamView from "./TeamView";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Not a public-facing route — gate it to logged-in members of this team.
  const actor = await requireTeamMembership(slug);
  const [athletes, settings] = await Promise.all([
    getTeamAthletes(slug),
    getCampaignSettings(slug),
  ]);
  // Head-Coach-only — matches layout.tsx's/AthleteRequestsPanel's own
  // gating; same canonical count function reused everywhere (Phase 3B-1).
  const pendingRequestCount = isHeadCoach(actor) ? await getPendingRequestCount(slug) : 0;
  return (
    <TeamView
      slug={slug}
      initialAthletes={athletes}
      actor={actor}
      pendingRequestCount={pendingRequestCount}
      joinCodeSettings={{
        school_name:   settings?.school_name ?? "",
        sport_name:    settings?.sport_name ?? "",
        mascot:        settings?.mascot ?? null,
        season:        settings?.season ?? null,
        primary_color: settings?.primary_color ?? "#0b1e3d",
      }}
    />
  );
}
