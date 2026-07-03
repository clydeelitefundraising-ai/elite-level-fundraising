import { redirect, notFound } from "next/navigation";
import { getCampaignSettings, getDonations } from "@/lib/supabase";
import { getTeamAthletes, getOutreachMap } from "@/lib/teamData";
import { getTeamActor } from "@/lib/permissions.server";
import AnalyticsView from "./AnalyticsView";
import type { TeamStats, PaceData, AthleteProgress, TopDonor } from "./AnalyticsView";

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
  const nameToId: Record<string, string> = {};
  const idToName: Record<string, string> = {};
  for (const a of athletes) { nameToId[a.name] = a.id; idToName[a.id] = a.name; }

  const totals:      Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const donorCounts: Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const lastDon:     Record<string, string | null> = Object.fromEntries(athletes.map(a => [a.id, null]));

  for (const d of donations) {
    let aid: string | undefined;
    if (d.athlete_id && totals[d.athlete_id] !== undefined) {
      aid = d.athlete_id;
    } else if (!d.athlete_id && d.athlete_name) {
      aid = nameToId[d.athlete_name];
    }
    if (aid) {
      totals[aid]      = (totals[aid]      ?? 0) + d.amount_cents;
      donorCounts[aid] = (donorCounts[aid] ?? 0) + 1;
      if (!lastDon[aid]) lastDon[aid] = d.created_at; // desc order — first hit = most recent
    }
  }

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

  // ── Athlete progress ──────────────────────────────────────────────────────
  const athleteProgress: AthleteProgress[] = athletes
    .map(a => {
      const raised     = totals[a.id] ?? 0;
      const goal       = a.goal_cents ?? settings.default_athlete_goal_cents ?? null;
      const athletePct = goal && goal > 0
        ? Math.min(100, Math.round((raised / goal) * 100))
        : null;
      return {
        id:             a.id,
        name:           a.name,
        event:          a.event,
        class_year:     a.class_year ?? null,
        profile_photo:  a.profile_photo,
        raisedCents:    raised,
        goalCents:      goal,
        pct:            athletePct,
        donorCount:     donorCounts[a.id] ?? 0,
        lastDonationAt: lastDon[a.id],
        rank:           0,
        contact_phone:  a.contact_phone ?? null,
        contact_email:  a.contact_email ?? null,
      };
    })
    .sort((a, b) => b.raisedCents - a.raisedCents)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  // ── Needs attention ───────────────────────────────────────────────────────
  const needsAttention = athleteProgress.filter(a =>
    a.raisedCents === 0 ||
    a.donorCount <= 1 ||
    (a.pct !== null && a.pct < 10),
  );

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

// ── Coach-only gate ───────────────────────────────────────────────────────────

function CoachOnlyGate({ slug }: { slug: string }) {
  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
        textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", marginBottom: ".3rem" }}>
          Coach Access Only
        </div>
        <p style={{ margin: "0 0 1.25rem", fontSize: ".85rem", color: "#6b7280", lineHeight: 1.5 }}>
          This page is only available to coaches.
        </p>
        <a
          href={`/team/${slug}/home`}
          style={{
            display: "inline-block", padding: ".55rem 1.25rem", background: "#0b1e3d",
            color: "#fff", borderRadius: 9, fontSize: ".875rem", fontWeight: 700, textDecoration: "none",
          }}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
