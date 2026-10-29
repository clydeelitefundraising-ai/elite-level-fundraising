// Fundraiser dashboard data builders — moved out of page.tsx unchanged
// (same attribution, ordering, tie behavior and goal math) so they can be
// unit-tested directly, plus the two small pieces the compact dashboard
// adds: which full-list view a request may open, and how many records each
// role may see. Pure functions only — page.tsx still does all fetching and
// all role decisions.
import type { CampaignSettings, DonationRow } from "../../../../lib/supabase.ts";
import type { TeamAthleteRow } from "../../../../lib/teamData.ts";
import { attributeDonationsToAthletes } from "../../../../lib/donationAttribution.ts";
import { isSeasonCompleted } from "../../../../lib/seasonState.ts";
import type { LeaderboardEntry, FeedDonation } from "./FundraiserView.tsx";
import type { TeamStats, PaceData, AthleteProgress, TopDonor } from "../analytics/AnalyticsView.tsx";

/** Records shown on the main dashboard before "View All". */
export const DASHBOARD_PREVIEW_COUNT = 5;

/** Existing visibility limit: athletes, parents and boosters (and the
 *  public team view) see at most the 15 most recent team donations. The
 *  full-list view for those roles is capped here too — it never widens
 *  what they could already see. Only coaches/platform admins get the
 *  complete history (they can already export it). */
export const MEMBER_TEAM_FEED_LIMIT = 15;

export type FundraiserListView = "athletes" | "donations" | "donors";

/** Which full-list view (?view=) this request may open. Top Donors is a
 *  coach-analytics surface, so "donors" is ignored (dashboard shown) for
 *  every other role, as is any unknown value. */
export function parseFundraiserListView(
  raw: string | string[] | undefined,
  canSeeCoachAnalytics: boolean,
): FundraiserListView | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "athletes" || v === "donations") return v;
  if (v === "donors" && canSeeCoachAnalytics) return v;
  return null;
}

/** Dashboard / full-list URLs. Only the view name and (for a parent with
 *  several linked athletes) the already-in-use athlete id — never any
 *  donor data. */
export function fundraiserHref(slug: string, view?: FundraiserListView, athleteId?: string): string {
  const q = new URLSearchParams();
  if (view) q.set("view", view);
  if (athleteId) q.set("athlete", athleteId);
  const qs = q.toString();
  return `/team/${slug}/fundraiser${qs ? `?${qs}` : ""}`;
}

export function buildLeaderboard(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
): LeaderboardEntry[] {
  // Phase 6: delegates to the single authoritative attribution
  // implementation (src/lib/donationAttribution.ts) instead of an inline
  // copy — behavior (id-first match, legacy name fallback, zero-seeded
  // for every roster athlete) is unchanged from the prior inline version.
  const { totalsCents, donorCounts } = attributeDonationsToAthletes(athletes, donations);

  return athletes
    .map(a => ({
      id:            a.id,
      name:          a.name,
      profile_photo: a.profile_photo,
      event:         a.event,
      class_year:    a.class_year ?? null,
      raisedCents:   totalsCents[a.id] ?? 0,
      goalCents:     a.goal_cents      ?? null,
      donorCount:    donorCounts[a.id] ?? 0,
      rank:          0,
    }))
    .sort((a, b) => b.raisedCents - a.raisedCents)
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

export function buildTeamFeed(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
  limit = MEMBER_TEAM_FEED_LIMIT,
): FeedDonation[] {
  const idToName: Record<string, string> = {};
  for (const a of athletes) idToName[a.id] = a.name;

  return donations.slice(0, limit).map(d => ({
    donor_name:       d.donor_name,
    amount_cents:     d.amount_cents,
    athlete_label:    (d.athlete_id && idToName[d.athlete_id])
                        ? idToName[d.athlete_id]
                        : (d.athlete_name ?? null),
    donation_message: d.donation_message,
    created_at:       d.created_at,
  }));
}

export function buildTeamStats(settings: CampaignSettings, donations: DonationRow[], raisedCents: number): TeamStats {
  const teamGoalCents = settings.goal_cents ?? 0;
  const donorCount    = donations.length;
  const pct           = teamGoalCents > 0
    ? Math.min(100, Math.round((raisedCents / teamGoalCents) * 100))
    : 0;
  const daysRemaining = settings.deadline && !isSeasonCompleted(settings)
    ? Math.max(0, Math.ceil((new Date(settings.deadline).getTime() - Date.now()) / 86_400_000))
    : null;

  return {
    raisedCents, teamGoalCents, donorCount,
    avgDonation:  donorCount > 0 ? Math.round(raisedCents / donorCount) : 0,
    pct, daysRemaining,
  };
}

export function buildPace(settings: CampaignSettings, donations: DonationRow[], teamStats: TeamStats): PaceData {
  const { raisedCents, teamGoalCents, daysRemaining } = teamStats;
  if (!settings.deadline || donations.length === 0 || daysRemaining === null) return null;

  const oldest         = donations[donations.length - 1];
  const daysSinceFirst = Math.max(1, Math.ceil(
    (Date.now() - new Date(oldest.created_at).getTime()) / 86_400_000,
  ));
  const currentPerDay = raisedCents / daysSinceFirst;
  const safeRemaining = Math.max(1, daysRemaining);
  const neededPerDay  = teamGoalCents > 0
    ? Math.max(0, (teamGoalCents - raisedCents) / safeRemaining)
    : 0;
  return {
    daysRemaining:   safeRemaining,
    neededPerDay:    Math.round(neededPerDay),
    currentPerDay:   Math.round(currentPerDay),
    projectedFinish: Math.round(raisedCents + currentPerDay * safeRemaining),
    onTrack:         teamGoalCents > 0 ? currentPerDay >= neededPerDay : true,
  };
}

export function buildAthleteProgress(athletes: TeamAthleteRow[], donations: DonationRow[]): AthleteProgress[] {
  // Phase 6: same authoritative attribution as buildLeaderboard() above.
  const { totalsCents: totals, donorCounts, lastDonationAt: lastDon } = attributeDonationsToAthletes(athletes, donations);

  return athletes
    .map(a => {
      const raised = totals[a.id] ?? 0;
      const goal   = a.goal_cents ?? null;
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

/** Every donor, highest total first (the dashboard previously showed the
 *  first 10 of this same list; it now shows 5, with the rest one tap away). */
export function buildTopDonors(athletes: TeamAthleteRow[], donations: DonationRow[]): TopDonor[] {
  const idToName: Record<string, string> = {};
  for (const a of athletes) idToName[a.id] = a.name;

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
  return Array.from(donorMap.entries())
    .map(([name, data]) => ({
      name,
      totalCents:    data.totalCents,
      donationCount: data.count,
      athletes:      Array.from(data.athletes),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export type CampaignGoalSummary = {
  /** Headline goal (getDisplayGoalCents) — what donors, athletes and the public see. */
  displayGoalCents: number;
  displayPct:       number;
  /** Stored campaign goal — pace, projections and amount needed use this. */
  baseGoalCents:    number;
  basePct:          number;
  neededForBaseCents: number;
  /** True once the displayed goal has stepped above the stored goal. */
  goalStepped:      boolean;
};

/** Decision 1: the displayed goal is the headline; the stored goal stays
 *  the basis for "needed", pace and projections. Neither number is
 *  recomputed here — this only pairs them so the card can label each. */
export function summarizeCampaignGoal(baseGoalCents: number, displayGoalCents: number, raisedCents: number): CampaignGoalSummary {
  const pctOf = (goal: number) => goal > 0 ? Math.min(100, Math.round((raisedCents / goal) * 100)) : 0;
  return {
    displayGoalCents,
    displayPct:         pctOf(displayGoalCents),
    baseGoalCents,
    basePct:            pctOf(baseGoalCents),
    neededForBaseCents: Math.max(0, baseGoalCents - raisedCents),
    goalStepped:        baseGoalCents > 0 && displayGoalCents !== baseGoalCents,
  };
}
