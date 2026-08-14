import { restList } from "./_client";

export type RawDonation = {
  campaign_slug: string;
  athlete_id?:   string | null;
  athlete_name?: string | null;
  amount_cents:  number;
  created_at:    string;
};

export type DonationSummary = {
  totalRaisedCents: number;
  totalDonations:   number;
  avgDonationCents: number;
};

export type DonationPace = {
  timeFraction:     number;   // 0-1, how far through the campaign window we are
  expectedFraction: number;   // same as timeFraction (linear expected pace)
  actualFraction:   number;   // raised / goal
  paceRatio:        number;   // actual / expected — 1.0 == exactly on pace
  belowPace:        boolean;  // true when meaningfully behind (matches historical Operations threshold)
};

// All donations, most recent first. Shared by Team Health, Operations, and (in
// the future) Analytics so every consumer aggregates from the same fetch shape.
export async function getAllDonations(limit = 5000): Promise<RawDonation[]> {
  return restList<RawDonation>(
    `donations?select=campaign_slug,athlete_id,athlete_name,amount_cents,created_at&order=created_at.desc&limit=${limit}`,
  );
}

export async function getDonationsSince(sinceISO: string, limit = 2000): Promise<RawDonation[]> {
  return restList<RawDonation>(
    `donations?created_at=gte.${sinceISO}&select=campaign_slug,amount_cents,created_at&limit=${limit}`,
  );
}

export async function getRecentDonations(limit = 10): Promise<RawDonation[]> {
  return restList<RawDonation>(
    `donations?select=campaign_slug,athlete_id,athlete_name,amount_cents,created_at&order=created_at.desc&limit=${limit}`,
  );
}

export function groupDonationsByCampaign(donations: RawDonation[]): Record<string, RawDonation[]> {
  const byCamp: Record<string, RawDonation[]> = {};
  for (const d of donations) (byCamp[d.campaign_slug] ??= []).push(d);
  return byCamp;
}

export function getDonationSummary(donations: RawDonation[]): DonationSummary {
  const totalRaisedCents = donations.reduce((s, d) => s + (d.amount_cents ?? 0), 0);
  const totalDonations   = donations.length;
  const avgDonationCents = totalDonations > 0 ? Math.round(totalRaisedCents / totalDonations) : 0;
  return { totalRaisedCents, totalDonations, avgDonationCents };
}

export type DonationMomentum = { cents: number; count: number };

// Windowed donation total/count over the trailing `days` days. Shared by the
// Executive Dashboard's momentum cards and the Donation Report so both apply
// the same window math instead of two independent filter/reduce copies.
export function calculateDonationMomentum(donations: RawDonation[], days: number): DonationMomentum {
  const cutoff = Date.now() - days * 86400000;
  const windowed = donations.filter(d => new Date(d.created_at).getTime() >= cutoff);
  return { cents: windowed.reduce((s, d) => s + (d.amount_cents ?? 0), 0), count: windowed.length };
}

export function getCampaignProgress(donations: RawDonation[], goalCents: number) {
  const raisedCents = donations.reduce((s, d) => s + (d.amount_cents ?? 0), 0);
  const pctToGoal    = goalCents > 0 ? Math.round((raisedCents / goalCents) * 100) : 0;
  return { raisedCents, donationCount: donations.length, pctToGoal };
}

// Phase 3D: dynamic DISPLAY goal for fundraising-facing UI only. Pure,
// deterministic function of the admin-set base goal and current raised
// total — never persisted, never written back to campaign_settings.
//
// Rule (buffer = 10% of base, step = 20% of base): once raised comes
// within `buffer` of the current display goal, the display goal advances
// by one `step`, repeated until raised is safely below the new display
// goal minus buffer. This keeps the publicly-shown target always ahead
// of what's been raised, so a campaign never visually appears "finished"
// while donations are still coming in.
//
// Internal/admin/reporting math (Team Health, Operations, Executive
// Dashboard, calculateDonationPace, admin Campaign Control Center, admin
// analytics) must keep using the raw baseGoalCents — never this value.
export function getDisplayGoalCents(baseGoalCents: number, raisedCents: number): number {
  if (!Number.isFinite(baseGoalCents) || baseGoalCents <= 0) return 0;
  const raised = Number.isFinite(raisedCents) && raisedCents > 0 ? raisedCents : 0;

  const buffer = Math.round(baseGoalCents * 0.10);
  // Floor of 1 cent guarantees forward progress every iteration — without
  // it, a baseGoalCents below 5 cents would round step to 0 and loop
  // forever.
  const step    = Math.max(1, Math.round(baseGoalCents * 0.20));

  let displayGoal = baseGoalCents;
  while (raised >= displayGoal - buffer) displayGoal += step;

  return displayGoal;
}

// Linear pace model: expected progress = time elapsed / total window.
// Shared by Team Health scoring and Operations' "below pace" attention check
// so both apply the exact same math instead of two slightly different copies.
export function calculateDonationPace(
  createdAtISO: string | null,
  deadlineISO:  string | null,
  goalCents:    number,
  raisedCents:  number,
): DonationPace | null {
  if (!createdAtISO || !deadlineISO) return null;
  const start = new Date(createdAtISO).getTime();
  const end   = new Date(deadlineISO).getTime();
  const now   = Date.now();
  if (end <= start) return null;

  const timeFraction     = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const expectedFraction = timeFraction;
  const actualFraction   = goalCents > 0 ? raisedCents / goalCents : timeFraction;
  const paceRatio         = expectedFraction > 0 ? actualFraction / expectedFraction : 1;

  // Historical Operations threshold: only flag once >=25% through the window
  // and raised less than half of the expected-by-now amount.
  const belowPace = timeFraction >= 0.25 && raisedCents < goalCents * timeFraction * 0.5;

  return { timeFraction, expectedFraction, actualFraction, paceRatio, belowPace };
}
