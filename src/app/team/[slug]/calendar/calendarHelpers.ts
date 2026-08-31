// Pure helpers for the Phase D4 desktop Calendar workspace — extracted so
// eligibility and overflow truncation are directly unit-testable without
// any component-render infrastructure (same pattern as
// src/app/team/[slug]/team/rosterHelpers.ts). DesktopCalendarView.tsx /
// DesktopMonthGrid.tsx are the only consumers.
import { isCoachOnly, type TeamActor } from "../../../../lib/permissions.ts";

/** Whether this actor sees the desktop Calendar workspace instead of the
 *  existing mobile-style Calendar at desktop widths. Deliberately NOT
 *  isStaff() — matches the exact boundary D2's Coach Dashboard
 *  (shouldShowCoachDashboard) and D3's Desktop Roster
 *  (shouldShowDesktopRoster) already established: boosters keep their
 *  existing isStaff-granted Add/Edit/Delete Event access, but must keep
 *  seeing the existing Calendar presentation, not a new coach-workspace
 *  surface, at every width. isCoachOnly() already has exactly the right
 *  semantics (head_coach, assistant_coach, platform_admin as
 *  head-coach-equivalent — excludes booster and every member role).
 *  permissions.ts's own isStaff/isHeadCoach/isCoachOnly are untouched —
 *  this only decides which presentation an already-correctly-authorized
 *  actor sees. */
export function shouldShowDesktopCalendar(actor: TeamActor): boolean {
  return isCoachOnly(actor);
}

// ─── Desktop day-cell overflow ───────────────────────────────────────────────

export const DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY = 3;

export type DaySplit<T> = { visible: T[]; overflowCount: number };

/** Deterministic truncation for a single day's events in the desktop month
 *  grid — a cell never grows past DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY
 *  regardless of how many events actually fall on that day; the remainder
 *  is exposed as a count for a "+N more" affordance. Assumes the input is
 *  already in the app's canonical order (calendarShared.ts's
 *  groupEventsByDate preserves the input order of getCalendarEvents'
 *  event_date/event_time-sorted query), so this never re-sorts. */
export function splitDayEvents<T>(
  evs: T[],
  max: number = DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY,
): DaySplit<T> {
  if (evs.length <= max) return { visible: evs, overflowCount: 0 };
  return { visible: evs.slice(0, max), overflowCount: evs.length - max };
}
