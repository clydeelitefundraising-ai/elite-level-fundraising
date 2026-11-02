// Attendance Reports — individual absence dates ("View Absences"): built
// from the same cells as the counts, newest first, filtered with the
// report, never Unmarked / Not on roster yet; and the same list in the
// CSV and the PDF.
import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import {
  NO_ABSENCES_TEXT,
  buildAttendanceReport,
  formatReportDate,
  type AttendanceReportInput,
  type ReportFilters,
} from "./attendanceReport.ts";
import { ATHLETE_CSV_HEADERS, absenceDatesCell, buildAthleteCsv } from "./attendanceReportCsv.ts";
import { buildAttendancePdf } from "./attendanceReportPdf.ts";
import { parseCsv } from "./platform/import/csvParse.ts";

const TZ = "America/Phoenix";
const ALL: ReportFilters = { from: "2026-10-01", to: "2026-10-31", athleteId: null, sort: "name" };
const rec = (sessionId: string, athleteId: string, status: string, absenceReason: string | null = null) => ({ sessionId, athleteId, status, absenceReason });

/** QA-Lions-like: Jo excused 22, unexcused 23, other 24; Fay excused 24
 *  (unmarked on 22, joined the 23rd); Sam never absent. */
function world(): AttendanceReportInput {
  return {
    sessions: [
      { id: "s22", date: "2026-10-22", timeZone: TZ },
      { id: "s23", date: "2026-10-23", timeZone: TZ },
      { id: "s24", date: "2026-10-24", timeZone: TZ },
    ],
    roster: [
      { id: "jo", name: "Jo Junior", classYear: "Junior", createdAt: "2026-08-01T19:00:00Z" },
      { id: "fay", name: "Fay Freshman", classYear: "Freshman", createdAt: "2026-10-22T19:00:00Z" },
      { id: "sam", name: "Sam Senior", classYear: "Senior", createdAt: "2026-08-01T19:00:00Z" },
      { id: "new", name: "Nia New", classYear: null, createdAt: "2026-10-30T19:00:00Z" },
    ],
    records: [
      rec("s22", "jo", "absent", "excused"), rec("s22", "sam", "present"),
      rec("s23", "jo", "absent", "unexcused"), rec("s23", "fay", "present"), rec("s23", "sam", "present"),
      rec("s24", "jo", "absent", "other"), rec("s24", "fay", "absent", "excused"), rec("s24", "sam", "present"),
    ],
  };
}

const byId = (r: ReturnType<typeof buildAttendanceReport>, id: string) => r.athletes.find(a => a.athleteId === id)!;

test("absence dates: every saved absence with its reason, newest first; count matches Absent", () => {
  const r = buildAttendanceReport(world(), ALL);
  assert.deepEqual(byId(r, "jo").absences, [
    { date: "2026-10-24", reason: "other" },
    { date: "2026-10-23", reason: "unexcused" },
    { date: "2026-10-22", reason: "excused" },
  ]);
  for (const a of r.athletes) assert.equal(a.absences.length, a.absent, a.name);
  // Previously approved numbers are unchanged.
  assert.deepEqual([byId(r, "jo").absent, byId(r, "jo").excused, byId(r, "jo").unexcused, byId(r, "jo").other], [3, 1, 1, 1]);
});

test("Unmarked and Not on roster yet are never listed as absences", () => {
  const r = buildAttendanceReport(world(), ALL);
  const fay = byId(r, "fay");
  assert.equal(fay.unmarked, 1, "Fay was on the roster on the 22nd with no record");
  assert.deepEqual(fay.absences, [{ date: "2026-10-24", reason: "excused" }]);
  const nia = byId(r, "new");
  assert.equal(nia.notOnRoster, 3);
  assert.deepEqual(nia.absences, []);
  assert.deepEqual(byId(r, "sam").absences, []);
});

test("changing filters updates the history: date range and athlete", () => {
  const narrow = buildAttendanceReport(world(), { ...ALL, from: "2026-10-23", to: "2026-10-23" });
  assert.deepEqual(byId(narrow, "jo").absences, [{ date: "2026-10-23", reason: "unexcused" }]);
  assert.deepEqual(byId(narrow, "fay").absences, []);
  const one = buildAttendanceReport(world(), { ...ALL, athleteId: "fay" });
  assert.deepEqual(one.athletes.map(a => [a.athleteId, a.absences]), [["fay", [{ date: "2026-10-24", reason: "excused" }]]]);
  // Sorting never changes an athlete's own list.
  const sorted = buildAttendanceReport(world(), { ...ALL, sort: "absences" });
  assert.deepEqual(byId(sorted, "jo").absences, byId(buildAttendanceReport(world(), ALL), "jo").absences);
});

test("dates read like Oct 22, 2026 (calendar dates, no time-zone shift)", () => {
  assert.equal(formatReportDate("2026-10-22"), "Oct 22, 2026");
  assert.equal(formatReportDate("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatReportDate("2026-12-31"), "Dec 31, 2026");
});

test("CSV: the athlete table gains an Absence Dates column; existing columns unchanged", () => {
  const r = buildAttendanceReport(world(), ALL);
  const rows = parseCsv(buildAthleteCsv(r).replace(/^﻿/, ""));
  assert.deepEqual(rows[0].slice(0, 11), ["Athlete", "Grade", "Present", "Absent (total)", "Excused", "Unexcused", "Other",
    "Unmarked", "Not on roster yet", "Sessions counted", "Attendance %"]);
  assert.equal(rows[0][11], "Absence Dates (newest first)");
  assert.equal(rows[0].length, ATHLETE_CSV_HEADERS.length);
  const row = (name: string) => rows.find(x => x[0] === name)!;
  assert.equal(row("Jo Junior")[11], "Oct 24, 2026 – Other; Oct 23, 2026 – Unexcused; Oct 22, 2026 – Excused");
  assert.equal(row("Fay Freshman")[11], "Oct 24, 2026 – Excused");
  assert.equal(row("Sam Senior")[11], NO_ABSENCES_TEXT);
  assert.equal(row("Team total")[11], "");
  for (const a of r.athletes) assert.equal(row(a.name)[11], absenceDatesCell(a.absences));
});

async function pdfLines(bytes: Uint8Array): Promise<string[]> {
  const buf = Buffer.from(bytes);
  const raw = buf.toString("latin1");
  const out: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const chunk = buf.subarray(start, raw.indexOf("endstream", start));
    let content: string;
    try { content = inflateSync(chunk).toString("latin1"); } catch { content = chunk.toString("latin1"); }
    for (const t of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) out.push(Buffer.from(t[1], "hex").toString("latin1"));
  }
  return out;
}

const META = { schoolName: "Lions High", sportName: "Track", season: "2026–27", athleteName: null, generatedOn: "2026-11-02" };

test("PDF: Absence Details lists the same dates and reasons as the screen and CSV", async () => {
  const r = buildAttendanceReport(world(), ALL);
  const lines = await pdfLines(await buildAttendancePdf(r, META));
  const at = lines.indexOf("Absence Details");
  assert.ok(at > lines.indexOf("Team total"), "after the unchanged athlete table");
  const details = lines.slice(at);
  assert.ok(details.includes("Athletes not listed have no recorded absences in this period.") || details.some(l => l.includes("Athletes not listed")));
  // Each absence row: [name on first row], date, reason — in the athlete table's order.
  const expected = r.athletes.flatMap(a => a.absences.map((abs, j) => [j === 0 ? a.name : null, formatReportDate(abs.date), abs.reason[0].toUpperCase() + abs.reason.slice(1)]));
  let i = details.indexOf("Reason") + 1;
  for (const [name, date, reason] of expected) {
    if (name) { assert.equal(details[i], name); i++; }
    assert.equal(details[i], date);
    assert.equal(details[i + 1], reason);
    i += 2;
  }
  assert.ok(!details.includes("Sam Senior") && !details.includes("Nia New"), "no-absence athletes aren't listed");
});

test("PDF: no absences in the period says so", async () => {
  const r = buildAttendanceReport(world(), { ...ALL, athleteId: "sam" });
  const lines = await pdfLines(await buildAttendancePdf(r, { ...META, athleteName: "Sam Senior" }));
  const at = lines.indexOf("Absence Details");
  assert.ok(at > 0);
  assert.equal(lines[at + 1], NO_ABSENCES_TEXT);
});

test("PDF: a long absence history paginates with the header repeated", async () => {
  const sessions = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}`, date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), timeZone: TZ }));
  const roster = [{ id: "a", name: "Ari Absent", classYear: null, createdAt: null }];
  const records = sessions.map(s => rec(s.id, "a", "absent", "excused"));
  const r = buildAttendanceReport({ sessions, roster, records }, { from: "2026-01-01", to: "2026-12-31", athleteId: null, sort: "name" });
  const lines = await pdfLines(await buildAttendancePdf(r, META));
  const details = lines.slice(lines.indexOf("Absence Details"));
  assert.equal(details.filter(l => l === "Excused").length, 120);
  assert.ok(details.filter(l => l === "Reason").length >= 2, "header on each page");
  assert.ok(details.filter(l => l === "Ari Absent").length >= 2, "name repeated at the top of a new page");
});
