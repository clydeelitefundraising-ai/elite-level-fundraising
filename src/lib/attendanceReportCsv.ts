// Attendance Reports — CSV exports, built from the same AttendanceReport
// the screen shows (attendanceReport.ts), so totals always match.
// UTF-8 BOM + CRLF for Excel; Google Sheets reads it as-is. Cells go
// through csvCell (RFC 4180 quoting + formula-injection neutralising).
//
//   athletes   one row per athlete (the athlete table, plus every absence
//              date and reason, newest first), then a team-total row
//   sessions   one row per session × athlete (long format, pivot-friendly)
import { csvCell, MAX_COMPLETION_CSV_BYTES } from "./teamTaskCompletionCsv.ts";
import { sanitizeFilenameSegment } from "./teamJoinQr.ts";
import {
  ABSENCE_LABELS,
  CELL_LABELS,
  NO_ABSENCES_TEXT,
  formatPercent,
  formatReportDate,
  type AbsenceEntry,
  type AttendanceReport,
  type Counts,
} from "./attendanceReport.ts";

export type ReportCsvView = "athletes" | "sessions";
export const MAX_REPORT_CSV_BYTES = MAX_COMPLETION_CSV_BYTES;

export class ReportCsvTooLarge extends Error {}

export const ATHLETE_CSV_HEADERS = [
  "Athlete", "Grade", "Present", "Absent (total)", "Excused", "Unexcused", "Other",
  "Unmarked", "Not on roster yet", "Sessions counted", "Attendance %", "Absence Dates (newest first)",
] as const;

/** "Oct 23, 2026 – Unexcused; Oct 22, 2026 – Excused", or the
 *  no-absences text — exactly what the screen lists. */
export function absenceDatesCell(absences: readonly AbsenceEntry[]): string {
  if (absences.length === 0) return NO_ABSENCES_TEXT;
  return absences.map(a => `${formatReportDate(a.date)} – ${ABSENCE_LABELS[a.reason]}`).join("; ");
}

export const SESSION_CSV_HEADERS = ["Date", "Athlete", "Grade", "Status"] as const;

function countCells(c: Counts): (string | number)[] {
  return [c.present, c.absent, c.excused, c.unexcused, c.other, c.unmarked, c.notOnRoster, c.marked, formatPercent(c.percent)];
}

function finish(lines: string[]): string {
  const csv = "﻿" + lines.join("\r\n") + "\r\n";
  if (new TextEncoder().encode(csv).length > MAX_REPORT_CSV_BYTES) throw new ReportCsvTooLarge("report too large");
  return csv;
}

export function buildAthleteCsv(report: AttendanceReport): string {
  const lines = [ATHLETE_CSV_HEADERS.map(csvCell).join(",")];
  for (const a of report.athletes) {
    lines.push([a.name, a.classYear ?? "", ...countCells(a), absenceDatesCell(a.absences)].map(csvCell).join(","));
  }
  lines.push(["Team total", "", ...countCells(report.totals), ""].map(csvCell).join(","));
  return finish(lines);
}

export function buildSessionCsv(report: AttendanceReport): string {
  const athletes = new Map(report.athletes.map(a => [a.athleteId, a]));
  const lines = [SESSION_CSV_HEADERS.map(csvCell).join(",")];
  for (const s of report.sessions) {
    for (const cell of s.cells) {
      const a = athletes.get(cell.athleteId)!;
      lines.push([s.date, a.name, a.classYear ?? "", CELL_LABELS[cell.status]].map(csvCell).join(","));
    }
  }
  return finish(lines);
}

/** {school}-{sport}-attendance-{athletes|sessions}-{from}-to-{to}.{ext} —
 *  ASCII only. Falls back to the slug, then "team". */
export function attendanceReportFilename(opts: {
  schoolName?: string | null;
  sportName?: string | null;
  slug: string;
  view: ReportCsvView | "report";
  from: string;
  to: string;
  ext: "csv" | "pdf";
}): string {
  const team = [opts.schoolName ?? "", opts.sportName ?? ""].map(sanitizeFilenameSegment).filter(Boolean).join("-")
    || sanitizeFilenameSegment(opts.slug) || "team";
  const date = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "undated");
  return `${team}-attendance-${opts.view}-${date(opts.from)}-to-${date(opts.to)}.${opts.ext}`;
}
