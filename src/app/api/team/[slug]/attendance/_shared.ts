// Shared helpers for the attendance routes (not a route itself — Next only
// treats route.ts files as endpoints).
//
// Responses: always JSON, never cached, with a stable machine-readable
// `code`. Errors never include database messages, notes, names or the
// submitted payload.
import { NextResponse } from "next/server";
import type { TeamActor } from "@/lib/permissions";
import {
  canEditAttendance,
  totalsFromSummary,
  type AttendanceDbError,
  type AttendanceIssue,
  type AttendanceTotals,
} from "@/lib/teamAttendance";
import type { AttendanceSummaryRow } from "@/lib/teamAttendanceStore";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function attendanceJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export type AttendanceErrorCode =
  | "unauthorized" | "forbidden"
  | "invalid_date" | "invalid_range" | "invalid_request" | "invalid_records"
  | "payload_too_large" | "unsupported_media_type"
  | "version_conflict" | "roster_changed" | "session_not_draft" | "date_not_editable" | "date_in_future"
  | "team_not_found" | "attendance_unavailable" | "error";

const ERRORS: Record<AttendanceErrorCode, { status: number; error: string; reload?: true }> = {
  unauthorized:            { status: 401, error: "Sign in to take attendance." },
  forbidden:               { status: 403, error: "Only this team's coaches can take attendance." },
  invalid_date:            { status: 400, error: "That isn't a valid date." },
  invalid_range:           { status: 400, error: "Choose a date range of up to one year." },
  invalid_request:         { status: 400, error: "The attendance request wasn't valid." },
  invalid_records:         { status: 422, error: "Some attendance entries aren't valid." },
  payload_too_large:       { status: 413, error: "This attendance is too large to save." },
  unsupported_media_type:  { status: 415, error: "Attendance must be sent as JSON." },
  version_conflict:        { status: 409, error: "Another coach saved this attendance first. Reload to see their changes.", reload: true },
  roster_changed:          { status: 409, error: "The roster changed while you were taking attendance. Reload to update it.", reload: true },
  session_not_draft:       { status: 409, error: "This attendance has been finalized and can't be changed." },
  date_not_editable:       { status: 409, error: "Attendance older than 14 days is read-only." },
  date_in_future:          { status: 409, error: "Attendance can't be taken for a future date." },
  team_not_found:          { status: 404, error: "Team not found." },
  attendance_unavailable:  { status: 503, error: "Attendance isn't available right now. Please try again." },
  error:                   { status: 500, error: "Something went wrong. Please try again." },
};

export function attendanceError(code: AttendanceErrorCode, extra: { issues?: AttendanceIssue[] } = {}) {
  const { status, error, reload } = ERRORS[code];
  return attendanceJson({ error, code, ...(reload ? { reload: true } : {}), ...(extra.issues ? { issues: extra.issues } : {}) }, status);
}

/** The database's fixed code for a refused save -> the API's code. */
export const DB_ERROR_RESPONSES: Record<AttendanceDbError, AttendanceErrorCode> = {
  attendance_version_conflict:         "version_conflict",
  attendance_session_not_found:        "version_conflict",
  attendance_roster_incomplete:        "roster_changed",
  attendance_athlete_removed:          "roster_changed",
  attendance_late_athlete_unconfirmed: "roster_changed",
  attendance_roster_empty:             "roster_changed",
  attendance_session_not_draft:        "session_not_draft",
  attendance_date_not_editable:        "date_not_editable",
  attendance_date_in_future:           "date_in_future",
  attendance_date_invalid:             "invalid_date",
  attendance_team_not_found:           "team_not_found",
  attendance_actor_invalid:            "forbidden",
  attendance_actor_not_authorized:     "forbidden",
  attendance_version_invalid:          "invalid_request",
  attendance_records_invalid:          "invalid_records",
  attendance_record_invalid:           "invalid_records",
  attendance_records_too_many:         "invalid_records",
  attendance_athlete_duplicate:        "invalid_records",
  attendance_athlete_cross_team:       "invalid_records",
  attendance_range_invalid:            "invalid_range",
};

/** Head Coach, Assistant Coach and platform admins of THIS team only —
 *  the actor must already be resolved with getTeamActor(slug). Returns
 *  the response to send if not allowed, or null. Called before any
 *  attendance data is read. */
export function denyUnlessAttendanceEditor(actor: TeamActor): NextResponse | null {
  if (actor.kind === "public") return attendanceError("unauthorized");
  if (!canEditAttendance(actor) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) return attendanceError("forbidden");
  return null;
}

/** Below Vercel's 4.5 MB request limit; a 5,000-athlete save with notes fits. */
export const ATTENDANCE_MAX_BODY_BYTES = 4_000_000;

/** Reads a JSON body with a size limit. Never logs or echoes it. */
export async function readJsonBody(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) return { ok: false, response: attendanceError("unsupported_media_type") };
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > ATTENDANCE_MAX_BODY_BYTES) return { ok: false, response: attendanceError("payload_too_large") };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: attendanceError("invalid_request") };
  }
  if (new TextEncoder().encode(text).length > ATTENDANCE_MAX_BODY_BYTES) return { ok: false, response: attendanceError("payload_too_large") };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: attendanceError("invalid_request") };
  }
}

export type SessionView = {
  sessionDate: string;
  status: string;
  version: number;
  timeZone: string;
  editable: boolean;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  totals: AttendanceTotals;
};

export function sessionView(s: AttendanceSummaryRow): SessionView {
  return {
    sessionDate: s.session_date,
    status: s.status,
    version: s.version,
    timeZone: s.time_zone,
    editable: s.editable,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    createdByName: s.created_by_name,
    updatedByName: s.updated_by_name,
    totals: totalsFromSummary(s),
  };
}
