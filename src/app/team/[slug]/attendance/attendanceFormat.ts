// Team Management Phase 5-4 — wording and date labels for the attendance
// screen. Session dates are calendar dates (YYYY-MM-DD) in the team's
// zone, so they are formatted as UTC dates — the device's time zone can
// never shift them. Times (when a session was saved) are shown in the
// team's zone.
import { ATTENDANCE_EDIT_WINDOW_DAYS, ATTENDANCE_NOTE_MAX, addCalendarDays } from "../../../../lib/teamAttendance.ts";
import type { AttendanceReadFailure, AttendanceSaveFailure } from "./attendanceApi.ts";
import type { AttendanceMode, EntryProblem, MergeNotice, SaveState } from "./attendanceEditor.ts";

function utcDate(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** "Tuesday, October 20, 2026" */
export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(utcDate(date));
}

/** "Tue, Oct 20" */
export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(utcDate(date));
}

/** "Oct 20" */
export function formatMonthDay(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(utcDate(date));
}

/** "Today", "Yesterday", or the weekday ("Mon"). */
export function relativeDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addCalendarDays(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(utcDate(date));
}

/** "Oct 20, 3:41 PM" in the team's zone (labelled UTC if the zone is unknown). */
export function formatSavedAt(instant: string, timeZone: string): string {
  const when = new Date(instant);
  if (Number.isNaN(when.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(when);
  }
}

export function editableWindowText(today: string): string {
  return `Attendance can be taken or changed for today and the previous ${ATTENDANCE_EDIT_WINDOW_DAYS} days (${formatMonthDay(addCalendarDays(today, -ATTENDANCE_EDIT_WINDOW_DAYS))} – ${formatMonthDay(today)}). Older dates are read-only.`;
}

export function readOnlyReasonText(reason: "date_not_editable" | "session_not_draft" | "date_in_future"): string {
  switch (reason) {
    case "date_not_editable": return `This date is more than ${ATTENDANCE_EDIT_WINDOW_DAYS} days ago, so its attendance is read-only.`;
    case "session_not_draft": return "This attendance has been finalized and can't be changed.";
    case "date_in_future": return "Attendance can't be taken for a future date.";
  }
}

export function modeLabel(mode: AttendanceMode): string {
  switch (mode.kind) {
    case "loading": return "Loading";
    case "draft": return mode.saved ? "Draft" : "Draft · not saved yet";
    case "read_only": return "Read-only";
  }
}

export function problemText(problem: EntryProblem): string {
  switch (problem) {
    case "reason_required": return "Choose Excused, Unexcused, or Other.";
    case "note_too_long": return `Notes can be up to ${ATTENDANCE_NOTE_MAX} characters.`;
    case "conflict": return "Another coach changed this athlete. Choose which version to keep.";
    case "server": return "This entry wasn't accepted. Check it and save again.";
  }
}

export function readFailureText(failure: AttendanceReadFailure | "invalid_roster"): string {
  switch (failure) {
    case "unauthorized": return "Your session has ended. Sign in again to take attendance.";
    case "forbidden": return "Only this team's coaches can take attendance.";
    case "not_found": return "This team couldn't be found.";
    case "invalid": return "That isn't a valid date.";
    case "network": return "Couldn't reach ELF. Check your connection and try again.";
    case "invalid_roster":
    case "unavailable": return "Attendance isn't available right now. Please try again.";
  }
}

export function saveFailureText(failure: AttendanceSaveFailure): string {
  switch (failure.kind) {
    case "conflict": return "Another coach saved this attendance first.";
    case "roster_changed": return "The roster changed while you were taking attendance.";
    case "read_only": return `Not saved. ${readOnlyReasonText(failure.reason)}`;
    case "invalid_records": return "Not saved. Some entries need attention.";
    case "invalid_request": return "Not saved. Reload the page and try again.";
    case "unauthorized": return "Not saved — your session has ended. Sign in again in another tab, then save. Your changes are still here, but they'll be lost if you leave this page.";
    case "forbidden": return "Not saved. Only this team's coaches can take attendance.";
    case "not_found": return "Not saved. This team couldn't be found.";
    case "unavailable": return "Not saved. Attendance isn't available right now — your changes are still here. Try again in a moment.";
    case "network": return "We couldn't confirm the save. Your changes are still here — check your connection and save again.";
    case "error": return "Not saved. Something went wrong — your changes are still here. Try again.";
  }
}

/** The status line next to Save Draft. Only "saved" claims success, and
 *  only after the server confirmed it. */
export function saveStatusText(save: SaveState, timeZone: string): string | null {
  switch (save.kind) {
    case "idle": return null;
    case "saving": return "Saving…";
    case "saved": return `Saved${save.savedAt ? ` at ${formatSavedAt(save.savedAt, timeZone)}` : ""}.`;
    case "saved_needs_reload": return "Saved. Reload to keep editing.";
    case "blocked": return "Not saved. Fix the highlighted entries first.";
    case "failed": return saveFailureText(save.failure);
    case "reload_failed": return save.cause === "conflict"
      ? "Not saved — another coach saved first, and their changes couldn't be loaded. Your changes are still here. Try again."
      : "Not saved — the roster changed, and the update couldn't be loaded. Your changes are still here. Try again.";
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What a merge did, in plain words (never silent). */
export function mergeNoticeLines(n: MergeNotice): { title: string; lines: string[] } {
  const title = n.cause === "conflict"
    ? "Another coach saved this attendance while you were editing."
    : "The roster changed while you were taking attendance.";
  const lines: string[] = [];
  if (n.keptMine > 0) lines.push(`${plural(n.keptMine, "of your changes was", "of your changes were")} kept.`);
  if (n.tookTheirs > 0) lines.push(`${plural(n.tookTheirs, "change")} from the other save ${n.tookTheirs === 1 ? "was" : "were"} brought in.`);
  if (n.identical > 0) lines.push(`${plural(n.identical, "athlete")} already matched your changes.`);
  if (n.added > 0) lines.push(`${plural(n.added, "athlete")} joined the roster.`);
  if (n.removed > 0) lines.push(`${plural(n.removed, "athlete")} left the roster.`);
  if (n.lostChangeNames.length > 0) lines.push(`Your changes for ${n.lostChangeNames.join(", ")} couldn't be kept because they're no longer on the roster.`);
  if (n.conflicts > 0) lines.push(`${plural(n.conflicts, "athlete")} changed in both versions — choose which to keep below.`);
  lines.push(n.conflicts > 0 ? "Nothing has been saved yet." : "Nothing has been saved yet. Review and select Save Draft.");
  return { title, lines };
}
