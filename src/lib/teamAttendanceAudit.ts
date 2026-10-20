// Team Management Phase 5 — audit events for attendance drafts.
//
// Pure (no I/O). The attendance API (Phase 5-3) passes the result of
// team_attendance_save_draft() here and hands the event to logAuditEvent,
// the same fire-and-forget audit trail the To-Do routes use.
//
// Counts and actor identity ONLY. The input type carries no athlete
// names, statuses, absence reasons or notes, and the builder copies only
// the fields below — so student information can never reach the audit
// log, even if a caller passes a richer object.
import type { AuditActor, AuditEventParams } from "./auditLog.ts";

export type AttendanceSaveCounts = {
  total: number;
  present: number;
  absent: number;
  excused: number;
  unexcused: number;
  other: number;
};

/** What team_attendance_save_draft() returns (see phase_t5_attendance_drafts.sql). */
export type AttendanceSaveResult = {
  session_id: string;
  session_date: string;
  version: number;
  saved_at: string;
  created: boolean;
  counts: AttendanceSaveCounts;
};

export const ATTENDANCE_AUDIT_ENTITY = "team_attendance_session";

export const ATTENDANCE_AUDIT_ACTIONS = {
  created: "attendance_session.created",
  saved:   "attendance_session.saved",
} as const;

const COUNT_KEYS = ["total", "present", "absent", "excused", "unexcused", "other"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function count(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** The audit event for one successful save: "created" for the first save
 *  of a date's session, "saved" after that. */
export function attendanceAuditEvent(input: {
  actor: AuditActor;
  campaignSlug: string;
  result: AttendanceSaveResult;
  ipAddress: string | null;
  userAgent: string | null;
}): AuditEventParams {
  const { result } = input;
  const counts = Object.fromEntries(COUNT_KEYS.map(k => [k, count(result.counts?.[k])])) as AttendanceSaveCounts;
  const sessionDate = typeof result.session_date === "string" && DATE_RE.test(result.session_date) ? result.session_date : null;
  const version = count(result.version);
  const created = result.created === true;
  const verb = created ? "Started" : "Saved";

  return {
    actor: input.actor,
    action: created ? ATTENDANCE_AUDIT_ACTIONS.created : ATTENDANCE_AUDIT_ACTIONS.saved,
    entity_type: ATTENDANCE_AUDIT_ENTITY,
    entity_id: String(result.session_id),
    campaign_slug: input.campaignSlug,
    summary:
      `${verb} attendance draft for ${sessionDate ?? "an unknown date"} on ${input.campaignSlug}: ` +
      `${counts.present} present, ${counts.absent} absent (${counts.total} athlete${counts.total === 1 ? "" : "s"})`,
    new_value: { session_date: sessionDate, version, created, counts },
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
  };
}
