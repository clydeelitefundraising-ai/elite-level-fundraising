// Pure helpers for the Phase D5 desktop Communications workspace — extracted
// so eligibility is directly unit-testable without any component-render
// infrastructure (same pattern as team/rosterHelpers.ts and
// calendar/calendarHelpers.ts). files/UpdatesWorkspaceView.tsx is the only
// consumer.
import { isCoachOnly, type TeamActor } from "../../../../lib/permissions.ts";

/** Whether this actor sees the enhanced desktop Communications/Updates
 *  workspace instead of the existing mobile-style Communications page at
 *  desktop widths. Deliberately NOT isStaff() — matches the exact boundary
 *  D2's Coach Dashboard (shouldShowCoachDashboard), D3's Desktop Roster
 *  (shouldShowDesktopRoster), and D4's Desktop Calendar
 *  (shouldShowDesktopCalendar) already established: boosters keep their
 *  existing isStaff-granted Post/Edit permissions on Announcements, but
 *  must keep seeing the existing Communications presentation, not a new
 *  coach-workspace surface, at every width. isCoachOnly() already has
 *  exactly the right semantics (head_coach, assistant_coach, platform_admin
 *  as head-coach-equivalent — excludes booster and every member role).
 *  permissions.ts's own isStaff/isHeadCoach/isCoachOnly are untouched —
 *  this only decides which presentation an already-correctly-authorized
 *  actor sees. */
export function shouldShowDesktopCommunications(actor: TeamActor): boolean {
  return isCoachOnly(actor);
}
