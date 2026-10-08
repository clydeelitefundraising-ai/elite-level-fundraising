import type { TeamActor } from "./permissions";

export type FundraiserRouteView = "dashboard" | "coach-inquiry" | "unavailable";

/** Phase F1b — single source of truth for what the fundraiser route
 *  (src/app/team/[slug]/fundraiser/page.tsx) renders for a given actor,
 *  given the campaign's current fundraising_enabled value. Extracted as a
 *  pure function (rather than inlined per-branch in the page) so it can be
 *  unit-tested directly — this repo has no component-rendering test
 *  framework (see canViewAthleteProfile in athleteAccess.ts for the same
 *  pattern: the real authorization boundary lives in a plain function,
 *  the page/route just calls it).
 *
 *  - "dashboard": render the existing fundraiser experience unchanged.
 *    Always true for a platform admin (locked decision: "Platform Admin
 *    behavior remains unchanged" regardless of fundraising_enabled) and
 *    for every actor once fundraising_enabled is true.
 *  - "coach-inquiry": fundraising is off and this actor is a real coach
 *    (head_coach/assistant_coach) — render the empty state with the
 *    "Inquire About Fundraising" CTA. Never loads fundraiser data.
 *  - "unavailable": fundraising is off and this actor is not staff
 *    coaching personnel (booster, parent, athlete, or a public visitor) —
 *    the caller must not render the dashboard, matching
 *    shouldShowFundraisingNav() never showing this actor the nav item
 *    either. Hiding the nav item alone is not the security boundary; this
 *    function is. */
export function resolveFundraiserRouteView(fundraisingEnabled: boolean, actor: TeamActor): FundraiserRouteView {
  if (actor.kind === "platform_admin") return "dashboard";
  if (fundraisingEnabled) return "dashboard";
  if (actor.kind === "coach" && (actor.session.role === "head_coach" || actor.session.role === "assistant_coach")) {
    return "coach-inquiry";
  }
  return "unavailable";
}

/** Minimal shape both server-side consumers below need — a real
 *  CampaignSettings row always satisfies this; kept narrow so callers don't
 *  need to import the full supabase.ts type into every test file. */
export type CampaignActiveState = { archived?: boolean; fundraising_enabled?: boolean };

/** Phase F1c — single shared precedence decision for "can a donation be
 *  created for this campaign right now," reused by both /api/checkout
 *  (the actual payment gate) and /api/campaign-stats/[slug] (deciding
 *  whether to return full fundraising data or a minimal inactive
 *  payload) — so the two surfaces can never disagree about what counts as
 *  active. Precedence, exactly as locked in F1a/F1b: archived wins first
 *  (an archived campaign never accepts donations regardless of
 *  fundraising_enabled); otherwise fundraising_enabled decides, falling
 *  back to `true` when the column is absent from an older/unmigrated row
 *  (never interpret missing/null as disabled — see phase_f1a's backfill
 *  rationale). A missing settings row entirely is NOT this function's
 *  concern — callers keep their own existing invalid-campaign handling
 *  for that case and never call this with an absent row. */
export function isCampaignAcceptingDonations(settings: CampaignActiveState): boolean {
  if (settings.archived) return false;
  return settings.fundraising_enabled ?? true;
}

export type PublicCampaignState = "ended" | "not-started" | "live";

/** Phase F1c — the same precedence as isCampaignAcceptingDonations above,
 *  expressed as the three public-page states CampaignPageClient.tsx
 *  already renders (archived -> ended wins; else fundraising_enabled=false
 *  -> not-started; else live). Used server-side by
 *  /api/campaign-stats/[slug] to decide whether to run the full
 *  donations/leaderboard/sponsor fetch or return the minimal payload those
 *  two inactive states actually need. */
export function resolvePublicCampaignState(settings: CampaignActiveState): PublicCampaignState {
  if (settings.archived) return "ended";
  if (!(settings.fundraising_enabled ?? true)) return "not-started";
  return "live";
}

/** Phase 1.2 — same precedence as isCampaignAcceptingDonations above, for
 *  the two member-facing athlete-profile routes (athlete/[id]/page.tsx and
 *  team/[id]/page.tsx), both of which already fetch settings as
 *  `CampaignSettings | null` via getCampaignSettings(). A missing row
 *  (data anomaly — every real team has one, created at provisioning time)
 *  resolves to "hide fundraising," the same fail-closed default every
 *  other inactive case already resolves to. Does not introduce a second
 *  definition of "active" — delegates entirely to
 *  isCampaignAcceptingDonations for any non-null row. */
export function isAthleteFundraisingVisible(settings: CampaignActiveState | null): boolean {
  return settings ? isCampaignAcceptingDonations(settings) : false;
}
