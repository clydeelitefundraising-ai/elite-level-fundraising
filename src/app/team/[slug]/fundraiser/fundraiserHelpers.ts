// Pure helpers for the Phase D6 desktop Fundraiser Follow-Ups workspace —
// extracted so eligibility is directly unit-testable without any
// component-render infrastructure (same pattern as
// team/rosterHelpers.ts, calendar/calendarHelpers.ts,
// communications/communicationsHelpers.ts). FundraiserTabs.tsx and
// FollowUpsWorkspaceView.tsx are the only consumers.
import { isCoachOnly, type TeamActor } from "../../../../lib/permissions.ts";

/** Whether this actor sees the enhanced desktop Fundraiser presentation
 *  (compact Overview | Follow-Ups nav + the dense desktop Follow-Ups
 *  table) instead of the existing mobile-style Fundraiser page at
 *  desktop widths. Deliberately NOT isStaff() — matches the exact
 *  boundary D2's Coach Dashboard, D3's Desktop Roster, D4's Desktop
 *  Calendar, and D5's Desktop Communications already established:
 *  boosters keep their existing isStaff-granted Follow-Ups access (view
 *  rows, update outreach, export, print — see the Step 0 permission
 *  audit), but must keep seeing the existing Fundraiser presentation, not
 *  a new coach-workspace surface, at every width. isCoachOnly() already
 *  has exactly the right semantics (head_coach, assistant_coach,
 *  platform_admin as head-coach-equivalent — excludes booster and every
 *  member role). permissions.ts's own isStaff/isHeadCoach/isCoachOnly are
 *  untouched — this only decides which presentation an
 *  already-correctly-authorized actor sees. */
export function shouldShowDesktopFundraiserFollowUps(actor: TeamActor): boolean {
  return isCoachOnly(actor);
}
