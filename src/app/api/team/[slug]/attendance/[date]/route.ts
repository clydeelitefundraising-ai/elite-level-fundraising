import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isIsoDate } from "@/lib/teamAttendance";
import { parseSaveRequest } from "@/lib/teamAttendanceDraft";
import { getAttendanceClock, loadAttendanceDate, saveAttendanceDraft } from "@/lib/teamAttendanceStore";
import { attendanceAuditEvent } from "@/lib/teamAttendanceAudit";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import {
  DB_ERROR_RESPONSES,
  attendanceError,
  attendanceJson,
  denyUnlessAttendanceEditor,
  readJsonBody,
  sessionView,
} from "../_shared";

type RouteContext = { params: Promise<{ slug: string; date: string }> };

// GET /api/team/[slug]/attendance/[date]
// One date: the saved session (or null), the database's editability
// decision, the attendance clock, and the COMPLETE roster for that date —
// current athletes (with their saved status, if any; athletes added after
// the date flagged requires_decision) and the kept records of athletes
// since removed. Notes are included: coaches only.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, date } = await params;
  const actor = await getTeamActor(slug);
  const denied = denyUnlessAttendanceEditor(actor);
  if (denied) return denied;
  if (!isIsoDate(date)) return attendanceError("invalid_date");

  const clock = await getAttendanceClock(slug);
  if (!clock.ok) return attendanceError("attendance_unavailable");
  const view = await loadAttendanceDate(slug, date, clock.value);
  if (!view.ok) return attendanceError("attendance_unavailable");

  return attendanceJson({
    available: true,
    ...clock.value,
    sessionDate: date,
    editable: view.value.editability === "editable",
    editability: view.value.editability,
    session: view.value.session ? sessionView(view.value.session) : null,
    rows: view.value.rows,
  });
}

// PUT /api/team/[slug]/attendance/[date]
// Saves the date's draft: { expectedVersion, records }. expectedVersion 0
// creates the session; otherwise it must be the version the coach loaded —
// a newer save is never overwritten (409 version_conflict, reload: true).
// Who is saving comes only from the signed session (getTeamActor); any
// identity field in the body is refused. The database re-checks the
// coach, the date window, and the roster.
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, date } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const actor = await getTeamActor(slug);
  const denied = denyUnlessAttendanceEditor(actor);
  if (denied) return denied;
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") return attendanceError("forbidden");
  if (!isIsoDate(date)) return attendanceError("invalid_date");

  const read = await readJsonBody(req);
  if (!read.ok) return read.response;
  const parsed = parseSaveRequest(read.body);
  if (!parsed.ok) {
    const shape = parsed.issues.length === 1 && parsed.issues[0].athleteId === null && parsed.issues[0].code === "invalid_roster";
    return shape ? attendanceError("invalid_request") : attendanceError("invalid_records", { issues: parsed.issues });
  }

  const saved = await saveAttendanceDraft(slug, actor, { sessionDate: date, expectedVersion: parsed.expectedVersion, records: parsed.records });
  if (!saved.ok) {
    const f = saved.failure;
    if (f.kind === "db") return attendanceError(DB_ERROR_RESPONSES[f.code]);
    if (f.kind === "forbidden") return attendanceError("forbidden");
    return attendanceError(f.kind === "unavailable" ? "attendance_unavailable" : "error");
  }

  const result = saved.value;
  logAuditEvent(attendanceAuditEvent({
    actor: toAuditActor(actor),
    campaignSlug: slug,
    result,
    ipAddress: ipOf(req),
    userAgent: req.headers.get("user-agent"),
  }));

  return attendanceJson({
    ok: true,
    sessionDate: result.session_date,
    version: result.version,
    savedAt: result.saved_at,
    created: result.created,
    counts: result.counts,
  });
}
