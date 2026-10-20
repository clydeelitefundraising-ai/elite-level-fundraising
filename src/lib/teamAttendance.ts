// Team Management Phase 5 — attendance drafts: core business rules.
//
// Pure (no I/O, no browser storage) so the server routes, the attendance
// editor and Node's test runner all share one definition. The DATABASE is
// the final authority (supabase/migrations/phase_t5_attendance_drafts.sql,
// team_attendance_save_draft()); these functions mirror its rules exactly
// so the editor can show the same answers before a save, and
// teamAttendance.test.ts checks the constants against the migration.
//
// The draft model (roster, edits, unsaved changes, save payload, merging
// another coach's save) is in teamAttendanceDraft.ts.
//
//   Access     Head Coach, Assistant Coach, platform admin: view + edit.
//              Everyone else: nothing. Same set as isCoachOnly; built on
//              teamAttendanceActor.ts (the only place the database actor
//              is derived — always from the server-resolved session).
//   Dates      One session per team per LOCAL calendar date in the team's
//              time zone (America/Phoenix for now). Editable: today and
//              the previous 14 days. Future: never. Older: read-only.
//              An existing session is judged in the zone it was created
//              in. "Today" comes from the server/database, never from the
//              browser clock or UTC.
//   Marks      Present, or Absent with exactly one reason (Excused,
//              Unexcused, Other) and an optional note (<= 500 characters,
//              trimmed like the database, empty -> none). Back to Present
//              clears the reason and note. A reason is never invented.
//   Privacy    Errors carry fixed codes and, at most, an athlete id —
//              never names or notes.
import type { TeamActor } from "./permissions.ts";
import { canEditAttendance } from "./teamAttendanceActor.ts";
import { DEFAULT_TEAM_TIME_ZONE } from "./teamTaskCompletion.ts";

// ── Constants (mirroring phase_t5_attendance_drafts.sql) ──────────────────

export const ATTENDANCE_STATUSES = ["present", "absent"] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

export const ABSENCE_REASONS = ["excused", "unexcused", "other"] as const;
export type AbsenceReason = typeof ABSENCE_REASONS[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = { present: "Present", absent: "Absent" };
export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = { excused: "Excused", unexcused: "Unexcused", other: "Other" };

/** Characters (Unicode code points, like PostgreSQL char_length). */
export const ATTENDANCE_NOTE_MAX = 500;
/** Today plus this many previous calendar days are editable. */
export const ATTENDANCE_EDIT_WINDOW_DAYS = 14;
/** The save function refuses larger submissions. */
export const ATTENDANCE_MAX_RECORDS = 5000;
/** Until per-team zones exist (see team_attendance_time_zone()). */
export const DEFAULT_ATTENDANCE_TIME_ZONE = DEFAULT_TEAM_TIME_ZONE;

// ── Errors ────────────────────────────────────────────────────────────────

export type AttendanceRuleCode =
  | "invalid_date"
  | "invalid_time_zone"
  | "date_in_future"
  | "date_not_editable"
  | "session_not_draft"
  | "draft_read_only"
  | "invalid_status"
  | "invalid_reason"
  | "reason_required"
  | "invalid_note"
  | "note_too_long"
  | "note_requires_absent"
  | "athlete_unknown"
  | "athlete_not_editable"
  | "athlete_required"
  | "late_athlete_not_included"
  | "duplicate_athlete"
  | "invalid_roster"
  | "roster_empty"
  | "too_many_records"
  | "unresolved_conflicts"
  | "unknown_conflict";

const RULE_MESSAGES: Record<AttendanceRuleCode, string> = {
  invalid_date:          "That isn't a valid date.",
  invalid_time_zone:     "The team's time zone isn't valid.",
  date_in_future:        "Attendance can't be taken for a future date.",
  date_not_editable:     `Attendance older than ${ATTENDANCE_EDIT_WINDOW_DAYS} days is read-only.`,
  session_not_draft:     "This attendance has been finalized and can't be changed.",
  draft_read_only:       "This attendance is read-only.",
  invalid_status:        "Choose Present or Absent.",
  invalid_reason:        "Choose Excused, Unexcused, or Other.",
  reason_required:       "Choose a reason for each absent athlete.",
  invalid_note:          "Notes must be text.",
  note_too_long:         `Notes must be ${ATTENDANCE_NOTE_MAX} characters or fewer.`,
  note_requires_absent:  "Notes can only be added for absent athletes.",
  athlete_unknown:       "That athlete isn't on this attendance list.",
  athlete_not_editable:  "That athlete is no longer on the roster; their saved attendance can't be changed.",
  athlete_required:      "This athlete must be included.",
  late_athlete_not_included: "This athlete joined the roster after this date. Choose whether to include them first.",
  duplicate_athlete:     "An athlete appears more than once.",
  invalid_roster:        "The attendance list couldn't be read. Reload and try again.",
  roster_empty:          "There are no athletes to take attendance for.",
  too_many_records:      `Attendance can include at most ${ATTENDANCE_MAX_RECORDS} athletes.`,
  unresolved_conflicts:  "Another coach changed some of the same athletes. Choose which version to keep first.",
  unknown_conflict:      "That change is no longer in conflict.",
};

/** A rule violation. The message is fixed text for the code; athleteId is
 *  the only data attached — never a name or a note. */
export class AttendanceRuleError extends Error {
  readonly code: AttendanceRuleCode;
  readonly athleteId: string | null;
  constructor(code: AttendanceRuleCode, athleteId: string | null = null) {
    super(RULE_MESSAGES[code]);
    this.name = "AttendanceRuleError";
    this.code = code;
    this.athleteId = athleteId;
  }
}

export function attendanceRuleMessage(code: AttendanceRuleCode): string {
  return RULE_MESSAGES[code];
}

export type AttendanceIssue = { code: AttendanceRuleCode; athleteId: string | null };

// ── Access ────────────────────────────────────────────────────────────────

export type AttendanceAccess = "edit" | "none";

/** View and edit go together: Head Coach, Assistant Coach, platform admin
 *  (isCoachOnly's set, via attendanceDbActor). Boosters, parents, athletes
 *  and signed-out visitors get nothing. Always pass the TeamActor that
 *  getTeamActor(slug) resolved on the server — never anything from the
 *  request. */
export function attendanceAccess(actor: TeamActor): AttendanceAccess {
  return canEditAttendance(actor) ? "edit" : "none";
}

export function canViewAttendance(actor: TeamActor): boolean {
  return attendanceAccess(actor) === "edit";
}

export { canEditAttendance };

// ── Calendar dates (YYYY-MM-DD, no clock involved) ────────────────────────

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in strict YYYY-MM-DD form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function requireIsoDate(value: string): void {
  if (!isIsoDate(value)) throw new AttendanceRuleError("invalid_date");
}

/** date + days, on the calendar (no time zone involved). */
export function addCalendarDays(date: string, days: number): string {
  requireIsoDate(date);
  if (!Number.isInteger(days)) throw new AttendanceRuleError("invalid_date");
  const [y, mo, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d) + days * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** The calendar date of an instant in a time zone — the same answer as
 *  the database's team_attendance_local_date(). Never the device's zone. */
export function localDateInZone(instant: Date | string | number, timeZone: string): string {
  const when = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(when.getTime())) throw new AttendanceRuleError("invalid_date");
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    throw new AttendanceRuleError("invalid_time_zone");
  }
  const parts = Object.fromEntries(fmt.formatToParts(when).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Whether an athlete was added to the roster after a session date, in
 *  the session's zone. A missing add date counts as on the roster (false),
 *  matching the revised migration. */
export function addedAfterSessionDate(createdAt: string | null | undefined, sessionDate: string, timeZone: string): boolean {
  requireIsoDate(sessionDate);
  if (createdAt == null) return false;
  return localDateInZone(createdAt, timeZone) > sessionDate;
}

// ── Date eligibility ──────────────────────────────────────────────────────

export type DateEligibility =
  | "editable"     // today or one of the previous 14 days
  | "future"       // can't be taken yet
  | "read_only";   // older than the window: readable, not editable

/** Same rule as team_attendance_date_editable(). `today` must be the
 *  team's local date from the server (team_attendance_today()). */
export function attendanceDateEligibility(sessionDate: string, today: string): DateEligibility {
  requireIsoDate(sessionDate);
  requireIsoDate(today);
  if (sessionDate > today) return "future";
  if (sessionDate < addCalendarDays(today, -ATTENDANCE_EDIT_WINDOW_DAYS)) return "read_only";
  return "editable";
}

/** The dates a coach can pick for editing, newest first (today ... 14 days ago). */
export function editableAttendanceDates(today: string): string[] {
  requireIsoDate(today);
  return Array.from({ length: ATTENDANCE_EDIT_WINDOW_DAYS + 1 }, (_, i) => addCalendarDays(today, -i));
}

export type SessionEditability =
  | { editable: true }
  | { editable: false; reason: "session_not_draft" | "date_in_future" | "date_not_editable" };

/** Whether a date can be saved, checked in the same order as the save
 *  function: a non-draft session first (Phase 6), then the date — judged
 *  in the session's own time zone if it exists, otherwise the team's. */
export function sessionEditability(
  input: { sessionDate: string; status?: string | null; timeZone?: string | null },
  now: Date,
): SessionEditability {
  if (input.status != null && input.status !== "draft") return { editable: false, reason: "session_not_draft" };
  const today = localDateInZone(now, input.timeZone || DEFAULT_ATTENDANCE_TIME_ZONE);
  const eligibility = attendanceDateEligibility(input.sessionDate, today);
  if (eligibility === "future") return { editable: false, reason: "date_in_future" };
  if (eligibility === "read_only") return { editable: false, reason: "date_not_editable" };
  return { editable: true };
}

// ── Marks (one athlete's attendance) ──────────────────────────────────────

/** Present never carries a reason or note. Absent carries a reason once
 *  the coach chooses one (null until then — a draft that can't be saved
 *  yet) and an optional note. */
export type AttendanceMark =
  | { status: "present"; absenceReason: null; note: null }
  | { status: "absent"; absenceReason: AbsenceReason | null; note: string | null };

export const PRESENT: AttendanceMark = Object.freeze({ status: "present", absenceReason: null, note: null });

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export function isAbsenceReason(value: unknown): value is AbsenceReason {
  return typeof value === "string" && (ABSENCE_REASONS as readonly string[]).includes(value);
}

/** The database trims exactly these (btrim(note, E' \t\r\n')). */
const NOTE_EDGE_WS = /^[ \t\r\n]+|[ \t\r\n]+$/g;

/** A note as the database will store it: trimmed of spaces, tabs and line
 *  breaks at both ends; empty -> null. Throws for non-text or more than
 *  500 characters (counted like PostgreSQL: by code point). */
export function normalizeAttendanceNote(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") throw new AttendanceRuleError("invalid_note");
  const trimmed = raw.replace(NOTE_EDGE_WS, "");
  if (!trimmed) return null;
  if (Array.from(trimmed).length > ATTENDANCE_NOTE_MAX) throw new AttendanceRuleError("note_too_long");
  return trimmed;
}

/** Characters remaining for a note being typed (may go negative). */
export function noteCharactersRemaining(raw: string): number {
  return ATTENDANCE_NOTE_MAX - Array.from(raw.replace(NOTE_EDGE_WS, "")).length;
}

/** Absent -> Present: the reason and note are cleared. */
export function markPresent(): AttendanceMark {
  return PRESENT;
}

/** Present -> Absent: no reason until the coach picks one (never
 *  invented). Already absent: unchanged unless a reason is given. */
export function markAbsent(current: AttendanceMark, reason: AbsenceReason | null = null): AttendanceMark {
  if (reason !== null && !isAbsenceReason(reason)) throw new AttendanceRuleError("invalid_reason");
  if (current.status === "absent") return { ...current, absenceReason: reason ?? current.absenceReason };
  return { status: "absent", absenceReason: reason, note: null };
}

export function withAbsenceReason(current: AttendanceMark, reason: AbsenceReason): AttendanceMark {
  if (!isAbsenceReason(reason)) throw new AttendanceRuleError("invalid_reason");
  if (current.status !== "absent") throw new AttendanceRuleError("invalid_reason");
  return { ...current, absenceReason: reason };
}

/** Sets an absent athlete's note (raw text is kept while editing; it is
 *  normalized when compared or saved). */
export function withNote(current: AttendanceMark, note: string | null): AttendanceMark {
  if (current.status !== "absent") throw new AttendanceRuleError("note_requires_absent");
  if (note != null && typeof note !== "string") throw new AttendanceRuleError("invalid_note");
  return { ...current, note };
}

/** The mark exactly as it would be saved: note normalized. Throws for an
 *  absent mark with no reason (reason_required) or an invalid note. */
export function finalizeMark(mark: AttendanceMark): AttendanceMark {
  if (mark.status === "present") {
    if (mark.absenceReason !== null || mark.note !== null) throw new AttendanceRuleError("invalid_status");
    return PRESENT;
  }
  if (mark.status !== "absent") throw new AttendanceRuleError("invalid_status");
  if (mark.absenceReason === null) throw new AttendanceRuleError("reason_required");
  if (!isAbsenceReason(mark.absenceReason)) throw new AttendanceRuleError("invalid_reason");
  return { status: "absent", absenceReason: mark.absenceReason, note: normalizeAttendanceNote(mark.note) };
}

/** Builds a mark from untrusted/stored values, strictly (as saved data must be). */
export function markFromStored(status: unknown, reason: unknown, note: unknown): AttendanceMark {
  if (status === "present") {
    if (reason != null || note != null) throw new AttendanceRuleError("invalid_status");
    return PRESENT;
  }
  if (status !== "absent") throw new AttendanceRuleError("invalid_status");
  if (!isAbsenceReason(reason)) throw new AttendanceRuleError(reason == null ? "reason_required" : "invalid_reason");
  return { status: "absent", absenceReason: reason, note: normalizeAttendanceNote(note) };
}

/** Same attendance once normalized (whitespace-only note edits don't count). */
export function sameMark(a: AttendanceMark, b: AttendanceMark): boolean {
  if (a.status !== b.status) return false;
  if (a.status === "present") return true;
  return a.absenceReason === b.absenceReason && safeNote(a.note) === safeNote(b.note);
}

/** Which parts of two marks differ (for conflict explanations). */
export function markDifferences(a: AttendanceMark, b: AttendanceMark): ("status" | "absence_reason" | "note")[] {
  const out: ("status" | "absence_reason" | "note")[] = [];
  if (a.status !== b.status) out.push("status");
  if (a.absenceReason !== b.absenceReason) out.push("absence_reason");
  if (safeNote(a.note) !== safeNote(b.note)) out.push("note");
  return out;
}

function safeNote(note: string | null): string | null {
  if (note == null) return null;
  const trimmed = note.replace(NOTE_EDGE_WS, "");
  return trimmed || null;
}

// ── Totals ────────────────────────────────────────────────────────────────

export type AttendanceTotals = {
  /** Athletes counted: included and currently on the roster. */
  total: number;
  present: number;
  absent: number;
  excused: number;
  unexcused: number;
  other: number;
  /** Absent with no reason chosen yet (only possible in an unsaved draft). */
  reasonMissing: number;
  /** Saved records kept for athletes no longer on the roster — never in the counts above. */
  removed: number;
  /** present / total, or null when nobody is counted. */
  presentRate: number | null;
  /** presentRate as a percentage with one decimal, or null. */
  presentPercent: number | null;
  state: "data" | "no_data";
};

export function computeAttendanceTotals(
  marks: readonly AttendanceMark[],
  removed = 0,
): AttendanceTotals {
  let present = 0, absent = 0, excused = 0, unexcused = 0, other = 0, reasonMissing = 0;
  for (const m of marks) {
    if (m.status === "present") present++;
    else {
      absent++;
      if (m.absenceReason === "excused") excused++;
      else if (m.absenceReason === "unexcused") unexcused++;
      else if (m.absenceReason === "other") other++;
      else reasonMissing++;
    }
  }
  return withRate({ total: present + absent, present, absent, excused, unexcused, other, reasonMissing, removed: Math.max(0, removed) });
}

/** The same totals from a team_attendance_session_summaries() row, whose
 *  present/absent counts already exclude removed athletes. */
export function totalsFromSummary(row: {
  present_count: number; absent_count: number; excused_count: number;
  unexcused_count: number; other_count: number; removed_count: number;
}): AttendanceTotals {
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);
  const present = n(row.present_count), absent = n(row.absent_count);
  return withRate({
    total: present + absent, present, absent,
    excused: n(row.excused_count), unexcused: n(row.unexcused_count), other: n(row.other_count),
    reasonMissing: 0, removed: n(row.removed_count),
  });
}

function withRate(t: Omit<AttendanceTotals, "presentRate" | "presentPercent" | "state">): AttendanceTotals {
  if (t.total === 0) return { ...t, presentRate: null, presentPercent: null, state: "no_data" };
  const rate = t.present / t.total;
  return { ...t, presentRate: rate, presentPercent: Math.round(rate * 1000) / 10, state: "data" };
}

// ── Database error codes ──────────────────────────────────────────────────

/** Every fixed code team_attendance_save_draft() and the read functions raise. */
export const ATTENDANCE_DB_ERRORS = [
  "attendance_team_not_found", "attendance_actor_invalid", "attendance_actor_not_authorized",
  "attendance_date_invalid", "attendance_date_in_future", "attendance_date_not_editable",
  "attendance_version_invalid", "attendance_version_conflict", "attendance_session_not_found",
  "attendance_session_not_draft", "attendance_records_invalid", "attendance_records_too_many",
  "attendance_record_invalid", "attendance_athlete_duplicate", "attendance_athlete_cross_team",
  "attendance_athlete_removed", "attendance_roster_incomplete", "attendance_late_athlete_unconfirmed",
  "attendance_roster_empty", "attendance_range_invalid",
] as const;
export type AttendanceDbError = typeof ATTENDANCE_DB_ERRORS[number];

/** What the editor should do about a refused save. */
export type AttendanceSaveOutcome =
  | "conflict"        // someone else saved first: reload and merge (teamAttendanceDraft.mergeServerDraft)
  | "roster_changed"  // the roster changed underneath: reload and merge
  | "read_only"       // finalized, or out of the window
  | "forbidden"       // not allowed to edit this team's attendance
  | "invalid"         // the submission itself was malformed (a bug)
  | "not_found"
  | "error";

const OUTCOMES: Record<AttendanceDbError, AttendanceSaveOutcome> = {
  attendance_team_not_found: "not_found",
  attendance_actor_invalid: "forbidden",
  attendance_actor_not_authorized: "forbidden",
  attendance_date_invalid: "invalid",
  attendance_date_in_future: "read_only",
  attendance_date_not_editable: "read_only",
  attendance_version_invalid: "invalid",
  attendance_version_conflict: "conflict",
  attendance_session_not_found: "conflict",
  attendance_session_not_draft: "read_only",
  attendance_records_invalid: "invalid",
  attendance_records_too_many: "invalid",
  attendance_record_invalid: "invalid",
  attendance_athlete_duplicate: "invalid",
  attendance_athlete_cross_team: "invalid",
  attendance_athlete_removed: "roster_changed",
  attendance_roster_incomplete: "roster_changed",
  attendance_late_athlete_unconfirmed: "roster_changed",
  attendance_roster_empty: "roster_changed",
  attendance_range_invalid: "invalid",
};

/** Finds the fixed code in a database error message ("unknown" otherwise).
 *  Never echoes the message itself. */
export function attendanceDbErrorCode(message: unknown): AttendanceDbError | "unknown" {
  if (typeof message !== "string") return "unknown";
  const found = ATTENDANCE_DB_ERRORS.filter(code => new RegExp(`\\b${code}\\b`).test(message));
  // Longest match wins (attendance_record_invalid vs attendance_records_invalid are distinct words).
  return found.sort((a, b) => b.length - a.length)[0] ?? "unknown";
}

export function attendanceSaveOutcome(code: AttendanceDbError | "unknown"): AttendanceSaveOutcome {
  return code === "unknown" ? "error" : OUTCOMES[code];
}
