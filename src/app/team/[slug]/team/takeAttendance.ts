// Team Management Phase 5-5 — the roster's Take Attendance entry point.
// Who sees it is the attendance screen's own rule (canViewAttendance:
// Head Coach, Assistant Coach, platform admin of this team), applied to
// the actor the server resolved for this team. The attendance page and
// APIs enforce the same rule on every request; this only decides whether
// the link is shown.
import type { TeamActor } from "../../../../lib/permissions.ts";
import { canViewAttendance } from "../../../../lib/teamAttendance.ts";

/** The team's attendance screen (today, from the server, by default). */
export function attendancePath(slug: string): string {
  return `/team/${encodeURIComponent(slug)}/attendance`;
}

/** Where the attendance screen's back link returns: this team's roster. */
export function rosterPath(slug: string): string {
  return `/team/${encodeURIComponent(slug)}/team?tab=roster`;
}

/** The team's Attendance Reports screen. */
export function attendanceReportsPath(slug: string): string {
  return `/team/${encodeURIComponent(slug)}/attendance/reports`;
}

/** The Attendance Reports link for this actor (same people as attendance
 *  itself), or null to show nothing. Unlike Take Attendance it stays in a
 *  completed season: reports are read-only history. */
export function attendanceReportsHref(slug: string, actor: TeamActor): string | null {
  return canViewAttendance(actor) ? attendanceReportsPath(slug) : null;
}

/** The Take Attendance link for this actor, or null to show nothing. */
export function takeAttendanceHref(slug: string, actor: TeamActor): string | null {
  return canViewAttendance(actor) ? attendancePath(slug) : null;
}
