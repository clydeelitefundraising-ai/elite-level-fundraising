import { NextRequest } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getCampaignSettings } from "@/lib/supabase";
import { addCalendarDays, isIsoDate } from "@/lib/teamAttendance";
import { firstAttendanceSessionDate, getAttendanceClock, loadAttendanceReportData } from "@/lib/teamAttendanceStore";
import {
  AttendanceReportError,
  PERCENT_DEFINITION,
  REPORT_SORTS,
  buildAttendanceReport,
  type ReportSort,
} from "@/lib/attendanceReport";
import { ReportCsvTooLarge, attendanceReportFilename, buildAthleteCsv, buildSessionCsv } from "@/lib/attendanceReportCsv";
import { buildAttendancePdf } from "@/lib/attendanceReportPdf";
import { attendanceError, attendanceJson, denyUnlessAttendanceEditor } from "../_shared";

type RouteContext = { params: Promise<{ slug: string }> };

/** Longest range one report may cover (the attendance API's limit). */
const MAX_REPORT_RANGE_DAYS = 366;
const ATHLETE_ID = /^[A-Za-z0-9-]{1,64}$/;

// GET /api/team/[slug]/attendance/report
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD   default: first session (≤ 1 year) → today
//   &athlete=<athletes.id>           one athlete (optional)
//   &sort=name|percent|absences      athlete order (default name)
//   &format=json|csv|pdf             default json
//   &view=athletes|sessions          which CSV (default athletes)
// Head Coach, Assistant Coach and platform admins of THIS team only (the
// same rule as taking attendance), checked before anything is read. Every
// format is built from one buildAttendanceReport() call on the same
// filters, so the screen, CSV and PDF always agree. Never includes notes.
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  const denied = denyUnlessAttendanceEditor(actor);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  const athleteParam = sp.get("athlete");
  const sortParam = sp.get("sort") ?? "name";
  const format = sp.get("format") ?? "json";
  const view = sp.get("view") ?? "athletes";
  if ((fromParam !== null && !isIsoDate(fromParam)) || (toParam !== null && !isIsoDate(toParam))) return attendanceError("invalid_date");
  if (athleteParam !== null && !ATHLETE_ID.test(athleteParam)) return attendanceError("invalid_request");
  if (!(REPORT_SORTS as readonly string[]).includes(sortParam)) return attendanceError("invalid_request");
  if (!["json", "csv", "pdf"].includes(format) || !["athletes", "sessions"].includes(view)) return attendanceError("invalid_request");

  const [clock, first, settings] = await Promise.all([
    getAttendanceClock(slug),
    firstAttendanceSessionDate(slug),
    getCampaignSettings(slug).catch(() => null),
  ]);
  if (!clock.ok || !first.ok) return attendanceError("attendance_unavailable");
  if (!settings) return attendanceError("team_not_found");
  const { today } = clock.value;

  const to = toParam ?? today;
  const earliest = addCalendarDays(to, -MAX_REPORT_RANGE_DAYS);
  const defaultFrom = first.value && first.value <= to ? (first.value < earliest ? earliest : first.value) : to;
  const from = fromParam ?? defaultFrom;
  if (from > to || addCalendarDays(from, MAX_REPORT_RANGE_DAYS) < to) return attendanceError("invalid_range");

  const data = await loadAttendanceReportData(slug, from, to);
  if (!data.ok) return attendanceError("attendance_unavailable");
  const athlete = athleteParam ? data.value.roster.find(a => a.id === athleteParam) ?? null : null;
  if (athleteParam && !athlete) return attendanceError("invalid_request");

  let report;
  try {
    report = buildAttendanceReport(data.value, { from, to, athleteId: athlete?.id ?? null, sort: sortParam as ReportSort });
  } catch (err) {
    if (err instanceof AttendanceReportError) {
      console.error(`[attendance/report] refused: ${err.message}`);
      return attendanceError("attendance_unavailable");
    }
    throw err;
  }

  const team = { schoolName: settings.school_name ?? "", sportName: settings.sport_name ?? "", season: settings.season ?? "" };
  if (format === "json") {
    return attendanceJson({
      team,
      today,
      from,
      to,
      defaultFrom,
      firstSessionDate: first.value,
      maxRangeDays: MAX_REPORT_RANGE_DAYS,
      percentDefinition: PERCENT_DEFINITION,
      roster: data.value.roster.map(a => ({ id: a.id, name: a.name })),
      report,
    });
  }

  const filename = attendanceReportFilename({
    schoolName: team.schoolName, sportName: team.sportName, slug,
    view: format === "pdf" ? "report" : (view as "athletes" | "sessions"), from, to, ext: format as "csv" | "pdf",
  });
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };

  if (format === "csv") {
    try {
      const csv = view === "sessions" ? buildSessionCsv(report) : buildAthleteCsv(report);
      return new Response(csv, { status: 200, headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
    } catch (err) {
      if (err instanceof ReportCsvTooLarge) {
        return attendanceJson({ error: "This report is too large to download. Choose a shorter date range.", code: "too_large" }, 413);
      }
      throw err;
    }
  }

  const pdf = await buildAttendancePdf(report, { ...team, athleteName: athlete?.name ?? null, generatedOn: today });
  return new Response(pdf as BodyInit, { status: 200, headers: { ...headers, "Content-Type": "application/pdf" } });
}
