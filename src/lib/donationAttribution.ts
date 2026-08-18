// Phase 6: single authoritative athlete-donation attribution, extracted
// from what was previously three independent copies of this exact logic
// in src/app/team/[slug]/fundraiser/page.tsx (buildLeaderboard, the
// coach-branch athleteProgress builder, and the member-branch per-athlete
// total). Behavior is preserved byte-for-byte from the original
// implementations — id-first match against donations.athlete_id, legacy
// free-text athlete_name fallback for pre-attribution donation rows.
//
// Every roster athlete is pre-seeded into every returned map at zero —
// callers (buildLeaderboard, Follow-Ups) must never derive athlete
// membership from `donations`, only enrich already-known roster athletes
// with what this function computes.
import type { TeamAthleteRow } from "./teamData.ts";
import type { DonationRow } from "./supabase.ts";

export type AttributionTotals = {
  totalsCents:    Record<string, number>;
  donorCounts:    Record<string, number>;
  lastDonationAt: Record<string, string | null>;
};

export function attributeDonationsToAthletes(
  athletes: TeamAthleteRow[],
  donations: DonationRow[],
): AttributionTotals {
  const nameToId: Record<string, string> = {};
  for (const a of athletes) nameToId[a.name] = a.id;

  const totalsCents:    Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const donorCounts:    Record<string, number>        = Object.fromEntries(athletes.map(a => [a.id, 0]));
  const lastDonationAt: Record<string, string | null> = Object.fromEntries(athletes.map(a => [a.id, null]));

  for (const d of donations) {
    let aid: string | undefined;
    if (d.athlete_id && totalsCents[d.athlete_id] !== undefined) aid = d.athlete_id;
    else if (!d.athlete_id && d.athlete_name)                    aid = nameToId[d.athlete_name];
    if (aid) {
      totalsCents[aid]    += d.amount_cents;
      donorCounts[aid]    += 1;
      if (!lastDonationAt[aid]) lastDonationAt[aid] = d.created_at;
    }
  }

  return { totalsCents, donorCounts, lastDonationAt };
}
