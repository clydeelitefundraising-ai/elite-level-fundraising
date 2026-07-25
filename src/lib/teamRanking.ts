import type { TeamAthleteRow } from "@/lib/teamData";
import type { DonationRow } from "@/lib/supabase";

// Single source of truth for team-app fundraiser ranking + "needs attention"
// filtering — consumed by the team fundraiser page, the analytics page, the
// full leaderboard page, and the coach participants page, so all four
// always agree on rank, totals, and who's flagged. Previously duplicated
// (with a subtle divergence — see buildAthleteProgress below) across
// src/app/team/[slug]/fundraiser/page.tsx and
// src/app/team/[slug]/analytics/page.tsx.

// Not hardcoded per call site — the shared cap for every "top N" summary
// view (team leaderboard preview, needs-attention preview).
export const LEADERBOARD_SUMMARY_LIMIT = 10;

export type AthleteProgress = {
  id:             string;
  name:           string;
  event:          string | null;
  class_year:     string | null;
  profile_photo:  string | null;
  raisedCents:    number;
  goalCents:      number | null;
  pct:            number | null;
  donorCount:     number;
  lastDonationAt: string | null;
  rank:           number;
  contact_phone:  string | null;
  contact_email:  string | null;
};

// Ranks every athlete by total raised (descending, sequential rank — no
// grouped ties today: two athletes with identical totals still get distinct
// consecutive rank numbers based on array order, matching the pre-existing
// behavior in both call sites this consolidates).
//
// `defaultGoalCents` should be the campaign's `default_athlete_goal_cents`.
// The two call sites this replaces disagreed on this: fundraiser/page.tsx
// never applied it (an athlete without their own goal always got
// goalCents=null, so never showed a % or could be flagged via the pct<10
// rule), while analytics/page.tsx did apply it. Standardized on applying it
// (the analytics/page.tsx behavior) since that matches the same fallback
// pattern already used for the individual athlete dashboard.
export function buildAthleteProgress(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
  defaultGoalCents: number | null = null,
): AthleteProgress[] {
  const nameToId: Record<string, string> = {};
  for (const a of athletes) nameToId[a.name] = a.id;

  const totals:      Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const donorCounts: Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const lastDon:     Record<string, string | null> = Object.fromEntries(athletes.map(a => [a.id, null]));

  for (const d of donations) {
    let aid: string | undefined;
    if (d.athlete_id && totals[d.athlete_id] !== undefined) aid = d.athlete_id;
    else if (!d.athlete_id && d.athlete_name)               aid = nameToId[d.athlete_name];
    if (aid) {
      totals[aid]      = (totals[aid]      ?? 0) + d.amount_cents;
      donorCounts[aid] = (donorCounts[aid] ?? 0) + 1;
      if (!lastDon[aid]) lastDon[aid] = d.created_at; // donations arrive sorted created_at.desc
    }
  }

  return athletes
    .map(a => {
      const raised = totals[a.id] ?? 0;
      const goal   = a.goal_cents ?? defaultGoalCents ?? null;
      return {
        id:             a.id,
        name:           a.name,
        event:          a.event,
        class_year:     a.class_year ?? null,
        profile_photo:  a.profile_photo ?? null,
        raisedCents:    raised,
        goalCents:      goal,
        pct:            goal && goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : null,
        donorCount:     donorCounts[a.id] ?? 0,
        lastDonationAt: lastDon[a.id],
        rank:           0,
        contact_phone:  a.contact_phone ?? null,
        contact_email:  a.contact_email ?? null,
      };
    })
    .sort((a, b) => b.raisedCents - a.raisedCents)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

// Unchanged criteria from both prior duplicated implementations: zero
// raised, OR at most one donor, OR (has a goal AND under 10% funded).
export function computeNeedsAttention(progress: AthleteProgress[]): AthleteProgress[] {
  return progress.filter(a =>
    a.raisedCents === 0 || a.donorCount <= 1 || (a.pct !== null && a.pct < 10),
  );
}

// `computeNeedsAttention`'s filter preserves raisedCents-descending order
// (inherited from `progress`), which puts the LEAST urgent flagged athletes
// first (they raised the most of anyone still under the thresholds). A
// "top 10 highest priority" summary must not just take the first 10 of that
// — it needs actual urgency order: zero raised first, then lowest % funded,
// then fewest donors, using only fields already computed above (no new
// data invented).
export function rankNeedsAttentionByPriority(flagged: AthleteProgress[]): AthleteProgress[] {
  return [...flagged].sort((a, b) => {
    if (a.raisedCents !== b.raisedCents) return a.raisedCents - b.raisedCents;
    const aPct = a.pct ?? 100, bPct = b.pct ?? 100;
    if (aPct !== bPct) return aPct - bPct;
    return a.donorCount - b.donorCount;
  });
}
