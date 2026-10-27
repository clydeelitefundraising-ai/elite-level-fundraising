// Team Management Phase 5-3 — attendance: database access via the
// service-role PostgREST API, using only the Phase 5-1 functions
// (team_attendance_today / _time_zone / _date_editable /
// _session_summaries / _session_roster / _save_draft). Pure rules live in
// teamAttendance.ts and teamAttendanceDraft.ts.
//
// Reads are STRICT and COMPLETE or they fail (same approach as
// teamTaskCompletionStore.ts):
//  - Supabase caps every response (1,000 rows on this project), silently.
//    Lists are read page by page in a deterministic order on a unique key,
//    with an exact count; the rows must add up to that count with no
//    duplicates, and the count must not change between pages.
//  - A date's roster is read between two reads of the session's version;
//    if anything was saved meanwhile the load is retried, and fails rather
//    than mixing two versions.
//  - Rows are checked with parseRosterRows() before anyone relies on them.
// Any failure is "error"/"unavailable" — never a partial roster.
//
// Writes go only through team_attendance_save_draft(), with the actor
// built by attendanceDbActor() from the server-resolved TeamActor. Error
// bodies are never logged or returned (a database error can quote row
// values, including notes): only the fixed code is kept.
import type { TeamActor } from "./permissions.ts";
import { isMissingSchemaError } from "./teamTasksStore.ts";
import { attendanceDbActor } from "./teamAttendanceActor.ts";
import { attendanceDbErrorCode, isIsoDate, type AttendanceDbError } from "./teamAttendance.ts";
import { parseRosterRows, type AttendanceRosterRow, type AttendanceSaveRecord } from "./teamAttendanceDraft.ts";
import type { AttendanceSaveResult } from "./teamAttendanceAudit.ts";
import { summarizeAthleteAbsences, type AthleteAbsenceSummary } from "./athleteAttendance.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

export type AttendanceReadFailure = "unavailable" | "error";
export type AttendanceReadResult<T> = { ok: true; value: T } | { ok: false; reason: AttendanceReadFailure };

class ReadError extends Error {
  readonly reason: AttendanceReadFailure;
  constructor(reason: AttendanceReadFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Requested page size. If the server's cap is lower, pages come back
 *  shorter and the loop continues from where they end. */
export const ATTENDANCE_PAGE_SIZE = 1000;
/** Load attempts when a save lands between the reads of one date. */
export const ATTENDANCE_LOAD_ATTEMPTS = 3;

function fail(res: Response, body: string): ReadError {
  // Status only — never the body.
  return new ReadError(isMissingSchemaError(body) ? "unavailable" : "error", `HTTP ${res.status}`);
}

function totalFrom(contentRange: string | null): number | null {
  const m = /\/(\d+)$/.exec(contentRange ?? "");
  return m ? Number(m[1]) : null;
}

/** Every row of an ordered read, with an exact count, or a ReadError. */
async function readAll<T>(path: string, keyOf: (row: T) => string): Promise<T[]> {
  const rows: T[] = [];
  const keys = new Set<string>();
  let total: number | null = null;
  for (let offset = 0; total === null || offset < total; ) {
    const res = await fetch(`${BASE}/rest/v1/${path}&limit=${ATTENDANCE_PAGE_SIZE}&offset=${offset}`, {
      headers: h({ Prefer: "count=exact" }), cache: "no-store",
    });
    if (!res.ok) throw fail(res, await res.text());
    const page = await res.json();
    if (!Array.isArray(page)) throw new ReadError("error", "unexpected response");
    const pageTotal = totalFrom(res.headers.get("content-range"));
    if (pageTotal === null) throw new ReadError("error", "no exact count");
    if (total !== null && pageTotal !== total) throw new ReadError("error", "count changed between pages");
    total = pageTotal;
    if (page.length === 0 && offset < total) throw new ReadError("error", "truncated");
    if (offset + page.length > total) throw new ReadError("error", "more rows than counted");
    for (const row of page as T[]) {
      const key = keyOf(row);
      if (keys.has(key)) throw new ReadError("error", "duplicate row");
      keys.add(key);
      rows.push(row);
    }
    offset += page.length;
  }
  if (rows.length !== total) throw new ReadError("error", "row count mismatch");
  return rows;
}

async function rpcValue<T>(name: string, params: Record<string, string>): Promise<T> {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}?${q}`, { headers: h(), cache: "no-store" });
  if (!res.ok) throw fail(res, await res.text());
  return (await res.json()) as T;
}

async function guarded<T>(label: string, run: () => Promise<T>): Promise<AttendanceReadResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (err) {
    const reason: AttendanceReadFailure = err instanceof ReadError ? err.reason : "error";
    console.error(`[attendance] ${label} failed: ${reason}${err instanceof ReadError ? ` (${err.message})` : ""}`);
    return { ok: false, reason };
  }
}

// ── Team clock ────────────────────────────────────────────────────────────

export type AttendanceClock = {
  /** The team's local date, from the database (team_attendance_today). */
  today: string;
  /** The team's IANA zone (team_attendance_time_zone). */
  timeZone: string;
  /** The server's time when this was read (ISO). */
  serverTime: string;
};

export async function getAttendanceClock(slug: string): Promise<AttendanceReadResult<AttendanceClock>> {
  return guarded("clock", async () => {
    const [today, timeZone] = await Promise.all([
      rpcValue<unknown>("team_attendance_today", { p_campaign_slug: slug }),
      rpcValue<unknown>("team_attendance_time_zone", { p_campaign_slug: slug }),
    ]);
    if (!isIsoDate(today) || typeof timeZone !== "string" || !timeZone) throw new ReadError("error", "malformed clock");
    return { today, timeZone, serverTime: new Date().toISOString() };
  });
}

/** The database's own decision for a date with no session yet. */
async function dateEditable(date: string, today: string): Promise<boolean> {
  const v = await rpcValue<unknown>("team_attendance_date_editable", { p_session_date: date, p_today: today });
  if (typeof v !== "boolean") throw new ReadError("error", "malformed editability");
  return v;
}

// ── Session summaries ─────────────────────────────────────────────────────

/** One row of team_attendance_session_summaries(). */
export type AttendanceSummaryRow = {
  session_id: string;
  session_date: string;
  status: string;
  version: number;
  time_zone: string;
  editable: boolean;
  created_at: string;
  updated_at: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  recorded_count: number;
  present_count: number;
  absent_count: number;
  excused_count: number;
  unexcused_count: number;
  other_count: number;
  removed_count: number;
};

const COUNT_FIELDS = ["version", "recorded_count", "present_count", "absent_count", "excused_count", "unexcused_count", "other_count", "removed_count"] as const;

function checkSummary(r: AttendanceSummaryRow): AttendanceSummaryRow {
  const ok = r && typeof r.session_id === "string" && isIsoDate(r.session_date) && typeof r.status === "string"
    && typeof r.time_zone === "string" && typeof r.editable === "boolean"
    && COUNT_FIELDS.every(k => Number.isInteger(r[k]) && r[k] >= 0) && r.version >= 1;
  if (!ok) throw new ReadError("error", "malformed summary row");
  return r;
}

async function readSummaries(slug: string, from: string, to: string): Promise<AttendanceSummaryRow[]> {
  const q = new URLSearchParams({ p_campaign_slug: slug, p_from: from, p_to: to }).toString();
  const rows = await readAll<AttendanceSummaryRow>(`rpc/team_attendance_session_summaries?${q}&order=session_date.desc`, r => String(r.session_date));
  return rows.map(checkSummary);
}

/** The team's sessions between two dates (inclusive), newest first. */
export async function listAttendanceSessions(slug: string, from: string, to: string): Promise<AttendanceReadResult<AttendanceSummaryRow[]>> {
  return guarded("list", () => readSummaries(slug, from, to));
}

// ── One athlete's absences (athlete profile) ──────────────────────────────

/** Every saved absence of one athlete on this team season (drafts
 *  included), counted by category, newest first — for the athlete
 *  profile's Attendance section (athleteAttendance.ts). Filtered by BOTH
 *  campaign_slug and athlete_id, so another team or season never appears.
 *  Selects only the date and category: notes are never read. Callers
 *  check who may see it (canViewAthleteAttendance) before calling. */
export async function getAthleteAbsences(slug: string, athleteId: string): Promise<AttendanceReadResult<AthleteAbsenceSummary>> {
  return guarded("athlete absences", async () => {
    const path = `team_attendance_records?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=eq.${encodeURIComponent(athleteId)}`
      + `&status=eq.absent&select=id,session_date,absence_reason&order=session_date.desc,id.asc`;
    const rows = await readAll<{ id: string; session_date: unknown; absence_reason: unknown }>(path, r => String(r.id));
    const summary = summarizeAthleteAbsences(rows);
    if (!summary) throw new ReadError("error", "malformed absence row");
    return summary;
  });
}

// ── One date ──────────────────────────────────────────────────────────────

export type AttendanceEditability = "editable" | "date_in_future" | "date_not_editable" | "session_not_draft";

export type AttendanceDateView = {
  sessionDate: string;
  session: AttendanceSummaryRow | null;
  /** The database's decision (summary.editable, or team_attendance_date_editable for a new date). */
  editability: AttendanceEditability;
  rows: AttendanceRosterRow[];
};

const ROSTER_ORDER = "order=athlete_name.asc,athlete_id.asc.nullsfirst,record_id.asc.nullsfirst";
const rosterKey = (r: AttendanceRosterRow) => `${r.athlete_id ?? "-"}|${r.record_id ?? "-"}`;

/** A date's session and its COMPLETE roster (current athletes plus kept
 *  records of removed ones), consistent with one saved version. */
export async function loadAttendanceDate(slug: string, date: string, clock: AttendanceClock): Promise<AttendanceReadResult<AttendanceDateView>> {
  return guarded("load", async () => {
    for (let attempt = 1; attempt <= ATTENDANCE_LOAD_ATTEMPTS; attempt++) {
      const before = (await readSummaries(slug, date, date))[0] ?? null;
      const q = new URLSearchParams({ p_campaign_slug: slug, p_session_date: date }).toString();
      const raw = await readAll<AttendanceRosterRow>(`rpc/team_attendance_session_roster?${q}&${ROSTER_ORDER}`, rosterKey);
      const after = (await readSummaries(slug, date, date))[0] ?? null;
      if ((before?.version ?? 0) !== (after?.version ?? 0) || (before?.session_id ?? null) !== (after?.session_id ?? null)) continue;

      let rows: AttendanceRosterRow[];
      try { rows = parseRosterRows(raw); } catch { throw new ReadError("error", "malformed roster"); }
      if (after) {
        const recorded = rows.filter(r => r.has_record).length;
        if (recorded !== after.recorded_count) throw new ReadError("error", "records don't match the session");
      } else if (rows.some(r => r.has_record)) {
        throw new ReadError("error", "records without a session");
      }

      let editability: AttendanceEditability;
      if (after) {
        if (after.status !== "draft") editability = "session_not_draft";
        else if (after.editable) editability = "editable";
        else editability = date > clock.today ? "date_in_future" : "date_not_editable";
      } else {
        editability = (await dateEditable(date, clock.today)) ? "editable" : date > clock.today ? "date_in_future" : "date_not_editable";
      }
      return { sessionDate: date, session: after, editability, rows };
    }
    throw new ReadError("error", "attendance kept changing while loading");
  });
}

// ── Saving ────────────────────────────────────────────────────────────────

export type AttendanceSaveFailure =
  | { kind: "db"; code: AttendanceDbError }
  | { kind: "unavailable" }
  | { kind: "forbidden" }
  | { kind: "error" };

export type AttendanceSaveResponse = { ok: true; value: AttendanceSaveResult } | { ok: false; failure: AttendanceSaveFailure };

/** Saves a draft through team_attendance_save_draft(). The actor comes
 *  ONLY from the server-resolved TeamActor via attendanceDbActor(). */
export async function saveAttendanceDraft(
  slug: string,
  actor: TeamActor,
  input: { sessionDate: string; expectedVersion: number; records: AttendanceSaveRecord[] },
): Promise<AttendanceSaveResponse> {
  const dbActor = attendanceDbActor(actor);
  if (!dbActor) return { ok: false, failure: { kind: "forbidden" } };
  try {
    const res = await fetch(`${BASE}/rest/v1/rpc/team_attendance_save_draft`, {
      method: "POST",
      headers: h({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        p_campaign_slug: slug,
        p_session_date: input.sessionDate,
        p_expected_version: input.expectedVersion,
        p_records: input.records,
        p_actor: dbActor,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (isMissingSchemaError(text)) return { ok: false, failure: { kind: "unavailable" } };
      const code = attendanceDbErrorCode(text);
      if (code === "unknown") {
        console.error(`[attendance] save failed: HTTP ${res.status}`);
        return { ok: false, failure: { kind: "error" } };
      }
      return { ok: false, failure: { kind: "db", code } };
    }
    const value = JSON.parse(text) as AttendanceSaveResult;
    if (!value || typeof value.session_id !== "string" || !Number.isInteger(value.version) || typeof value.created !== "boolean" || !value.counts) {
      console.error("[attendance] save returned an unexpected result");
      return { ok: false, failure: { kind: "error" } };
    }
    return { ok: true, value };
  } catch {
    console.error("[attendance] save failed: request error");
    return { ok: false, failure: { kind: "error" } };
  }
}
