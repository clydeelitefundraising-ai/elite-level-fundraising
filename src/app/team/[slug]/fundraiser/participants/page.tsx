import { redirect, notFound } from "next/navigation";
import { getCampaignSettings, getDonations } from "@/lib/supabase";
import { getTeamAthletes, getOutreachMap } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { buildAthleteProgress, computeNeedsAttention, rankNeedsAttentionByPriority } from "@/lib/teamRanking";
import CoachOnlyGate from "../../_components/CoachOnlyGate";
import ParticipantsView from "./ParticipantsView";

export const dynamic = "force-dynamic";

// Coach-only — full, unlimited participant management. Reuses the exact
// same ranking/needs-attention computation as the fundraiser and analytics
// pages (via @/lib/teamRanking), so this page always agrees with the Top 10
// summaries a coach sees elsewhere.
export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") redirect(`/team/${slug}/home`);
  if (actor.kind !== "coach") return <CoachOnlyGate slug={slug} />;

  const [settings, athletes, donations, outreachMap] = await Promise.all([
    getCampaignSettings(slug),
    getTeamAthletes(slug),
    getDonations(slug),
    getOutreachMap(slug),
  ]);
  if (!settings) notFound();

  const athleteProgress = buildAthleteProgress(athletes, donations, settings.default_athlete_goal_cents ?? null);
  const needsAttention  = rankNeedsAttentionByPriority(computeNeedsAttention(athleteProgress));

  return (
    <ParticipantsView
      slug={slug}
      primary={settings.primary_color ?? "#0b1e3d"}
      athleteProgress={athleteProgress}
      needsAttention={needsAttention}
      outreachMap={outreachMap}
    />
  );
}
