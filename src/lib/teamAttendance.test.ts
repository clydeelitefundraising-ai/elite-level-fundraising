// Team Management Phase 5-2 — attendance core rules, and their agreement
// with the installed migration (phase_t5_attendance_drafts.sql).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ABSENCE_REASONS,
  ATTENDANCE_DB_ERRORS,
  ATTENDANCE_EDIT_WINDOW_DAYS,
  ATTENDANCE_MAX_RECORDS,
  ATTENDANCE_NOTE_MAX,
  ATTENDANCE_STATUSES,
  AttendanceRuleError,
  DEFAULT_ATTENDANCE_TIME_ZONE,
  PRESENT,
  addCalendarDays,
  addedAfterSessionDate,
  attendanceAccess,
  attendanceDateEligibility,
  attendanceDbErrorCode,
  attendanceRuleMessage,
  attendanceSaveOutcome,
  canEditAttendance,
  canViewAttendance,
  computeAttendanceTotals,
  editableAttendanceDates,
  finalizeMark,
  isIsoDate,
  localDateInZone,
  markAbsent,
  markDifferences,
  markFromStored,
  markPresent,
  noteCharactersRemaining,
  normalizeAttendanceNote,
  sameMark,
  sessionEditability,
  totalsFromSummary,
  withAbsenceReason,
  withNote,
  type AttendanceMark,
} from "./teamAttendance.ts";
import { isCoachOnly, type TeamActor } from "./permissions.ts";

const sql = readFileSync(new URL("../../supabase/migrations/phase_t5_attendance_drafts.sql", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n").replace(/--.*$/gm, "");
const source = readFileSync(new URL("./teamAttendance.ts", import.meta.url), "utf8");
const draftSource = readFileSync(new URL("./teamAttendanceDraft.ts", import.meta.url), "utf8");

const code = (fn: () => unknown): string => {
  try { fn(); } catch (err) { if (err instanceof AttendanceRuleError) return err.code; throw err; }
  return "no error";
};
const NBSP = String.fromCharCode(0xa0);
const RUNNER = String.fromCodePoint(0x1f3c3); // outside the BMP: 2 UTF-16 units, 1 character

// ── Access ────────────────────────────────────────────────────────────────

const coach = (role: string) => ({ kind: "coach", session: { id: "c-1", name: "C", role, campaign_slug: "t" } }) as unknown as TeamActor;
const member = (role: string) => ({ kind: "member", session: { id: "m-1", name: "M", role, campaign_slug: "t", athlete_id: null } }) as unknown as TeamActor;
const admin = { kind: "platform_admin", session: { platformAdminId: "pa-1", accountId: "a", name: "A", email: "a@x", campaign_slug: "t" } } as TeamActor;
const anyone = { kind: "public" } as TeamActor;

test("access: Head Coach, Assistant Coach and platform admin view and edit; nobody else", () => {
  for (const a of [coach("head_coach"), coach("assistant_coach"), admin]) {
    assert.equal(attendanceAccess(a), "edit");
    assert.equal(canViewAttendance(a), true);
    assert.equal(canEditAttendance(a), true);
  }
  for (const a of [coach("booster"), member("booster"), member("parent"), member("athlete"), anyone]) {
    assert.equal(attendanceAccess(a), "none");
    assert.equal(canViewAttendance(a), false);
    assert.equal(canEditAttendance(a), false);
  }
});

test("access matches the existing isCoachOnly semantics for every actor kind", () => {
  for (const a of [coach("head_coach"), coach("assistant_coach"), coach("booster"), member("booster"), member("parent"), member("athlete"), admin, anyone]) {
    assert.equal(canViewAttendance(a), isCoachOnly(a));
  }
});

// ── Dates ─────────────────────────────────────────────────────────────────

test("strict calendar dates", () => {
  for (const ok of ["2026-10-19", "2028-02-29", "2026-12-31", "2027-01-01"]) assert.ok(isIsoDate(ok), ok);
  for (const bad of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-1-5", "2026-10-19T00:00", " 2026-10-19", "", null, 20261019, "0000-01-01"]) {
    assert.ok(!isIsoDate(bad), String(bad));
  }
});

test("calendar arithmetic crosses months, years and leap days", () => {
  assert.equal(addCalendarDays("2026-10-19", -14), "2026-10-05");
  assert.equal(addCalendarDays("2027-01-01", -14), "2026-12-18");
  assert.equal(addCalendarDays("2028-03-01", -1), "2028-02-29");
  assert.equal(addCalendarDays("2026-03-01", -1), "2026-02-28");
  assert.equal(code(() => addCalendarDays("2026-02-30", 1)), "invalid_date");
  assert.equal(code(() => addCalendarDays("2026-10-19", 1.5)), "invalid_date");
});

test("Phoenix midnight: local dates come from the team zone, never UTC or the device", () => {
  assert.equal(localDateInZone("2026-10-20T06:59:59Z", "America/Phoenix"), "2026-10-19");
  assert.equal(localDateInZone("2026-10-20T07:00:00Z", "America/Phoenix"), "2026-10-20");
  assert.equal(localDateInZone("2026-10-20T03:00:00Z", "America/Phoenix"), "2026-10-19"); // already the 20th in UTC
  // No daylight saving in Phoenix (UTC-7 all year), including the US DST start day.
  assert.equal(localDateInZone("2026-07-01T06:59:59Z", "America/Phoenix"), "2026-06-30");
  assert.equal(localDateInZone("2026-03-08T06:59:59Z", "America/Phoenix"), "2026-03-07");
  assert.equal(localDateInZone("2026-03-08T07:00:00Z", "America/Phoenix"), "2026-03-08");
  // Other zones (future per-team zones), across DST.
  assert.equal(localDateInZone("2026-07-01T03:59:59Z", "America/New_York"), "2026-06-30");
  assert.equal(localDateInZone("2026-01-15T04:59:59Z", "America/New_York"), "2026-01-14");
  assert.equal(DEFAULT_ATTENDANCE_TIME_ZONE, "America/Phoenix");
  assert.equal(code(() => localDateInZone(new Date(), "Mars/Olympus")), "invalid_time_zone");
  assert.equal(code(() => localDateInZone("not a date", "America/Phoenix")), "invalid_date");
});

test("added after the session date: in the session zone; a missing add date counts as on the roster", () => {
  assert.equal(addedAfterSessionDate(null, "2026-10-19", "America/Phoenix"), false);
  assert.equal(addedAfterSessionDate(undefined, "2026-10-19", "America/Phoenix"), false);
  assert.equal(addedAfterSessionDate("2026-10-19T23:00:00Z", "2026-10-19", "America/Phoenix"), false); // 16:00 local
  assert.equal(addedAfterSessionDate("2026-10-20T06:59:59Z", "2026-10-19", "America/Phoenix"), false); // 23:59:59 local
  assert.equal(addedAfterSessionDate("2026-10-20T07:00:00Z", "2026-10-19", "America/Phoenix"), true);
  assert.equal(addedAfterSessionDate("2026-01-01T12:00:00Z", "2026-10-19", "America/Phoenix"), false);
});

test("date eligibility: today and 14 days back editable; older read-only; future never", () => {
  const today = "2026-10-19";
  assert.equal(attendanceDateEligibility(today, today), "editable");
  assert.equal(attendanceDateEligibility("2026-10-05", today), "editable");
  assert.equal(attendanceDateEligibility("2026-10-04", today), "read_only");
  assert.equal(attendanceDateEligibility("2025-10-19", today), "read_only");
  assert.equal(attendanceDateEligibility("2026-10-20", today), "future");
  assert.equal(attendanceDateEligibility("2026-12-18", "2027-01-01"), "editable");
  assert.equal(attendanceDateEligibility("2026-12-17", "2027-01-01"), "read_only");
  assert.equal(code(() => attendanceDateEligibility("2026-10-32", today)), "invalid_date");
  assert.equal(code(() => attendanceDateEligibility(today, "yesterday")), "invalid_date");
  const dates = editableAttendanceDates(today);
  assert.equal(dates.length, ATTENDANCE_EDIT_WINDOW_DAYS + 1);
  assert.equal(dates[0], today);
  assert.equal(dates.at(-1), "2026-10-05");
});

test("session editability: non-draft first (like the save function), then the date in the SESSION's zone", () => {
  const now = new Date("2026-10-20T05:30:00Z"); // Phoenix: Oct 19 22:30. New York: Oct 20 01:30.
  assert.deepEqual(sessionEditability({ sessionDate: "2026-10-19" }, now), { editable: true });
  assert.deepEqual(sessionEditability({ sessionDate: "2026-10-20" }, now), { editable: false, reason: "date_in_future" });
  assert.deepEqual(sessionEditability({ sessionDate: "2026-10-20", timeZone: "America/New_York" }, now), { editable: true });
  assert.deepEqual(sessionEditability({ sessionDate: "2026-10-05", timeZone: "America/Phoenix" }, now), { editable: true });
  assert.deepEqual(sessionEditability({ sessionDate: "2026-10-05", timeZone: "America/New_York" }, now), { editable: false, reason: "date_not_editable" });
  assert.deepEqual(sessionEditability({ sessionDate: "2026-10-19", status: "finalized" }, now), { editable: false, reason: "session_not_draft" });
  assert.deepEqual(sessionEditability({ sessionDate: "2026-10-25", status: "finalized" }, now), { editable: false, reason: "session_not_draft" });
});

// ── Notes ─────────────────────────────────────────────────────────────────

test("notes are trimmed exactly like the database (space, tab, CR, LF); empty becomes none", () => {
  assert.equal(normalizeAttendanceNote("  Doctor appointment \n"), "Doctor appointment");
  assert.equal(normalizeAttendanceNote("\t\r\n line one\nline two \r\n"), "line one\nline two");
  assert.equal(normalizeAttendanceNote(" \t\r\n "), null);
  assert.equal(normalizeAttendanceNote(""), null);
  assert.equal(normalizeAttendanceNote(null), null);
  assert.equal(normalizeAttendanceNote(undefined), null);
  // The database's btrim(note, E' \t\r\n') leaves other whitespace alone; so do we.
  assert.equal(normalizeAttendanceNote(`${NBSP}x${NBSP}`), `${NBSP}x${NBSP}`);
  assert.equal(code(() => normalizeAttendanceNote(5)), "invalid_note");
  assert.equal(code(() => normalizeAttendanceNote({})), "invalid_note");
});

test("notes: at most 500 characters, counted like PostgreSQL (code points, after trimming)", () => {
  assert.equal(normalizeAttendanceNote("x".repeat(500))?.length, 500);
  assert.equal(code(() => normalizeAttendanceNote("x".repeat(501))), "note_too_long");
  assert.equal(normalizeAttendanceNote(`   ${"x".repeat(500)}   `)?.length, 500);
  assert.equal(Array.from(normalizeAttendanceNote(RUNNER.repeat(500))!).length, 500); // 1,000 UTF-16 units, 500 characters
  assert.equal(code(() => normalizeAttendanceNote(RUNNER.repeat(501))), "note_too_long");
  assert.equal(noteCharactersRemaining(" ab "), ATTENDANCE_NOTE_MAX - 2);
  assert.equal(noteCharactersRemaining("x".repeat(510)), -10);
});

// ── Marks ─────────────────────────────────────────────────────────────────

const absent = (reason: "excused" | "unexcused" | "other" | null, note: string | null = null): AttendanceMark =>
  ({ status: "absent", absenceReason: reason, note });

test("Absent -> Present clears the reason and the note", () => {
  assert.deepEqual(markPresent(), { status: "present", absenceReason: null, note: null });
  assert.deepEqual(markPresent(), PRESENT);
});

test("Present -> Absent never invents a reason; already absent keeps reason and note", () => {
  assert.deepEqual(markAbsent(PRESENT), absent(null));
  for (const r of ABSENCE_REASONS) assert.deepEqual(markAbsent(PRESENT, r), absent(r));
  assert.deepEqual(markAbsent(absent("excused", "Doctor")), absent("excused", "Doctor"));
  assert.deepEqual(markAbsent(absent("excused", "Doctor"), "other"), absent("other", "Doctor"));
  assert.equal(code(() => markAbsent(PRESENT, "sick" as never)), "invalid_reason");
});

test("reasons and notes only apply to absent athletes", () => {
  assert.deepEqual(withAbsenceReason(absent(null), "unexcused"), absent("unexcused"));
  assert.equal(code(() => withAbsenceReason(PRESENT, "excused")), "invalid_reason");
  assert.equal(code(() => withAbsenceReason(absent(null), "late" as never)), "invalid_reason");
  assert.deepEqual(withNote(absent("other"), " raw "), absent("other", " raw "));
  assert.equal(code(() => withNote(PRESENT, "x")), "note_requires_absent");
  assert.equal(code(() => withNote(absent("other"), 7 as never)), "invalid_note");
});

test("saving a mark: Absent needs a reason; notes normalized; Present carries nothing", () => {
  assert.equal(code(() => finalizeMark(absent(null))), "reason_required");
  for (const r of ABSENCE_REASONS) assert.deepEqual(finalizeMark(absent(r, "  ok ")), absent(r, "ok"));
  assert.deepEqual(finalizeMark(absent("other", "   ")), absent("other", null));
  assert.equal(code(() => finalizeMark(absent("other", "x".repeat(501)))), "note_too_long");
  assert.deepEqual(finalizeMark(PRESENT), PRESENT);
  assert.equal(code(() => finalizeMark({ status: "present", absenceReason: "excused", note: null } as never)), "invalid_status");
  assert.equal(code(() => finalizeMark({ status: "present", absenceReason: null, note: "x" } as never)), "invalid_status");
  assert.equal(code(() => finalizeMark({ status: "late" } as never)), "invalid_status");
  assert.equal(code(() => finalizeMark(absent("sick" as never))), "invalid_reason");
});

test("stored marks are read strictly", () => {
  assert.deepEqual(markFromStored("present", null, null), PRESENT);
  assert.deepEqual(markFromStored("absent", "excused", "Doctor"), absent("excused", "Doctor"));
  assert.equal(code(() => markFromStored("present", "excused", null)), "invalid_status");
  assert.equal(code(() => markFromStored("present", null, "x")), "invalid_status");
  assert.equal(code(() => markFromStored("absent", null, null)), "reason_required");
  assert.equal(code(() => markFromStored("absent", "sick", null)), "invalid_reason");
  assert.equal(code(() => markFromStored("unknown", null, null)), "invalid_status");
  assert.equal(code(() => markFromStored(null, null, null)), "invalid_status");
});

test("comparing marks ignores whitespace-only note differences", () => {
  assert.ok(sameMark(absent("other", "Doctor"), absent("other", "  Doctor\n")));
  assert.ok(sameMark(absent("other", null), absent("other", "   ")));
  assert.ok(!sameMark(absent("other", "Doctor"), absent("excused", "Doctor")));
  assert.ok(!sameMark(absent("other", "Doctor"), absent("other", "Dentist")));
  assert.ok(!sameMark(PRESENT, absent("other")));
  assert.deepEqual(markDifferences(PRESENT, absent("other", "x")), ["status", "absence_reason", "note"]);
  assert.deepEqual(markDifferences(absent("other", "x"), absent("excused", "x ")), ["absence_reason"]);
});

// ── Totals ────────────────────────────────────────────────────────────────

test("totals: counts by status and reason; rate and percent", () => {
  const t = computeAttendanceTotals([PRESENT, PRESENT, absent("excused"), absent("unexcused"), absent("other"), absent("other")], 2);
  assert.deepEqual(t, {
    total: 6, present: 2, absent: 4, excused: 1, unexcused: 1, other: 2, reasonMissing: 0, removed: 2,
    presentRate: 2 / 6, presentPercent: 33.3, state: "data",
  });
  assert.equal(computeAttendanceTotals([PRESENT, PRESENT, absent("other")]).presentPercent, 66.7);
  assert.equal(computeAttendanceTotals([PRESENT]).presentPercent, 100);
  assert.equal(computeAttendanceTotals([absent("other")]).presentPercent, 0);
});

test("totals: absent with no reason yet is counted separately, so the reasons still add up", () => {
  const t = computeAttendanceTotals([absent(null), absent("excused")]);
  assert.equal(t.absent, 2);
  assert.equal(t.reasonMissing, 1);
  assert.equal(t.excused + t.unexcused + t.other + t.reasonMissing, t.absent);
});

test("totals: nobody counted is an explicit no-data state (no division by zero); removed never counted", () => {
  const t = computeAttendanceTotals([], 3);
  assert.equal(t.state, "no_data");
  assert.equal(t.presentRate, null);
  assert.equal(t.presentPercent, null);
  assert.equal(t.total, 0);
  assert.equal(t.removed, 3);
});

test("totals from a database summary row match the same semantics", () => {
  const fromRow = totalsFromSummary({ present_count: 2, absent_count: 4, excused_count: 1, unexcused_count: 1, other_count: 2, removed_count: 2 });
  const fromMarks = computeAttendanceTotals([PRESENT, PRESENT, absent("excused"), absent("unexcused"), absent("other"), absent("other")], 2);
  assert.deepEqual(fromRow, fromMarks);
  assert.equal(totalsFromSummary({ present_count: 0, absent_count: 0, excused_count: 0, unexcused_count: 0, other_count: 0, removed_count: 1 }).state, "no_data");
  assert.equal(totalsFromSummary({ present_count: -1, absent_count: "x", excused_count: 1.5, unexcused_count: NaN, other_count: 0, removed_count: null } as never).total, 0);
});

// ── Database errors ───────────────────────────────────────────────────────

test("database error codes are recognised in PostgREST messages, never echoed", () => {
  for (const c of ATTENDANCE_DB_ERRORS) {
    assert.equal(attendanceDbErrorCode(`{"code":"P0001","message":"${c}"}`), c);
  }
  assert.equal(attendanceDbErrorCode("attendance_record_invalid"), "attendance_record_invalid");
  assert.equal(attendanceDbErrorCode("attendance_records_invalid"), "attendance_records_invalid");
  assert.equal(attendanceDbErrorCode("something else"), "unknown");
  assert.equal(attendanceDbErrorCode(undefined), "unknown");
  assert.equal(attendanceSaveOutcome("attendance_version_conflict"), "conflict");
  assert.equal(attendanceSaveOutcome("attendance_roster_incomplete"), "roster_changed");
  assert.equal(attendanceSaveOutcome("attendance_athlete_removed"), "roster_changed");
  assert.equal(attendanceSaveOutcome("attendance_session_not_draft"), "read_only");
  assert.equal(attendanceSaveOutcome("attendance_date_not_editable"), "read_only");
  assert.equal(attendanceSaveOutcome("attendance_actor_not_authorized"), "forbidden");
  assert.equal(attendanceSaveOutcome("unknown"), "error");
});

// ── Agreement with the installed migration ────────────────────────────────

test("constants agree with phase_t5_attendance_drafts.sql", () => {
  assert.match(sql, /CHECK \(status IN \('present', 'absent'\)\)/);
  assert.deepEqual([...ATTENDANCE_STATUSES], ["present", "absent"]);
  assert.match(sql, /absence_reason IN \('excused', 'unexcused', 'other'\)/);
  assert.deepEqual([...ABSENCE_REASONS], ["excused", "unexcused", "other"]);
  assert.match(sql, /char_length\(note\) BETWEEN 1 AND 500/);
  assert.match(sql, /char_length\(x\.note\) <= 500/);
  assert.equal(ATTENDANCE_NOTE_MAX, 500);
  assert.match(sql, /p_session_date >= p_today - 14/);
  assert.equal(ATTENDANCE_EDIT_WINDOW_DAYS, 14);
  assert.match(sql, /jsonb_array_length\(p_records\) > 5000/);
  assert.equal(ATTENDANCE_MAX_RECORDS, 5000);
  assert.match(sql, /btrim\(e\.v ->> 'note', E' \\t\\r\\n'\)/);
  assert.match(sql, /SELECT 'America\/Phoenix'::text;/);
  assert.equal(DEFAULT_ATTENDANCE_TIME_ZONE, "America/Phoenix");
});

test("every database error code is known here, and nothing here is invented", () => {
  const raised = new Set([...sql.matchAll(/RAISE EXCEPTION '(attendance_[a-z_]+)'/g)].map(m => m[1]));
  assert.deepEqual([...raised].sort(), [...ATTENDANCE_DB_ERRORS].sort());
});

test("the save payload uses exactly the record fields the database accepts", () => {
  const accepted = /k NOT IN \('athlete_id', 'status', 'absence_reason', 'note', 'confirm_added_after_date'\)/;
  assert.match(sql, accepted);
  const recordType = /export type AttendanceSaveRecord = \{([\s\S]*?)\};/.exec(draftSource)![1];
  const fields = [...recordType.matchAll(/^\s*(\w+)\??:/gm)].map(m => m[1]);
  assert.deepEqual(fields, ["athlete_id", "status", "absence_reason", "note", "confirm_added_after_date"]);
});

// ── Privacy ───────────────────────────────────────────────────────────────

test("errors are fixed messages with at most an athlete id; no names, notes or storage", () => {
  const err = new AttendanceRuleError("reason_required", "11111111-1111-4111-8111-111111111111");
  assert.equal(err.message, attendanceRuleMessage("reason_required"));
  assert.ok(!err.message.includes("1111"));
  for (const src of [source, draftSource]) {
    const live = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(live, /localStorage|sessionStorage|indexedDB|console\.|fetch\(/);
  }
});
