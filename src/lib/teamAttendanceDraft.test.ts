// Team Management Phase 5-2 — the attendance draft model: roster cases,
// edits, unsaved changes, the save payload, and two coaches at once.
import test from "node:test";
import assert from "node:assert/strict";
import { AttendanceRuleError, PRESENT, type AttendanceMark } from "./teamAttendance.ts";
import {
  buildAttendanceDraft,
  buildSavePayload,
  countedEntries,
  draftChanges,
  draftTotals,
  entriesOfKind,
  excludeLateAthlete,
  includeLateAthlete,
  mergeServerDraft,
  parseRosterRows,
  pendingDecisions,
  resolveConflict,
  setAllPresent,
  setAthleteAbsenceReason,
  setAthleteAbsent,
  setAthleteNote,
  setAthletePresent,
  type AttendanceDraft,
  type AttendanceRosterRow,
  type AttendanceSessionInfo,
} from "./teamAttendanceDraft.ts";

// ── Fixtures ──────────────────────────────────────────────────────────────

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rec = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date("2026-10-19T19:00:00Z"); // Phoenix: Oct 19, noon
const TODAY = "2026-10-19";

type RowOpts = {
  name?: string; classYear?: string | null; late?: boolean; removed?: boolean;
  saved?: { status: "present" | "absent"; reason?: string | null; note?: string | null; by?: string };
};
function row(n: number, o: RowOpts = {}): AttendanceRosterRow {
  const has = !!o.saved || !!o.removed;
  const saved = o.saved ?? (o.removed ? { status: "present" as const } : undefined);
  return {
    record_id: has ? rec(n) : null,
    athlete_id: o.removed ? null : id(n),
    athlete_name: o.name ?? `Athlete ${n}`,
    class_year: o.classYear === undefined ? "Junior" : o.classYear,
    on_roster: !o.removed,
    added_after_session_date: !o.removed && !!o.late,
    has_record: has,
    requires_decision: !o.removed && !!o.late && !has,
    status: saved?.status ?? null,
    absence_reason: saved ? (saved.reason ?? null) : null,
    note: saved ? (saved.note ?? null) : null,
    record_updated_at: has ? "2026-10-19T18:00:00Z" : null,
    record_updated_by_name: has ? (saved?.by ?? "Hana Head") : null,
  };
}
const session = (version: number, status = "draft", time_zone = "America/Phoenix"): AttendanceSessionInfo => ({ version, status, time_zone });
const draftOf = (rows: AttendanceRosterRow[], s: AttendanceSessionInfo = null, sessionDate = TODAY, now = NOW) =>
  buildAttendanceDraft({ sessionDate, session: s, rows, now });
const ruleCode = (fn: () => unknown): string => {
  try { fn(); } catch (err) { if (err instanceof AttendanceRuleError) return err.code; throw err; }
  return "no error";
};
const entry = (d: AttendanceDraft, n: number) => d.entries.find(e => e.athleteId === id(n))!;
const absent = (reason: "excused" | "unexcused" | "other" | null, note: string | null = null): AttendanceMark =>
  ({ status: "absent", absenceReason: reason, note });

// ── Reading the roster ────────────────────────────────────────────────────

test("roster rows are checked strictly; anything inconsistent is refused", () => {
  assert.equal(ruleCode(() => parseRosterRows(null)), "invalid_roster");
  assert.equal(ruleCode(() => parseRosterRows({})), "invalid_roster");
  assert.equal(ruleCode(() => parseRosterRows([1])), "invalid_roster");
  const bad: Partial<AttendanceRosterRow>[] = [
    { on_roster: "yes" as never },
    { athlete_id: "not-a-uuid" },
    { athlete_id: null },                                              // on the roster with no athlete
    { has_record: true },                                              // record flag without a record id
    { requires_decision: true },                                       // not late, so can't need a decision
    { status: "present" },                                             // status without a record
    { athlete_name: 5 as never },
    { note: 3 as never },
  ];
  for (const b of bad) assert.equal(ruleCode(() => parseRosterRows([{ ...row(1), ...b }])), "invalid_roster", JSON.stringify(b));
  assert.equal(ruleCode(() => parseRosterRows([row(1, { saved: { status: "present", reason: "excused" } })])), "invalid_roster");
  assert.equal(ruleCode(() => parseRosterRows([row(1, { saved: { status: "absent" } })])), "invalid_roster"); // absent, no reason
  assert.equal(ruleCode(() => parseRosterRows([{ ...row(1, { removed: true }), has_record: false, record_id: null }])), "invalid_roster");
  assert.equal(ruleCode(() => parseRosterRows([row(1), row(1)])), "duplicate_athlete");
  assert.equal(ruleCode(() => parseRosterRows([row(1, { removed: true }), row(1, { removed: true })])), "invalid_roster");
  assert.equal(ruleCode(() => draftOf([row(1)], { version: 0, status: "draft", time_zone: "America/Phoenix" })), "invalid_roster");
});

// ── New session ───────────────────────────────────────────────────────────

test("a new session: every required athlete starts Present; late-added athletes are not included", () => {
  const d = draftOf([row(1), row(2, { classYear: null }), row(3, { late: true })]);
  assert.equal(d.version, 0);
  assert.equal(d.exists, false);
  assert.equal(d.status, "draft");
  assert.equal(d.timeZone, "America/Phoenix");
  assert.deepEqual(d.editability, { editable: true });
  assert.deepEqual(entry(d, 1).state, { included: true, mark: PRESENT });
  assert.equal(entry(d, 1).kind, "enrolled");
  assert.equal(entry(d, 2).classYear, null);
  assert.equal(entry(d, 3).kind, "late_pending");
  assert.equal(entry(d, 3).state.included, false);
  assert.deepEqual(pendingDecisions(d).map(e => e.athleteId), [id(3)]);
  const changes = draftChanges(d);
  assert.deepEqual(changes, { changed: [], hasUnsavedChanges: false, isNew: true, needsSave: true });
});

test("an athlete with no recorded add date is on the roster (the database reports added_after = false): required", () => {
  const d = draftOf([row(1), row(2)]); // row 2 stands for created_at NULL: the revised migration returns added_after false
  assert.equal(entry(d, 2).kind, "enrolled");
  assert.equal(ruleCode(() => excludeLateAthlete(d, id(2))), "athlete_required");
  const p = buildSavePayload(d);
  assert.ok(p.ok && p.payload.records.some(r => r.athlete_id === id(2) && !("confirm_added_after_date" in r)));
});

// ── Existing session ──────────────────────────────────────────────────────

test("reopening a saved session: saved marks, athletes added since, late inclusions and removed history", () => {
  const d = draftOf([
    row(1, { saved: { status: "absent", reason: "excused", note: "Doctor", by: "Avi Assist" } }),
    row(2, { saved: { status: "present" } }),
    row(3),                                                     // on the roster by the date, not in the last save
    row(4, { late: true, saved: { status: "present" } }),       // late, already included
    row(5, { late: true }),                                     // late, not included
    row(6, { removed: true, name: "Dee Diaz", classYear: "Senior", saved: { status: "absent", reason: "other" } }),
  ], session(3));
  assert.equal(d.version, 3);
  assert.equal(d.exists, true);
  assert.deepEqual(entry(d, 1).state.mark, absent("excused", "Doctor"));
  assert.equal(entry(d, 1).lastChangedBy, "Avi Assist");
  assert.equal(entry(d, 3).newSinceLastSave, true);
  assert.deepEqual(entry(d, 3).state, { included: true, mark: PRESENT });
  assert.equal(entry(d, 4).kind, "late_included");
  assert.equal(entry(d, 5).kind, "late_pending");
  const removed = entriesOfKind(d, "removed");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].athleteId, null);
  assert.equal(removed[0].key, `record:${rec(6)}`);
  assert.equal(removed[0].name, "Dee Diaz");
  assert.equal(removed[0].classYear, "Senior");
  assert.deepEqual(removed[0].state.mark, absent("other"));
  // The athlete added since the last save starts Present; that default is
  // not an edit (nothing is lost by leaving), but it is in the next save.
  assert.deepEqual(draftChanges(d).changed.map(c => c.athleteId), []);
  const p = buildSavePayload(d);
  assert.ok(p.ok && p.payload.records.some(r => r.athlete_id === id(3) && r.status === "present"));
  assert.equal(countedEntries(d).length, 4);
});

test("a late athlete already saved in the session stays required (can't be left out)", () => {
  const d = draftOf([row(1), row(4, { late: true, saved: { status: "present" } })], session(1));
  assert.equal(ruleCode(() => excludeLateAthlete(d, id(4))), "athlete_required");
  const p = buildSavePayload(d);
  assert.ok(p.ok);
  assert.ok(p.payload.records.some(r => r.athlete_id === id(4) && !("confirm_added_after_date" in r)));
});

test("removed athletes: history only — never editable, never submitted, counted separately", () => {
  const d = draftOf([row(1), row(6, { removed: true, saved: { status: "absent", reason: "excused" } })], session(2));
  assert.equal(ruleCode(() => setAthleteAbsent(d, rec(6))), "athlete_unknown");
  const p = buildSavePayload(d);
  assert.ok(p.ok);
  assert.deepEqual(p.payload.records.map(r => r.athlete_id), [id(1)]);
  const t = draftTotals(d);
  assert.equal(t.total, 1);
  assert.equal(t.removed, 1);
  assert.equal(t.absent, 0);
});

// ── Editing ───────────────────────────────────────────────────────────────

test("Present -> Absent requires a reason before saving; all three reasons save", () => {
  let d = setAthleteAbsent(draftOf([row(1), row(2)]), id(1));
  assert.deepEqual(entry(d, 1).state.mark, absent(null));
  const blocked = buildSavePayload(d);
  assert.deepEqual(blocked, { ok: false, issues: [{ code: "reason_required", athleteId: id(1) }] });
  for (const reason of ["excused", "unexcused", "other"] as const) {
    d = setAthleteAbsenceReason(d, id(1), reason);
    const p = buildSavePayload(d);
    assert.ok(p.ok);
    assert.deepEqual(p.payload.records.find(r => r.athlete_id === id(1)), { athlete_id: id(1), status: "absent", absence_reason: reason, note: null });
  }
  assert.equal(ruleCode(() => setAthleteAbsenceReason(d, id(1), "sick" as never)), "invalid_reason");
  assert.equal(ruleCode(() => setAthleteAbsent(d, id(1), "sick" as never)), "invalid_reason");
  assert.equal(ruleCode(() => setAthleteAbsenceReason(d, id(2), "excused")), "invalid_reason"); // Present athlete
});

test("Absent -> Present clears the reason and the note", () => {
  let d = setAthleteAbsent(draftOf([row(1)]), id(1), "excused");
  d = setAthleteNote(d, id(1), "Doctor appointment");
  d = setAthletePresent(d, id(1));
  assert.deepEqual(entry(d, 1).state.mark, PRESENT);
  d = setAthleteAbsent(d, id(1));
  assert.deepEqual(entry(d, 1).state.mark, absent(null, null)); // nothing comes back
});

test("notes: absent only, trimmed when saved, empty becomes none, 500-character limit", () => {
  let d = setAthleteAbsent(draftOf([row(1), row(2)]), id(1), "other");
  assert.equal(ruleCode(() => setAthleteNote(d, id(2), "x")), "note_requires_absent");
  d = setAthleteNote(d, id(1), "  Ran late \n");
  let p = buildSavePayload(d);
  assert.ok(p.ok);
  assert.equal(p.payload.records.find(r => r.athlete_id === id(1))!.note, "Ran late");
  d = setAthleteNote(d, id(1), " \t ");
  p = buildSavePayload(d);
  assert.ok(p.ok);
  assert.equal(p.payload.records.find(r => r.athlete_id === id(1))!.note, null);
  d = setAthleteNote(d, id(1), "x".repeat(501));
  assert.deepEqual(buildSavePayload(d), { ok: false, issues: [{ code: "note_too_long", athleteId: id(1) }] });
  d = setAthleteNote(d, id(1), "x".repeat(500));
  assert.ok(buildSavePayload(d).ok);
});

test("late-added athletes: only an explicit decision includes them, with an explicit status", () => {
  const base = draftOf([row(1), row(5, { late: true })], session(1));
  assert.equal(ruleCode(() => setAthletePresent(base, id(5))), "late_athlete_not_included");
  assert.equal(ruleCode(() => setAthleteAbsent(base, id(5), "excused")), "late_athlete_not_included");
  assert.equal(ruleCode(() => includeLateAthlete(base, id(5), "late" as never)), "invalid_status");
  assert.equal(ruleCode(() => includeLateAthlete(base, id(1), "present")), "athlete_required"); // not late

  // Not decided: not in the save at all.
  let p = buildSavePayload(base);
  assert.ok(p.ok);
  assert.deepEqual(p.payload.records.map(r => r.athlete_id), [id(1)]);

  // Included as Present: sent with the database's explicit confirmation.
  const included = includeLateAthlete(base, id(5), "present");
  p = buildSavePayload(included);
  assert.ok(p.ok);
  assert.deepEqual(p.payload.records.find(r => r.athlete_id === id(5)), {
    athlete_id: id(5), status: "present", absence_reason: null, note: null, confirm_added_after_date: true,
  });
  assert.deepEqual(draftChanges(included).changed.map(c => [c.athleteId, c.fields]), [[id(5), ["included"]]]);

  // Included as Absent still needs a reason.
  const absentLate = includeLateAthlete(base, id(5), "absent");
  assert.deepEqual(buildSavePayload(absentLate), { ok: false, issues: [{ code: "reason_required", athleteId: id(5) }] });
  assert.ok(buildSavePayload(includeLateAthlete(base, id(5), "absent", "unexcused")).ok);

  // Changing their mind before saving.
  const undone = excludeLateAthlete(included, id(5));
  assert.equal(entry(undone, 5).state.included, false);
  assert.deepEqual(draftChanges(undone).changed, []);
});

test("unknown athletes and read-only dates refuse edits", () => {
  const d = draftOf([row(1)]);
  assert.equal(ruleCode(() => setAthletePresent(d, id(99))), "athlete_unknown");
  const old = draftOf([row(1, { saved: { status: "present" } })], session(2), "2026-10-04");
  assert.deepEqual(old.editability, { editable: false, reason: "date_not_editable" });
  assert.equal(ruleCode(() => setAthleteAbsent(old, id(1), "other")), "date_not_editable");
  assert.deepEqual(buildSavePayload(old), { ok: false, issues: [{ code: "date_not_editable", athleteId: null }] });
  const future = draftOf([row(1)], null, "2026-10-20");
  assert.equal(ruleCode(() => setAllPresent(future)), "date_in_future");
  const finalized = draftOf([row(1, { saved: { status: "present" } })], session(4, "finalized"));
  assert.equal(ruleCode(() => setAthletePresent(finalized, id(1))), "session_not_draft");
  // Edge of the window (14 days ago) is still editable.
  assert.deepEqual(draftOf([row(1)], null, "2026-10-05").editability, { editable: true });
});

test("edits never mutate the draft they were given", () => {
  const d = draftOf([row(1)]);
  const before = JSON.stringify(d);
  setAthleteAbsent(d, id(1), "other");
  setAllPresent(d);
  assert.equal(JSON.stringify(d), before);
});

// ── Unsaved changes ───────────────────────────────────────────────────────

test("unsaved changes: which athletes changed, and changing back is no change", () => {
  const loaded = draftOf([row(1, { saved: { status: "present" } }), row(2, { saved: { status: "absent", reason: "other", note: "Ill" } })], session(2));
  assert.deepEqual(draftChanges(loaded), { changed: [], hasUnsavedChanges: false, isNew: false, needsSave: false });

  let d = setAthleteAbsent(loaded, id(1), "excused");
  d = setAthleteNote(d, id(2), "  Ill \n"); // whitespace only: not a change
  const c = draftChanges(d);
  assert.equal(c.hasUnsavedChanges, true);
  assert.deepEqual(c.changed.map(x => [x.athleteId, x.fields]), [[id(1), ["status", "absence_reason"]]]);
  assert.deepEqual(c.changed[0].from.mark, PRESENT);

  d = setAthletePresent(d, id(1));
  assert.equal(draftChanges(d).hasUnsavedChanges, false);
});

test("the save keeps every unchanged athlete's saved values", () => {
  const loaded = draftOf([
    row(1, { saved: { status: "absent", reason: "excused", note: "Doctor" } }),
    row(2, { saved: { status: "present" } }),
  ], session(5));
  const p = buildSavePayload(setAthleteAbsent(loaded, id(2), "other"));
  assert.ok(p.ok);
  assert.equal(p.payload.expectedVersion, 5);
  assert.deepEqual(p.payload.records, [
    { athlete_id: id(1), status: "absent", absence_reason: "excused", note: "Doctor" },
    { athlete_id: id(2), status: "absent", absence_reason: "other", note: null },
  ]);
});

// ── Save payload ──────────────────────────────────────────────────────────

test("save payload: exactly the database's fields, sorted, version 0 for a new session, no names", () => {
  const d = draftOf([row(3, { name: "Zed" }), row(1, { name: "Ava Adams" }), row(2)]);
  const p = buildSavePayload(d);
  assert.ok(p.ok);
  assert.equal(p.payload.expectedVersion, 0);
  assert.equal(p.payload.sessionDate, TODAY);
  assert.deepEqual(p.payload.records.map(r => r.athlete_id), [id(1), id(2), id(3)]);
  for (const r of p.payload.records) assert.deepEqual(Object.keys(r), ["athlete_id", "status", "absence_reason", "note"]);
  assert.ok(!JSON.stringify(p.payload).includes("Ava"));
});

test("save payload: nothing to save is refused; every problem is reported at once", () => {
  assert.deepEqual(buildSavePayload(draftOf([])), { ok: false, issues: [{ code: "roster_empty", athleteId: null }] });
  assert.deepEqual(buildSavePayload(draftOf([row(5, { late: true })])), { ok: false, issues: [{ code: "roster_empty", athleteId: null }] });
  let d = draftOf([row(1), row(2), row(3)]);
  d = setAthleteAbsent(d, id(1));
  d = setAthleteNote(setAthleteAbsent(d, id(3), "other"), id(3), "y".repeat(600));
  const p = buildSavePayload(d);
  assert.deepEqual(p, { ok: false, issues: [{ code: "reason_required", athleteId: id(1) }, { code: "note_too_long", athleteId: id(3) }] });
});

test("save payload: more than 5,000 athletes is refused", () => {
  const rows = Array.from({ length: 5001 }, (_, i) => row(i + 1));
  assert.deepEqual(buildSavePayload(draftOf(rows)), { ok: false, issues: [{ code: "too_many_records", athleteId: null }] });
  assert.ok(buildSavePayload(draftOf(rows.slice(0, 5000))).ok);
});

// ── Totals ────────────────────────────────────────────────────────────────

test("draft totals: counted athletes only, reasons add up, removed separate, zero athletes = no data", () => {
  let d = draftOf([row(1), row(2), row(3), row(4), row(5, { late: true }), row(6, { removed: true })], session(1));
  d = setAthleteAbsent(d, id(1), "excused");
  d = setAthleteAbsent(d, id(2), "unexcused");
  d = setAthleteAbsent(d, id(3));
  const t = draftTotals(d);
  assert.equal(t.total, 4); // late pending (not included) and removed are not counted
  assert.equal(t.present, 1);
  assert.equal(t.absent, 3);
  assert.equal(t.excused + t.unexcused + t.other + t.reasonMissing, 3);
  assert.equal(t.removed, 1);
  assert.equal(t.presentPercent, 25);
  const withLate = draftTotals(includeLateAthlete(d, id(5), "present"));
  assert.equal(withLate.total, 5);
  assert.equal(withLate.present, 2);
  const empty = draftTotals(draftOf([row(6, { removed: true })], session(1)));
  assert.equal(empty.state, "no_data");
  assert.equal(empty.presentPercent, null);
  assert.equal(empty.removed, 1);
});

// ── Two coaches ───────────────────────────────────────────────────────────
// Coach A and Coach B both open version 3. Coach A saves version 4.
// Coach B's save of version 3 is refused by the database; B reloads and
// merges.

const v3Rows = () => [
  row(1, { saved: { status: "present" } }),
  row(2, { saved: { status: "present" } }),
  row(3, { saved: { status: "absent", reason: "excused", note: "Doctor" } }),
  row(4, { saved: { status: "present" } }),
];
const coachB = () => draftOf(v3Rows(), session(3));
function serverAfterA(changes: Record<number, RowOpts["saved"]>, extra: AttendanceRosterRow[] = [], s = session(4)): AttendanceDraft {
  const rows = v3Rows().map(r => {
    const n = Number(r.athlete_id!.slice(-12));
    return changes[n] ? row(n, { saved: { ...changes[n]!, by: "Coach A" } }) : r;
  });
  return draftOf([...rows, ...extra], s);
}

test("different athletes: both coaches' changes are kept; the save goes on the new version", () => {
  const b = setAthleteAbsent(coachB(), id(2), "unexcused");               // B: athlete 2
  const server = serverAfterA({ 1: { status: "absent", reason: "other" } }); // A: athlete 1
  const m = mergeServerDraft(b, server);
  assert.equal(m.serverVersionChanged, true);
  assert.equal(m.readyToSave, true);
  assert.deepEqual(m.conflicts, []);
  const results = Object.fromEntries(m.outcomes.map(o => [o.athleteId, o.result]));
  assert.equal(results[id(1)], "took_theirs");
  assert.equal(results[id(2)], "kept_mine");
  assert.equal(results[id(3)], "unchanged");
  const p = buildSavePayload(m.draft);
  assert.ok(p.ok);
  assert.equal(p.payload.expectedVersion, 4);
  assert.deepEqual(p.payload.records.find(r => r.athlete_id === id(1))!.absence_reason, "other");    // A's change preserved
  assert.deepEqual(p.payload.records.find(r => r.athlete_id === id(2))!.absence_reason, "unexcused"); // B's change preserved
  // After the merge, only B's own change is unsaved.
  assert.deepEqual(draftChanges(m.draft).changed.map(c => c.athleteId), [id(2)]);
});

test("same athlete, same change: identical (no conflict)", () => {
  const b = setAthleteAbsent(coachB(), id(1), "excused");
  const m = mergeServerDraft(b, serverAfterA({ 1: { status: "absent", reason: "excused" } }));
  assert.equal(m.outcomes.find(o => o.athleteId === id(1))!.result, "identical");
  assert.equal(m.readyToSave, true);
  assert.deepEqual(draftChanges(m.draft).changed, []);
});

test("same athlete, different reasons: a conflict that blocks saving until the coach chooses", () => {
  const b = setAthleteAbsent(coachB(), id(1), "unexcused");
  const m = mergeServerDraft(b, serverAfterA({ 1: { status: "absent", reason: "excused" } }));
  assert.equal(m.readyToSave, false);
  assert.equal(m.conflicts.length, 1);
  assert.deepEqual(m.conflicts[0].fields, ["absence_reason"]);
  assert.deepEqual(m.conflicts[0].mine.mark, absent("unexcused"));
  assert.deepEqual(m.conflicts[0].theirs.mark, absent("excused"));
  // Shown as the saved value until resolved; never silently overwritten.
  assert.deepEqual(entry(m.draft, 1).state.mark, absent("excused"));
  assert.deepEqual(buildSavePayload(m.draft), { ok: false, issues: [{ code: "unresolved_conflicts", athleteId: null }] });
  assert.equal(draftChanges(m.draft).hasUnsavedChanges, true);

  const mine = resolveConflict(m.draft, id(1), "mine");
  let p = buildSavePayload(mine);
  assert.ok(p.ok);
  assert.equal(p.payload.records.find(r => r.athlete_id === id(1))!.absence_reason, "unexcused");
  assert.equal(p.payload.expectedVersion, 4);

  const theirs = resolveConflict(m.draft, id(1), "theirs");
  p = buildSavePayload(theirs);
  assert.ok(p.ok);
  assert.equal(p.payload.records.find(r => r.athlete_id === id(1))!.absence_reason, "excused");
  assert.deepEqual(draftChanges(theirs).changed, []);
  assert.equal(ruleCode(() => resolveConflict(theirs, id(1), "mine")), "unknown_conflict");
});

test("same athlete, different notes: a conflict; a whitespace-only difference is not", () => {
  const b = setAthleteNote(coachB(), id(3), "Doctor — note from B");
  const m = mergeServerDraft(b, serverAfterA({ 3: { status: "absent", reason: "excused", note: "Doctor — note from A" } }));
  assert.deepEqual(m.conflicts.map(c => c.fields), [["note"]]);

  const same = setAthleteNote(coachB(), id(3), "Dentist ");
  const m2 = mergeServerDraft(same, serverAfterA({ 3: { status: "absent", reason: "excused", note: "Dentist" } }));
  assert.equal(m2.outcomes.find(o => o.athleteId === id(3))!.result, "identical");
});

test("same athlete, Present vs Absent: a status conflict", () => {
  const b = setAthletePresent(coachB(), id(3));                                      // B: athlete 3 present
  const m = mergeServerDraft(b, serverAfterA({ 3: { status: "absent", reason: "other" } })); // A: changed the reason
  assert.deepEqual(m.conflicts[0].fields, ["status", "absence_reason"]);
});

test("the other coach changed nothing (same version): this coach's changes stand", () => {
  const b = setAthleteAbsent(coachB(), id(4), "other");
  const m = mergeServerDraft(b, draftOf(v3Rows(), session(3)));
  assert.equal(m.serverVersionChanged, false);
  assert.equal(m.readyToSave, true);
  assert.equal(m.outcomes.find(o => o.athleteId === id(4))!.result, "kept_mine");
});

test("an athlete removed meanwhile: reported (with whether this coach's change is lost), never submitted", () => {
  const b = setAthleteAbsent(coachB(), id(2), "excused");
  // A deleted athlete 2 (their saved record stays as history) and athlete 4 (no change by B).
  const rows = v3Rows().filter(r => r.athlete_id !== id(2) && r.athlete_id !== id(4))
    .concat([row(2, { removed: true, saved: { status: "present" } }), row(4, { removed: true, saved: { status: "present" } })]);
  const m = mergeServerDraft(b, draftOf(rows, session(4)));
  const removed = m.outcomes.filter(o => o.result === "athlete_removed");
  assert.equal(removed.length, 2);
  assert.ok(removed.some(o => o.localChangeLost === true));
  assert.ok(removed.some(o => o.localChangeLost === false));
  const p = buildSavePayload(m.draft);
  assert.ok(p.ok);
  assert.deepEqual(p.payload.records.map(r => r.athlete_id), [id(1), id(3)]);
});

test("an athlete deleted with no saved record for the date disappears entirely: still reported", () => {
  const local = setAthleteAbsent(draftOf([row(1), row(2)]), id(2), "other");
  const m = mergeServerDraft(local, draftOf([row(1)]));
  assert.deepEqual(m.outcomes.find(o => o.athleteId === id(2)), { key: id(2), athleteId: id(2), result: "athlete_removed", localChangeLost: true });
});

test("an athlete added meanwhile joins the draft (Present by default, required)", () => {
  const m = mergeServerDraft(coachB(), serverAfterA({}, [row(7)]));
  assert.equal(m.outcomes.find(o => o.athleteId === id(7))!.result, "athlete_added");
  assert.deepEqual(entry(m.draft, 7).state, { included: true, mark: PRESENT });
  assert.ok(buildSavePayload(m.draft).ok);
});

test("both coaches include the same late athlete the same way: identical, no confirmation needed any more", () => {
  const local = includeLateAthlete(draftOf([row(1, { saved: { status: "present" } }), row(5, { late: true })], session(2)), id(5), "present");
  const server = draftOf([row(1, { saved: { status: "present" } }), row(5, { late: true, saved: { status: "present" } })], session(3));
  const m = mergeServerDraft(local, server);
  assert.equal(m.outcomes.find(o => o.athleteId === id(5))!.result, "identical");
  const p = buildSavePayload(m.draft);
  assert.ok(p.ok);
  assert.ok(!("confirm_added_after_date" in p.payload.records.find(r => r.athlete_id === id(5))!));
});

test("this coach's late inclusion survives a merge and keeps its confirmation", () => {
  const local = includeLateAthlete(draftOf([row(1, { saved: { status: "present" } }), row(5, { late: true })], session(2)), id(5), "absent", "excused");
  const server = draftOf([row(1, { saved: { status: "absent", reason: "other" } }), row(5, { late: true })], session(3));
  const m = mergeServerDraft(local, server);
  assert.equal(m.outcomes.find(o => o.athleteId === id(5))!.result, "kept_mine");
  const p = buildSavePayload(m.draft);
  assert.ok(p.ok);
  assert.deepEqual(p.payload.records.find(r => r.athlete_id === id(5)), {
    athlete_id: id(5), status: "absent", absence_reason: "excused", note: null, confirm_added_after_date: true,
  });
});

test("a session finalized meanwhile (Phase 6): nothing can be saved", () => {
  const b = setAthleteAbsent(coachB(), id(1), "other");
  const m = mergeServerDraft(b, serverAfterA({}, [], session(4, "finalized")));
  assert.equal(m.readyToSave, false);
  assert.deepEqual(buildSavePayload(m.draft), { ok: false, issues: [{ code: "session_not_draft", athleteId: null }] });
});

test("merging again with a conflict still open keeps this coach's version in the conflict", () => {
  const b = setAthleteAbsent(coachB(), id(1), "unexcused");
  const first = mergeServerDraft(b, serverAfterA({ 1: { status: "absent", reason: "excused" } }));
  const second = mergeServerDraft(first.draft, serverAfterA({ 1: { status: "absent", reason: "excused" } }, [], session(5)));
  assert.equal(second.conflicts.length, 1);
  assert.deepEqual(second.conflicts[0].mine.mark, absent("unexcused"));
});

test("both coaches start the same new date: the first save creates it, the second merges onto version 1", () => {
  const b = setAthleteAbsent(draftOf([row(1), row(2)]), id(2), "excused");
  const server = draftOf([row(1, { saved: { status: "absent", reason: "other" } }), row(2, { saved: { status: "present" } })], session(1));
  const m = mergeServerDraft(b, server);
  assert.equal(m.readyToSave, true);
  const p = buildSavePayload(m.draft);
  assert.ok(p.ok);
  assert.equal(p.payload.expectedVersion, 1);
  assert.equal(p.payload.records.find(r => r.athlete_id === id(1))!.absence_reason, "other");
  assert.equal(p.payload.records.find(r => r.athlete_id === id(2))!.absence_reason, "excused");
});

test("merging drafts of different dates is refused", () => {
  assert.equal(ruleCode(() => mergeServerDraft(coachB(), draftOf(v3Rows(), session(4), "2026-10-18"))), "invalid_roster");
});

// ── The API's check of a submitted save (Phase 5-3) ──────────────────────

test("parseSaveRequest: accepts exactly what buildSavePayload produces", async () => {
  const { parseSaveRequest } = await import("./teamAttendanceDraft.ts");
  let d = draftOf([row(1), row(2), row(5, { late: true })]);
  d = setAthleteNote(setAthleteAbsent(d, id(2), "other"), id(2), "  Bus  ");
  d = includeLateAthlete(d, id(5), "present");
  const p = buildSavePayload(d);
  assert.ok(p.ok);
  const parsed = parseSaveRequest({ expectedVersion: p.payload.expectedVersion, records: p.payload.records });
  assert.deepEqual(parsed, { ok: true, expectedVersion: 0, records: p.payload.records });
});

test("parseSaveRequest: refuses identity fields, bad shapes and invalid marks (codes + athlete ids only)", async () => {
  const { parseSaveRequest } = await import("./teamAttendanceDraft.ts");
  const ok = [{ athlete_id: id(1), status: "present" }];
  const shape = { ok: false, issues: [{ code: "invalid_roster", athleteId: null }] };
  for (const bad of [null, [], "x", { records: ok }, { expectedVersion: -1, records: ok }, { expectedVersion: 0.5, records: ok },
    { expectedVersion: 0, records: {} }, { expectedVersion: 0, records: ok, coach_id: "c" }, { expectedVersion: 0, records: ok, actor: {} }]) {
    assert.deepEqual(parseSaveRequest(bad), shape, JSON.stringify(bad));
  }
  assert.deepEqual(parseSaveRequest({ expectedVersion: 0, records: [] }), { ok: false, issues: [{ code: "roster_empty", athleteId: null }] });
  assert.deepEqual(parseSaveRequest({ expectedVersion: 0, records: [{ ...ok[0], platform_admin_id: "p" }] }), shape);
  const r = parseSaveRequest({ expectedVersion: 2, records: [
    { athlete_id: id(1), status: "absent" },
    { athlete_id: id(2), status: "present", note: "x" },
    { athlete_id: id(3), status: "absent", absence_reason: "sick" },
    { athlete_id: id(4), status: "maybe" },
    { athlete_id: id(4), status: "present" },
  ] });
  assert.deepEqual(r, { ok: false, issues: [
    { code: "reason_required", athleteId: id(1) },
    { code: "note_requires_absent", athleteId: id(2) },
    { code: "invalid_reason", athleteId: id(3) },
    { code: "invalid_status", athleteId: id(4) },
    { code: "duplicate_athlete", athleteId: id(4) },
  ] });
  const notes = parseSaveRequest({ expectedVersion: 1, records: [
    { athlete_id: id(2).toUpperCase(), status: "absent", absence_reason: "excused", note: " \t\n " },
    { athlete_id: id(1), status: "absent", absence_reason: "other", note: "  ok \r\n" },
  ] });
  assert.deepEqual(notes, { ok: true, expectedVersion: 1, records: [
    { athlete_id: id(1), status: "absent", absence_reason: "other", note: "ok" },
    { athlete_id: id(2), status: "absent", absence_reason: "excused", note: null },
  ] });
});
