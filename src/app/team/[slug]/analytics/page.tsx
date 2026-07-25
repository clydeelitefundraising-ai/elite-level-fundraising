import { redirect, notFound } from "next/navigation";
import { getCampaignSettings, getDonations } from "@/lib/supabase";
import { getTeamAthletes, getOutreachMap } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import { buildAthleteProgress, computeNeedsAttention, rankNeedsAttentionByPriority } from "@/lib/teamRanking";
import CoachOnlyGate from "../_components/CoachOnlyGate";
import AnalyticsView from "./AnalyticsView";
import type { TeamStats, PaceData, TopDonor } from "./AnalyticsView";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
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
    getDonations(slug), // sorted created_at.desc
    getOutreachMap(slug),
  ]);

  if (!settings) notFound();

  // ── Per-athlete lookups ───────────────────────────────────────────────────
  const idToName: Record<string, string> = {};
  for (const a of athletes) idToName[a.id] = a.name;

  // ── Team stats ────────────────────────────────────────────────────────────
  const raisedCents   = donations.reduce((s, d) => s + d.amount_cents, 0);
  const donorCount    = donations.length;
  const teamGoalCents = settings.goal_cents ?? 0;
  const pct           = teamGoalCents > 0
    ? Math.min(100, Math.round((raisedCents / teamGoalCents) * 100))
    : 0;
  const daysRemaining = settings.deadline
    ? Math.max(0, Math.ceil((new Date(settings.deadline).getTime() - Date.now()) / 86_400_000))
    : null;

  const teamStats: TeamStats = {
    raisedCents,
    teamGoalCents,
    donorCount,
    avgDonation:   donorCount > 0 ? Math.round(raisedCents / donorCount) : 0,
    pct,
    daysRemaining,
  };

  // ── Pace ──────────────────────────────────────────────────────────────────
  let pace: PaceData = null;
  if (settings.deadline && donations.length > 0 && daysRemaining !== null) {
    const oldest         = donations[donations.length - 1];
    const daysSinceFirst = Math.max(1, Math.ceil(
      (Date.now() - new Date(oldest.created_at).getTime()) / 86_400_000,
    ));
    const currentPerDay   = raisedCents / daysSinceFirst;
    const safeRemaining   = Math.max(1, daysRemaining);
    const neededPerDay    = teamGoalCents > 0
      ? Math.max(0, (teamGoalCents - raisedCents) / safeRemaining)
      : 0;
    const projectedFinish = Math.round(raisedCents + currentPerDay * safeRemaining);

    pace = {
      daysRemaining:   safeRemaining,
      neededPerDay:    Math.round(neededPerDay),
      currentPerDay:   Math.round(currentPerDay),
      projectedFinish,
      onTrack:         teamGoalCents > 0 ? currentPerDay >= neededPerDay : true,
    };
  }

  // ── Athlete progress + needs attention (shared with fundraiser/page.tsx) ──
  const athleteProgress = buildAthleteProgress(athletes, donations, settings.default_athlete_goal_cents ?? null);
  const needsAttention  = rankNeedsAttentionByPriority(computeNeedsAttention(athleteProgress));

  // ── Top donors ────────────────────────────────────────────────────────────
  const donorMap = new Map<string, { totalCents: number; count: number; athletes: Set<string> }>();
  for (const d of donations) {
    const key = d.donor_name ?? "Anonymous";
    if (!donorMap.has(key)) donorMap.set(key, { totalCents: 0, count: 0, athletes: new Set() });
    const entry = donorMap.get(key)!;
    entry.totalCents += d.amount_cents;
    entry.count++;
    const ath = d.athlete_id ? idToName[d.athlete_id] : (d.athlete_name ?? undefined);
    if (ath) entry.athletes.add(ath);
  }
  const topDonors: TopDonor[] = Array.from(donorMap.entries())
    .map(([name, data]) => ({
      name,
      totalCents:    data.totalCents,
      donationCount: data.count,
      athletes:      Array.from(data.athletes),
    }))
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 10);

  return (
    <AnalyticsView
      slug={slug}
      settings={settings}
      teamStats={teamStats}
      pace={pace}
      athleteProgress={athleteProgress}
      needsAttention={needsAttention}
      topDonors={topDonors}
      outreachMap={outreachMap}
    />
  );
}
