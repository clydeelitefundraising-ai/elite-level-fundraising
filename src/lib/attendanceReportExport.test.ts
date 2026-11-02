// Attendance Reports — CSV and PDF exports (attendanceReportCsv.ts,
// attendanceReportPdf.ts): built from the same report, so their numbers
// match the screen; spreadsheet-safe; filenames; PDF pagination.
import test from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildAttendanceReport, type AttendanceReportInput, type ReportFilters } from "./attendanceReport.ts";
import {
  ATHLETE_CSV_HEADERS,
  SESSION_CSV_HEADERS,
  attendanceReportFilename,
  buildAthleteCsv,
  buildSessionCsv,
} from "./attendanceReportCsv.ts";
import { buildAttendancePdf, pdfSafeText } from "./attendanceReportPdf.ts";
import { parseCsv } from "./platform/import/csvParse.ts";

const TZ = "America/Phoenix";
const FILTERS: ReportFilters = { from: "2026-09-01", to: "2026-09-30", athleteId: null, sort: "name" };

function input(): AttendanceReportInput {
  return {
    sessions: [{ id: "s1", date: "2026-09-01", timeZone: TZ }, { id: "s2", date: "2026-09-02", timeZone: TZ }],
    roster: [
      { id: "a1", name: "=HYPERLINK(\"x\")", classYear: "Senior", createdAt: "2026-08-01T19:00:00Z" },
      { id: "a2", name: "Zoë O'Brien, Jr.", classYear: null, createdAt: "2026-08-01T19:00:00Z" },
    ],
    records: [
      { sessionId: "s1", athleteId: "a1", status: "present", absenceReason: null },
      { sessionId: "s1", athleteId: "a2", status: "absent", absenceReason: "excused" },
      { sessionId: "s2", athleteId: "a1", status: "absent", absenceReason: "unexcused" },
    ],
  };
}

test("athlete CSV: headers, one row per athlete, team total equal to the report's totals", () => {
  const report = buildAttendanceReport(input(), FILTERS);
  const csv = buildAthleteCsv(report);
  assert.ok(csv.startsWith("﻿"), "BOM for Excel");
  assert.ok(csv.includes("\r\n"));
  const rows = parseCsv(csv.slice(1));
  assert.deepEqual(rows[0], [...ATHLETE_CSV_HEADERS]);
  assert.equal(rows.length, 1 + report.athletes.length + 1);
  const total = rows[rows.length - 1];
  assert.equal(total[0], "Team total");
  assert.deepEqual(total.slice(2).map(String), [
    report.totals.present, report.totals.absent, report.totals.excused, report.totals.unexcused, report.totals.other,
    report.totals.unmarked, report.totals.notOnRoster, report.totals.marked, "33.3%",
  ].map(String));
  // Formula injection is neutralised; commas/quotes survive intact.
  assert.equal(rows[1][0], "'=HYPERLINK(\"x\")");
  assert.equal(rows[2][0], "Zoë O'Brien, Jr.");
  assert.equal(rows[2][9], "1");
  assert.equal(rows[2][10], "0.0%");
});

test("session CSV: one row per session × athlete, newest first, plain-language statuses", () => {
  const report = buildAttendanceReport(input(), FILTERS);
  const rows = parseCsv(buildSessionCsv(report).slice(1));
  assert.deepEqual(rows[0], [...SESSION_CSV_HEADERS]);
  assert.equal(rows.length, 1 + 2 * 2);
  assert.deepEqual(rows.slice(1).map(r => [r[0], r[3]]), [
    ["2026-09-02", "Absent – Unexcused"], ["2026-09-02", "Unmarked"],
    ["2026-09-01", "Present"], ["2026-09-01", "Absent – Excused"],
  ]);
});

test("exports follow the filters: an athlete-filtered CSV has only that athlete", () => {
  const report = buildAttendanceReport(input(), { ...FILTERS, athleteId: "a2" });
  const rows = parseCsv(buildAthleteCsv(report).slice(1));
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], "Zoë O'Brien, Jr.");
  assert.ok(parseCsv(buildSessionCsv(report).slice(1)).slice(1).every(r => r[1] === "Zoë O'Brien, Jr."));
});

test("filenames: ASCII, team + view + date range", () => {
  assert.equal(
    attendanceReportFilename({ schoolName: "Lions High", sportName: "Track & Field", slug: "x", view: "athletes", from: "2026-09-01", to: "2026-09-30", ext: "csv" }),
    "lions-high-track-field-attendance-athletes-2026-09-01-to-2026-09-30.csv",
  );
  assert.equal(
    attendanceReportFilename({ schoolName: "", sportName: null, slug: "lions-track-2027", view: "report", from: "bad", to: "2026-09-30", ext: "pdf" }),
    "lions-track-2027-attendance-report-undated-to-2026-09-30.pdf",
  );
});

/** Text drawn by pdf-lib: hex strings shown with Tj, inside page content
 *  streams (Flate-compressed or not). */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const buf = Buffer.from(bytes);
  const raw = buf.toString("latin1");
  const parts: string[] = [];
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length;
    const end = raw.indexOf("endstream", start);
    const chunk = buf.subarray(start, end);
    let content: string;
    try { content = inflateSync(chunk).toString("latin1"); } catch { content = chunk.toString("latin1"); }
    for (const t of content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)) parts.push(Buffer.from(t[1], "hex").toString("latin1"));
  }
  return parts.join("\n");
}

test("PDF: title block, summary and the athlete table with a team total", async () => {
  const report = buildAttendanceReport(input(), FILTERS);
  const bytes = await buildAttendancePdf(report, { schoolName: "Lions High", sportName: "Track", season: "2026–27", athleteName: null, generatedOn: "2026-10-01" });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.match(doc.getTitle() ?? "", /Lions High Track/);
  const text = await pdfText(bytes);
  for (const s of ["Lions High Track", "Season: 2026", "Sep 1, 2026", "Sep 30, 2026", "All athletes", "33.3%", "Team total", "Present ÷ (Present + Absent)"]) {
    assert.ok(text.includes(s), `PDF should include ${s}`);
  }
  assert.ok(text.includes("Zoë O'Brien, Jr."));
});

test("PDF: large rosters paginate with the header on every page", async () => {
  const roster = Array.from({ length: 120 }, (_, i) => ({ id: `a${i}`, name: `Athlete ${i}`, classYear: null, createdAt: null }));
  const report = buildAttendanceReport({ sessions: [], records: [], roster }, FILTERS);
  const bytes = await buildAttendancePdf(report, { schoolName: "Lions", sportName: "Track", season: "", athleteName: "Someone", generatedOn: "2026-10-01" });
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 3);
  const text = await pdfText(bytes);
  assert.equal(text.split("\n").filter(l => l === "Athlete").length, doc.getPageCount(), "header repeated per page");
  assert.ok(text.includes(`Page ${doc.getPageCount()} of ${doc.getPageCount()}`));
  assert.ok(text.includes("Athlete: Someone"));
});

test("PDF text: characters the standard font can't draw are reduced, never crash", async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(pdfSafeText("Zoë", font), "Zoë");
  assert.equal(pdfSafeText("Łukasz Ŝ", font), "?ukasz S");
  assert.equal(pdfSafeText("李", font), "?");
  assert.equal(pdfSafeText("a\nb", font), "a b");
});
