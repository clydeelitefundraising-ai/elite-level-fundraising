// Team Management Phase 5 — attendance audit events: counts and actor only.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTENDANCE_AUDIT_ACTIONS,
  ATTENDANCE_AUDIT_ENTITY,
  attendanceAuditEvent,
  type AttendanceSaveResult,
} from "./teamAttendanceAudit.ts";

const coach = { type: "coach" as const, id: "coach-1", name: "Hana Head" };
const admin = { type: "platform_admin" as const, id: "pa-1", email: "ada@elf.test", name: "Ada Admin" };

const result = (over: Partial<AttendanceSaveResult> = {}): AttendanceSaveResult => ({
  session_id: "7d0c5a4e-1f1c-4b9b-9a37-2f0f3b6f1a11",
  session_date: "2026-10-19",
  version: 1,
  saved_at: "2026-10-19T22:15:00Z",
  created: true,
  counts: { total: 56, present: 50, absent: 6, excused: 3, unexcused: 2, other: 1 },
  ...over,
});

const event = (r: AttendanceSaveResult, actor: typeof coach | typeof admin = coach) =>
  attendanceAuditEvent({ actor, campaignSlug: "monroe-valley-track-and-field-2027", result: r, ipAddress: "203.0.113.9", userAgent: "UA" });

test("first save of a date: attendance_session.created on the session, with counts", () => {
  const e = event(result());
  assert.equal(e.action, ATTENDANCE_AUDIT_ACTIONS.created);
  assert.equal(e.action, "attendance_session.created");
  assert.equal(e.entity_type, ATTENDANCE_AUDIT_ENTITY);
  assert.equal(e.entity_id, "7d0c5a4e-1f1c-4b9b-9a37-2f0f3b6f1a11");
  assert.equal(e.campaign_slug, "monroe-valley-track-and-field-2027");
  assert.equal(e.summary, "Started attendance draft for 2026-10-19 on monroe-valley-track-and-field-2027: 50 present, 6 absent (56 athletes)");
  assert.deepEqual(e.new_value, {
    session_date: "2026-10-19",
    version: 1,
    created: true,
    counts: { total: 56, present: 50, absent: 6, excused: 3, unexcused: 2, other: 1 },
  });
  assert.equal(e.previous_value, undefined);
  assert.equal(e.ip_address, "203.0.113.9");
  assert.equal(e.user_agent, "UA");
});

test("later saves: attendance_session.saved with the new version", () => {
  const e = event(result({ created: false, version: 4, counts: { total: 1, present: 1, absent: 0, excused: 0, unexcused: 0, other: 0 } }));
  assert.equal(e.action, "attendance_session.saved");
  assert.equal(e.summary, "Saved attendance draft for 2026-10-19 on monroe-valley-track-and-field-2027: 1 present, 0 absent (1 athlete)");
  assert.equal((e.new_value as { version: number }).version, 4);
});

test("actor identity is passed through unchanged (coach or platform admin)", () => {
  assert.deepEqual(event(result()).actor, coach);
  assert.deepEqual(event(result(), admin).actor, admin);
});

test("never logs student information, even if the caller passes a richer object", () => {
  const leaky = {
    ...result(),
    records: [{ athlete_id: "a1", athlete_name: "Ava Adams", status: "absent", absence_reason: "excused", note: "Private medical detail" }],
    athlete_name: "Ava Adams",
    note: "Private medical detail",
    counts: { ...result().counts, names: ["Ava Adams"] },
  } as unknown as AttendanceSaveResult;
  const json = JSON.stringify(event(leaky));
  for (const secret of ["Ava Adams", "Private medical detail", "absence_reason", "athlete_id", "athlete_name", "records", "names", "note"]) {
    assert.ok(!json.includes(secret), `leaked ${secret}`);
  }
  assert.deepEqual(Object.keys((event(leaky).new_value as { counts: object }).counts), ["total", "present", "absent", "excused", "unexcused", "other"]);
});

test("malformed counts or dates are neutralized, never echoed", () => {
  const e = event(result({
    session_date: "2026-10-19'; DROP TABLE x;--",
    version: -3,
    counts: { total: Number.NaN, present: -1, absent: "7" as unknown as number, excused: 2.9, unexcused: Infinity, other: 0 },
  }));
  assert.deepEqual((e.new_value as { counts: object }).counts, { total: 0, present: 0, absent: 7, excused: 2, unexcused: 0, other: 0 });
  assert.equal((e.new_value as { session_date: unknown }).session_date, null);
  assert.equal((e.new_value as { version: number }).version, 0);
  assert.ok(e.summary?.includes("an unknown date"));
  assert.ok(!JSON.stringify(e).includes("DROP"));
});
