// Attendance Reports — pure report builder. One definition shared by the
// report screen (via the API's JSON), the CSV and the PDF, so every view of
// the same filters shows the same numbers.
//
// Data: the existing attendance records only (team_attendance_sessions /
// team_attendance_records, read by loadAttendanceReportData in
// teamAttendanceStore.ts). Nothing is invented and notes are never read.
//
//   Session      One attendance session per team per date (the only kind
//                that exists — there are no event/session types).
//   Cell         Each roster athlete × session is exactly one of:
//                  present | excused | unexcused | other   a saved record
//                  unmarked        on the roster by that date, no record
//                  not_on_roster   added to the roster after that date
//                                  (not applicable — never counted)
//   Marked       present + absent (excused + unexcused + other).
//   Attendance % Present ÷ Marked, one decimal — the same rate the
//                attendance screen shows (computeAttendanceTotals).
//                Unmarked and not-on-roster never count either way, so a
//                missing record is never an absence and an athlete who
//                joined mid-season is judged only on sessions they had.
//   Removed      Records kept for athletes deleted from the roster are not
//                counted (as on the attendance screen); their number is
//                reported so totals are explained.
import {
  addedAfterSessionDate,
  computeAttendanceTotals,
  isIsoDate,
  markFromStored,
  type AttendanceMark,
  type AttendanceTotals,
} from "./teamAttendance.ts";

export type ReportSession = { id: string; date: string; timeZone: string };
export type ReportRecord = {
  sessionId: string;
  athleteId: string | null;
  status: unknown;
  absenceReason: unknown;
};
export type ReportAthlete = { id: string; name: string; classYear: string | null; createdAt: string | null };

export type AttendanceReportInput = {
  sessions: readonly ReportSession[];
  records: readonly ReportRecord[];
  roster: readonly ReportAthlete[];
};

export type CellStatus = "present" | "excused" | "unexcused" | "other" | "unmarked" | "not_on_roster";

export const CELL_LABELS: Record<CellStatus, string> = {
  present: "Present",
  excused: "Absent – Excused",
  unexcused: "Absent – Unexcused",
  other: "Absent – Other",
  unmarked: "Unmarked",
  not_on_roster: "Not on roster yet",
};

export type ReportSort = "name" | "percent" | "absences";
export const REPORT_SORTS: readonly ReportSort[] = ["name", "percent", "absences"];

export type ReportFilters = {
  from: string;
  to: string;
  /** One roster athlete (athletes.id), or null for the whole team. */
  athleteId: string | null;
  sort: ReportSort;
};

export type Counts = {
  present: number;
  absent: number;
  excused: number;
  unexcused: number;
  other: number;
  unmarked: number;
  notOnRoster: number;
  /** present + absent */
  marked: number;
  /** present / marked × 100, one decimal; null when nothing is marked. */
  percent: number | null;
};

export type AbsenceReasonKey = "excused" | "unexcused" | "other";

export const ABSENCE_LABELS: Record<AbsenceReasonKey, string> = { excused: "Excused", unexcused: "Unexcused", other: "Other" };

/** One saved Absent record: the session date and its reason. */
export type AbsenceEntry = { date: string; reason: AbsenceReasonKey };

export type AthleteRow = { athleteId: string; name: string; classYear: string | null } & Counts & {
  /** Every saved absence in the report's range, newest first — the same
   *  cells the counts come from (never Unmarked or Not on roster yet), so
   *  absences.length === absent. */
  absences: AbsenceEntry[];
};

export type SessionRow = {
  sessionId: string;
  date: string;
  counts: Counts;
  /** One per athlete in the report, in the report's athlete order. */
  cells: { athleteId: string; status: CellStatus }[];
};

export type AttendanceReport = {
  filters: ReportFilters;
  athleteCount: number;
  sessionCount: number;
  totals: Counts;
  athletes: AthleteRow[];
  /** Newest first. */
  sessions: SessionRow[];
  /** Saved records of athletes no longer on the roster (not counted). */
  removedRecords: number;
};

export class AttendanceReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceReportError";
  }
}

const EMPTY: Omit<Counts, "marked" | "percent"> = { present: 0, absent: 0, excused: 0, unexcused: 0, other: 0, unmarked: 0, notOnRoster: 0 };

function finish(c: Omit<Counts, "marked" | "percent">, marks: AttendanceMark[]): Counts {
  // The rate is computeAttendanceTotals' — never a second formula.
  const t: AttendanceTotals = computeAttendanceTotals(marks);
  if (t.present !== c.present || t.absent !== c.absent) throw new AttendanceReportError("count mismatch");
  return { ...c, marked: t.total, percent: t.presentPercent };
}

function tally(c: Omit<Counts, "marked" | "percent">, status: CellStatus) {
  if (status === "present") c.present++;
  else if (status === "unmarked") c.unmarked++;
  else if (status === "not_on_roster") c.notOnRoster++;
  else { c.absent++; c[status]++; }
}

function markOf(status: CellStatus): AttendanceMark | null {
  if (status === "present") return markFromStored("present", null, null);
  if (status === "excused" || status === "unexcused" || status === "other") return markFromStored("absent", status, null);
  return null;
}

/** Name A→Z (case-insensitive), then id, for a stable order. */
function byName(a: AthleteRow, b: AthleteRow) {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.athleteId.localeCompare(b.athleteId);
}

/** percent: highest first, athletes with nothing marked last.
 *  absences: most first. Ties fall back to name. */
export function sortAthleteRows(rows: readonly AthleteRow[], sort: ReportSort): AthleteRow[] {
  const out = [...rows];
  if (sort === "name") return out.sort(byName);
  if (sort === "absences") return out.sort((a, b) => b.absent - a.absent || byName(a, b));
  return out.sort((a, b) => {
    if (a.percent === null || b.percent === null) return a.percent === b.percent ? byName(a, b) : a.percent === null ? 1 : -1;
    return b.percent - a.percent || byName(a, b);
  });
}

/** Builds the report. Throws AttendanceReportError on data that doesn't
 *  add up (a record for an unknown session, two records for one athlete in
 *  one session, an invalid status) — a report is refused, never guessed. */
export function buildAttendanceReport(input: AttendanceReportInput, filters: ReportFilters): AttendanceReport {
  if (!isIsoDate(filters.from) || !isIsoDate(filters.to) || filters.from > filters.to) throw new AttendanceReportError("invalid range");

  const sessions = input.sessions.filter(s => s.date >= filters.from && s.date <= filters.to);
  const sessionIds = new Set<string>();
  for (const s of sessions) {
    if (sessionIds.has(s.id)) throw new AttendanceReportError("duplicate session");
    sessionIds.add(s.id);
  }
  const allSessionIds = new Set(input.sessions.map(s => s.id));

  const rosterIds = new Set(input.roster.map(a => a.id));
  const reportAthletes = filters.athleteId ? input.roster.filter(a => a.id === filters.athleteId) : [...input.roster];

  // sessionId → athleteId → the saved status
  const saved = new Map<string, Map<string, CellStatus>>();
  let removedRecords = 0;
  for (const r of input.records) {
    if (!allSessionIds.has(r.sessionId)) throw new AttendanceReportError("record without a session");
    if (!sessionIds.has(r.sessionId)) continue;
    let mark: AttendanceMark;
    try { mark = markFromStored(r.status, r.absenceReason, null); } catch { throw new AttendanceReportError("invalid record"); }
    if (r.athleteId === null || !rosterIds.has(r.athleteId)) {
      if (!filters.athleteId) removedRecords++;
      continue;
    }
    const bySession = saved.get(r.sessionId) ?? new Map<string, CellStatus>();
    if (bySession.has(r.athleteId)) throw new AttendanceReportError("duplicate record");
    bySession.set(r.athleteId, mark.status === "present" ? "present" : (mark.absenceReason as CellStatus));
    saved.set(r.sessionId, bySession);
  }

  const athleteCounts = new Map(reportAthletes.map(a => [a.id, { c: { ...EMPTY }, marks: [] as AttendanceMark[], absences: [] as AbsenceEntry[] }]));
  const teamCounts = { ...EMPTY };
  const teamMarks: AttendanceMark[] = [];

  const sessionRowsUnordered = sessions.map(s => {
    const c = { ...EMPTY };
    const marks: AttendanceMark[] = [];
    const cells = reportAthletes.map(a => {
      const recorded = saved.get(s.id)?.get(a.id);
      const status: CellStatus = recorded
        ?? (addedAfterSessionDate(a.createdAt, s.date, s.timeZone) ? "not_on_roster" : "unmarked");
      const mark = markOf(status);
      tally(c, status);
      tally(teamCounts, status);
      const ac = athleteCounts.get(a.id)!;
      tally(ac.c, status);
      if (mark) { marks.push(mark); teamMarks.push(mark); ac.marks.push(mark); }
      if (status === "excused" || status === "unexcused" || status === "other") ac.absences.push({ date: s.date, reason: status });
      return { athleteId: a.id, status };
    });
    return { sessionId: s.id, date: s.date, counts: finish(c, marks), cells };
  });

  const athleteRows = sortAthleteRows(reportAthletes.map(a => {
    const ac = athleteCounts.get(a.id)!;
    const absences = [...ac.absences].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    if (absences.length !== ac.c.absent) throw new AttendanceReportError("absence list mismatch");
    return { athleteId: a.id, name: a.name, classYear: a.classYear, ...finish(ac.c, ac.marks), absences };
  }), filters.sort);
  // Session cells follow the athlete table's order.
  const order = new Map(athleteRows.map((r, i) => [r.athleteId, i]));
  const sessionRows = sessionRowsUnordered
    .map(s => ({ ...s, cells: [...s.cells].sort((x, y) => order.get(x.athleteId)! - order.get(y.athleteId)!) }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.sessionId.localeCompare(b.sessionId)));

  return {
    filters,
    athleteCount: reportAthletes.length,
    sessionCount: sessions.length,
    totals: finish(teamCounts, teamMarks),
    athletes: athleteRows,
    sessions: sessionRows,
    removedRecords,
  };
}

/** "Oct 22, 2026" for a YYYY-MM-DD calendar date (no time zone shift). */
export function formatReportDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export const NO_ABSENCES_TEXT = "No recorded absences in this period.";

/** "92.5%" or "—" when nothing is marked. */
export function formatPercent(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(1)}%`;
}

export const PERCENT_DEFINITION =
  "Attendance % = Present ÷ (Present + Absent). Excused, unexcused and other absences all count as absent. Unmarked sessions and sessions before an athlete joined the roster are not counted.";
