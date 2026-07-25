import { notFound } from "next/navigation";
import { getCampaignSettings, getDonations } from "@/lib/supabase";
import { getTeamAthletes } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { buildAthleteProgress } from "@/lib/teamRanking";
import LeaderboardView from "./LeaderboardView";

export const dynamic = "force-dynamic";

// Full, unlimited leaderboard — every team member (athlete/parent/booster,
// and the public "shared link" visitor branch) can view it, matching who
// already sees the Top 10 summary on the main fundraiser page. No new
// restriction is introduced here; there is nothing on this page a viewer
// couldn't already see paginated across the summary + underlying data.
export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [settings, actor] = await Promise.all([
    getCampaignSettings(slug),
    getTeamActor(slug),
  ]);
  if (!settings) notFound();

  const [athletes, donations] = await Promise.all([
    getTeamAthletes(slug),
    getDonations(slug),
  ]);

  const leaderboard = buildAthleteProgress(athletes, donations, settings.default_athlete_goal_cents ?? null);

  // Highlight the viewer's own row, same as the summary view — only
  // meaningful for an athlete viewing their own single self-link; a parent
  // with multiple claims or a coach/public visitor gets no highlight here.
  const currentAthleteId = actor.kind === "member" && actor.session.role === "athlete" && actor.session.athlete_id
    ? actor.session.athlete_id
    : "";

  return (
    <LeaderboardView
      slug={slug}
      settings={settings}
      leaderboard={leaderboard}
      currentAthleteId={currentAthleteId}
    />
  );
}
