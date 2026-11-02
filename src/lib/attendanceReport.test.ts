// Attendance Reports — the report builder (attendanceReport.ts): formula,
// unmarked vs absent, athletes joining/leaving, filters, sorting, refusal
// of inconsistent data, empty and large datasets.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AttendanceReportError,
  buildAttendanceReport,
  formatPercent,
  sortAthleteRows,
  type AttendanceReportInput,
  type ReportFilters,
} from "./attendanceReport.ts";
import { computeAttendanceTotals, markFromStored } from "./teamAttendance.ts";

const TZ = "America/Phoenix";
const s = (id: string, date: string) => ({ id, date, timeZone: TZ });
const rec = (sessionId: string, athleteId: string | null, status: string, absenceReason: string | null = null) =>
  ({ sessionId, athleteId, status, absenceReason });
const ath = (id: string, name: string, addedOn: string | null = "2026-08-01", classYear: string | null = null) =>
  ({ id, name, classYear, createdAt: addedOn ? `${addedOn}T19:00:00Z` : null });
const ALL: ReportFilters = { from: "2026-09-01", to: "2026-09-30", athleteId: null, sort: "name" };

function world(): AttendanceReportInput {
  return {
    sessions: [s("s1", "2026-09-01"), s("s2", "2026-09-02"), s("s3", "2026-09-03"), s("s4", "2026-09-04")],
    roster: [ath("ava", "Ava Adams", "2026-08-01", "Senior"), ath("ben", "Ben Brown"), ath("cy", "Cy Clark", "2026-09-03")],
    records: [
      rec("s1", "ava", "present"), rec("s1", "ben", "absent", "excused"),
      rec("s2", "ava", "present"), rec("s2", "ben", "absent", "unexcused"),
      rec("s3", "ava", "absent", "other"), rec("s3", "ben", "present"), rec("s3", "cy", "present"),
      // s4: Ava present, Ben has no record (unmarked), Cy absent
      rec("s4", "ava", "present"), rec("s4", "cy", "absent", "excused"),
    ],
  };
}

test("formula: Present ÷ (Present + Absent); all absence reasons count as absent", () => {
  const r = buildAttendanceReport(world(), ALL);
  const ava = r.athletes.find(a => a.athleteId === "ava")!;
  assert.deepEqual([ava.present, ava.absent, ava.other, ava.marked, ava.percent], [3, 1, 1, 4, 75]);
  const ben = r.athletes.find(a => a.athleteId === "ben")!;
  assert.deepEqual([ben.present, ben.absent, ben.excused, ben.unexcused, ben.unmarked, ben.percent], [1, 2, 1, 1, 1, 33.3]);
  // Team: present 3+1+1 = 5, absent 1+2+1 = 4 → 5/9 = 55.6%
  assert.deepEqual([r.totals.present, r.totals.absent, r.totals.marked, r.totals.percent], [5, 4, 9, 55.6]);
  assert.equal(r.totals.excused + r.totals.unexcused + r.totals.other, r.totals.absent);
  // Same rate as the attendance screen's own computation.
  const marks = [...Array(5)].map(() => markFromStored("present", null, null))
    .concat([...Array(4)].map(() => markFromStored("absent", "excused", null)));
  assert.equal(computeAttendanceTotals(marks).presentPercent, r.totals.percent);
});

test("a missing record is Unmarked, never an absence", () => {
  const r = buildAttendanceReport(world(), ALL);
  const s4 = r.sessions.find(x => x.date === "2026-09-04")!;
  assert.equal(s4.cells.find(c => c.athleteId === "ben")!.status, "unmarked");
  assert.equal(s4.counts.unmarked, 1);
  assert.equal(s4.counts.absent, 1, "only Cy's saved absence");
  const ben = r.athletes.find(a => a.athleteId === "ben")!;
  assert.equal(ben.absent, 2, "Ben's unmarked session isn't added to his absences");
});

test("an athlete who joined mid-season is not on the roster for earlier sessions (not counted)", () => {
  const r = buildAttendanceReport(world(), ALL);
  const cy = r.athletes.find(a => a.athleteId === "cy")!;
  assert.deepEqual([cy.notOnRoster, cy.unmarked, cy.present, cy.absent, cy.percent], [2, 0, 1, 1, 50]);
  assert.equal(r.sessions.find(x => x.date === "2026-09-01")!.cells.find(c => c.athleteId === "cy")!.status, "not_on_roster");
  assert.equal(r.totals.notOnRoster, 2);
});

test("an athlete with no add date is treated as on the roster (the database's rule)", () => {
  const w = world();
  w.roster.push(ath("dee", "Dee Dunn", null));
  const r = buildAttendanceReport(w, ALL);
  const dee = r.athletes.find(a => a.athleteId === "dee")!;
  assert.deepEqual([dee.unmarked, dee.notOnRoster, dee.percent], [4, 0, null]);
});

test("records of athletes no longer on the roster are excluded and counted separately", () => {
  const w = world();
  w.records.push(rec("s1", null, "absent", "unexcused"), rec("s2", "gone-athlete", "present"));
  const r = buildAttendanceReport(w, ALL);
  assert.equal(r.removedRecords, 2);
  assert.equal(r.totals.marked, 9, "totals unchanged");
  assert.ok(!r.athletes.some(a => a.athleteId === "gone-athlete"));
});

test("date range: only sessions inside it, inclusive at both ends", () => {
  const r = buildAttendanceReport(world(), { ...ALL, from: "2026-09-02", to: "2026-09-03" });
  assert.deepEqual(r.sessions.map(x => x.date), ["2026-09-03", "2026-09-02"], "newest first");
  assert.equal(r.sessionCount, 2);
  const ava = r.athletes.find(a => a.athleteId === "ava")!;
  assert.deepEqual([ava.present, ava.absent], [1, 1]);
});

test("athlete filter: one athlete's rows, cells and totals only", () => {
  const r = buildAttendanceReport(world(), { ...ALL, athleteId: "ben" });
  assert.equal(r.athleteCount, 1);
  assert.deepEqual(r.athletes.map(a => a.athleteId), ["ben"]);
  assert.ok(r.sessions.every(x => x.cells.length === 1 && x.cells[0].athleteId === "ben"));
  assert.deepEqual([r.totals.present, r.totals.absent, r.totals.unmarked, r.totals.percent], [1, 2, 1, 33.3]);
});

test("sorting: name, attendance % (nothing marked last), absences; ties by name", () => {
  const w = world();
  w.roster.push(ath("dee", "dee Dunn", null), ath("al", "Al Able"));
  w.records.push(rec("s1", "al", "present"), rec("s2", "al", "present"), rec("s3", "al", "present"), rec("s4", "al", "present"));
  const r = buildAttendanceReport(w, ALL);
  assert.deepEqual(sortAthleteRows(r.athletes, "name").map(a => a.athleteId), ["al", "ava", "ben", "cy", "dee"]);
  assert.deepEqual(sortAthleteRows(r.athletes, "percent").map(a => a.athleteId), ["al", "ava", "cy", "ben", "dee"]);
  assert.deepEqual(sortAthleteRows(r.athletes, "absences").map(a => a.athleteId), ["ben", "ava", "cy", "al", "dee"]);
  assert.deepEqual(buildAttendanceReport(w, { ...ALL, sort: "percent" }).athletes.map(a => a.athleteId), ["al", "ava", "cy", "ben", "dee"]);
});

test("session cells follow the athlete table's order", () => {
  const r = buildAttendanceReport(world(), { ...ALL, sort: "absences" });
  const order = r.athletes.map(a => a.athleteId);
  for (const x of r.sessions) assert.deepEqual(x.cells.map(c => c.athleteId), order);
});

test("inconsistent data is refused, never guessed", () => {
  const dup = world(); dup.records.push(rec("s1", "ava", "absent", "other"));
  assert.throws(() => buildAttendanceReport(dup, ALL), AttendanceReportError);
  const orphan = world(); orphan.records.push(rec("nope", "ava", "present"));
  assert.throws(() => buildAttendanceReport(orphan, ALL), AttendanceReportError);
  const bad = world(); bad.records[0] = rec("s1", "ava", "late");
  assert.throws(() => buildAttendanceReport(bad, ALL), AttendanceReportError);
  const noReason = world(); noReason.records[1] = rec("s1", "ben", "absent", null);
  assert.throws(() => buildAttendanceReport(noReason, ALL), AttendanceReportError);
  assert.throws(() => buildAttendanceReport(world(), { ...ALL, from: "2026-10-01", to: "2026-09-01" }), AttendanceReportError);
});

test("empty datasets: no sessions, no athletes", () => {
  const none = buildAttendanceReport({ sessions: [], records: [], roster: world().roster }, ALL);
  assert.equal(none.sessionCount, 0);
  assert.equal(none.totals.percent, null);
  assert.ok(none.athletes.every(a => a.percent === null && a.marked === 0));
  const empty = buildAttendanceReport({ sessions: world().sessions, records: [], roster: [] }, ALL);
  assert.equal(empty.athleteCount, 0);
  assert.equal(empty.sessionCount, 4);
  assert.ok(empty.sessions.every(x => x.cells.length === 0 && x.counts.percent === null));
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(100), "100.0%");
});

test("large roster: 400 athletes × 200 sessions builds quickly and adds up", () => {
  const roster = Array.from({ length: 400 }, (_, i) => ath(`a${i}`, `Athlete ${String(i).padStart(3, "0")}`, "2025-01-01"));
  const sessions = Array.from({ length: 200 }, (_, i) => {
    const d = new Date(Date.UTC(2025, 6, 1) + i * 86_400_000).toISOString().slice(0, 10);
    return s(`s${i}`, d);
  });
  const records = sessions.flatMap((x, si) => roster.map((a, ai) =>
    (ai + si) % 10 === 0 ? rec(x.id, a.id, "absent", "excused") : rec(x.id, a.id, "present")));
  const started = Date.now();
  const r = buildAttendanceReport({ sessions, roster, records }, { from: "2025-01-01", to: "2026-12-31", athleteId: null, sort: "percent" });
  assert.ok(Date.now() - started < 3000, "fast enough for one request");
  assert.equal(r.totals.marked, 80_000);
  assert.equal(r.totals.absent, 8_000);
  assert.equal(r.totals.percent, 90);
  assert.equal(r.athletes.reduce((n, a) => n + a.present, 0), r.totals.present);
});
