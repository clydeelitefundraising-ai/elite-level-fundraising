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
