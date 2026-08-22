// Resolves what the public campaign page (CampaignPageClient / PremiumLayout)
// actually renders for "Recent Donations" and the athlete leaderboard, from
// whatever /api/campaign-stats/[slug] returned.
//
// The one rule these exist to enforce: a live campaign with zero real
// donations or an empty roster renders an EMPTY list, never a fabricated
// one. There used to be hardcoded fallback arrays ("Robert T.", "Sarah K.",
// "Marcus Johnson", ...) that a real, zero-activity campaign would show
// forever, presented indistinguishably from real donor activity. See
// campaignPublicDisplay.test.ts for the regression coverage.

export type PublicDonation = { name: string; amount: number; message: string; time: string };
export type PublicAthlete  = { id: string; name: string; event: string | null; class_year?: string | null };

export function resolveRecentDonations(fetched: unknown): PublicDonation[] {
  return Array.isArray(fetched) ? (fetched as PublicDonation[]) : [];
}

export function resolveLeaderboardAthletes(fetched: unknown): PublicAthlete[] {
  return Array.isArray(fetched) ? (fetched as PublicAthlete[]) : [];
}
