// Attendance Reports — the screen's filters as URL query parameters, and
// the API URLs (JSON, CSV, PDF) built from the SAME filters, so a download
// always matches what's on screen. Pure (shared by the page, the view and
// tests).
export type ReportSortKey = "name" | "percent" | "absences";

export type ReportQuery = {
  from: string | null;
  to: string | null;
  athlete: string | null;
  sort: ReportSortKey;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ATHLETE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SORTS: readonly ReportSortKey[] = ["name", "percent", "absences"];

function one(v: string | string[] | undefined | null): string | null {
  return typeof v === "string" ? v : null;
}

/** Filters from the page's query string; anything malformed is dropped
 *  (the server then uses its defaults). */
export function attendanceReportsQuery(sp: Record<string, string | string[] | undefined>): ReportQuery {
  const from = one(sp.from), to = one(sp.to), athlete = one(sp.athlete), sort = one(sp.sort);
  return {
    from: from && ISO.test(from) ? from : null,
    to: to && ISO.test(to) ? to : null,
    athlete: athlete && ATHLETE_ID.test(athlete) ? athlete : null,
    sort: SORTS.includes(sort as ReportSortKey) ? (sort as ReportSortKey) : "name",
  };
}

function params(q: ReportQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.athlete) p.set("athlete", q.athlete);
  if (q.sort !== "name") p.set("sort", q.sort);
  return p;
}

export type ReportFormat = "json" | "csv-athletes" | "csv-sessions" | "pdf";

/** The report API for these filters, in one format. */
export function reportApiUrl(slug: string, q: ReportQuery, format: ReportFormat): string {
  const p = params(q);
  if (format === "pdf") p.set("format", "pdf");
  if (format === "csv-athletes") p.set("format", "csv");
  if (format === "csv-sessions") { p.set("format", "csv"); p.set("view", "sessions"); }
  const qs = p.toString();
  return `/api/team/${encodeURIComponent(slug)}/attendance/report${qs ? `?${qs}` : ""}`;
}

/** This screen's own URL for these filters (kept in the address bar). */
export function reportsPagePath(slug: string, q: ReportQuery): string {
  const qs = params(q).toString();
  return `/team/${encodeURIComponent(slug)}/attendance/reports${qs ? `?${qs}` : ""}`;
}

/** Where the roster and the attendance screen link to. */
export function attendanceReportsPath(slug: string): string {
  return `/team/${encodeURIComponent(slug)}/attendance/reports`;
}
