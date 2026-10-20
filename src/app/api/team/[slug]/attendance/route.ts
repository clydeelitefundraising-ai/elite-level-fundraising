import { NextRequest } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { ATTENDANCE_EDIT_WINDOW_DAYS, addCalendarDays, isIsoDate } from "@/lib/teamAttendance";
import { getAttendanceClock, listAttendanceSessions } from "@/lib/teamAttendanceStore";
import { attendanceError, attendanceJson, denyUnlessAttendanceEditor, sessionView } from "./_shared";

type RouteContext = { params: Promise<{ slug: string }> };

/** Longest range one request may list (the database's own limit). */
const MAX_RANGE_DAYS = 366;

// GET /api/team/[slug]/attendance[?from=YYYY-MM-DD&to=YYYY-MM-DD]
// The team's attendance clock (today and time zone from the database, plus
// server time and the editable window) and its sessions in the range,
// newest first, with totals. Default range: the editable window.
// Head Coach, Assistant Coach and platform admins of this team only.
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  const denied = denyUnlessAttendanceEditor(actor);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  if ((fromParam !== null && !isIsoDate(fromParam)) || (toParam !== null && !isIsoDate(toParam))) return attendanceError("invalid_date");

  const clock = await getAttendanceClock(slug);
  if (!clock.ok) return attendanceError("attendance_unavailable");
  const { today, timeZone, serverTime } = clock.value;
  const editableFrom = addCalendarDays(today, -ATTENDANCE_EDIT_WINDOW_DAYS);

  const to = toParam ?? today;
  const from = fromParam ?? (toParam ? addCalendarDays(to, -ATTENDANCE_EDIT_WINDOW_DAYS) : editableFrom);
  if (from > to || addCalendarDays(from, MAX_RANGE_DAYS) < to) return attendanceError("invalid_range");

  const sessions = await listAttendanceSessions(slug, from, to);
  if (!sessions.ok) return attendanceError("attendance_unavailable");

  return attendanceJson({
    available: true,
    today,
    timeZone,
    serverTime,
    editableFrom,
    editableTo: today,
    from,
    to,
    sessions: sessions.value.map(sessionView),
  });
}
