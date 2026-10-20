// Team Management Phase 5-4 — the attendance screen's calls to the Phase
// 5-3 API (/api/team/[slug]/attendance…). Strict: a response that doesn't
// have exactly the expected shape is a failure, never partial data.
//
// Privacy: nothing here logs, and nothing is kept outside memory (no
// localStorage/sessionStorage/IndexedDB). Error results carry the API's
// fixed code and, for a refused save, per-athlete issue codes — never a
// response body, a note or a name.
import {
  isIsoDate,
  type AttendanceIssue,
  type AttendanceRuleCode,
  type AttendanceTotals,
} from "../../../../lib/teamAttendance.ts";
import type { AttendanceSavePayload } from "../../../../lib/teamAttendanceDraft.ts";

export type AttendanceClockView = {
  /** The team's local date, from the database. */
  today: string;
  timeZone: string;
  serverTime: string;
};

export type AttendanceSessionSummary = {
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

export type AttendanceSessionList = {
  clock: AttendanceClockView;
  editableFrom: string;
  editableTo: string;
  from: string;
  to: string;
  sessions: AttendanceSessionSummary[];
};

export type AttendanceEditability = "editable" | "date_in_future" | "date_not_editable" | "session_not_draft";

export type AttendanceDateView = {
  clock: AttendanceClockView;
  sessionDate: string;
  editability: AttendanceEditability;
  session: AttendanceSessionSummary | null;
  /** Checked again by buildAttendanceDraft (parseRosterRows). */
  rows: unknown[];
};

export type AttendanceReadFailure = "unauthorized" | "forbidden" | "not_found" | "invalid" | "unavailable" | "network";
export type AttendanceRead<T> = { ok: true; value: T } | { ok: false; failure: AttendanceReadFailure };

export type AttendanceSaveFailure =
  | { kind: "conflict" }                              // another coach saved first
  | { kind: "roster_changed" }                        // the roster changed underneath
  | { kind: "read_only"; reason: "session_not_draft" | "date_not_editable" | "date_in_future" }
  | { kind: "invalid_records"; issues: AttendanceIssue[] }
  | { kind: "invalid_request" }
  | { kind: "unauthorized" }
  | { kind: "forbidden" }
  | { kind: "not_found" }
  | { kind: "unavailable" }
  // The request may or may not have reached the server: the result is
  // unknown. Saving again is safe — a save that did land makes the retry
  // a version conflict, which merges instead of overwriting.
  | { kind: "network" }
  | { kind: "error" };

export type AttendanceSaveSuccess = { sessionDate: string; version: number; savedAt: string; created: boolean };
export type AttendanceSaveResult = { ok: true; value: AttendanceSaveSuccess } | { ok: false; failure: AttendanceSaveFailure };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// ── Parsing ───────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const optStr = (v: unknown): v is string | null => v === null || typeof v === "string";
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isInstant = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v));

const EDITABILITY = new Set<AttendanceEditability>(["editable", "date_in_future", "date_not_editable", "session_not_draft"]);

function parseClock(b: Record<string, unknown>): AttendanceClockView | null {
  if (!isIsoDate(b.today) || !isStr(b.timeZone) || !b.timeZone || !isInstant(b.serverTime)) return null;
  return { today: b.today, timeZone: b.timeZone, serverTime: b.serverTime };
}

function parseTotals(v: unknown): AttendanceTotals | null {
  if (!isObj(v)) return null;
  const keys = ["total", "present", "absent", "excused", "unexcused", "other", "reasonMissing", "removed"] as const;
  if (!keys.every(k => isCount(v[k]))) return null;
  if (v.state !== "data" && v.state !== "no_data") return null;
  const rate = v.presentRate, pct = v.presentPercent;
  if (!(rate === null || typeof rate === "number") || !(pct === null || typeof pct === "number")) return null;
  const t = v as unknown as AttendanceTotals;
  if (t.present + t.absent !== t.total) return null;
  return t;
}

export function parseSessionSummary(v: unknown): AttendanceSessionSummary | null {
  if (!isObj(v)) return null;
  if (!isIsoDate(v.sessionDate) || !isStr(v.status) || !isStr(v.timeZone) || typeof v.editable !== "boolean") return null;
  if (typeof v.version !== "number" || !Number.isInteger(v.version) || v.version < 1) return null;
  if (!isInstant(v.createdAt) || !isInstant(v.updatedAt) || !optStr(v.createdByName) || !optStr(v.updatedByName)) return null;
  const totals = parseTotals(v.totals);
  if (!totals) return null;
  return {
    sessionDate: v.sessionDate, status: v.status, version: v.version, timeZone: v.timeZone, editable: v.editable,
    createdAt: v.createdAt, updatedAt: v.updatedAt, createdByName: v.createdByName, updatedByName: v.updatedByName, totals,
  };
}

export function parseSessionList(body: unknown): AttendanceSessionList | null {
  if (!isObj(body) || body.available !== true) return null;
  const clock = parseClock(body);
  if (!clock) return null;
  if (![body.editableFrom, body.editableTo, body.from, body.to].every(isIsoDate)) return null;
  if (!Array.isArray(body.sessions)) return null;
  const sessions: AttendanceSessionSummary[] = [];
  const dates = new Set<string>();
  for (const raw of body.sessions) {
    const s = parseSessionSummary(raw);
    if (!s || dates.has(s.sessionDate)) return null;
    dates.add(s.sessionDate);
    sessions.push(s);
  }
  sessions.sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : -1));
  return {
    clock,
    editableFrom: body.editableFrom as string,
    editableTo: body.editableTo as string,
    from: body.from as string,
    to: body.to as string,
    sessions,
  };
}

export function parseDateView(body: unknown, expectedDate: string): AttendanceDateView | null {
  if (!isObj(body) || body.available !== true) return null;
  const clock = parseClock(body);
  if (!clock || body.sessionDate !== expectedDate) return null;
  if (!isStr(body.editability) || !EDITABILITY.has(body.editability as AttendanceEditability)) return null;
  if (typeof body.editable !== "boolean" || body.editable !== (body.editability === "editable")) return null;
  let session: AttendanceSessionSummary | null = null;
  if (body.session !== null) {
    session = parseSessionSummary(body.session);
    if (!session || session.sessionDate !== expectedDate) return null;
  }
  if (!Array.isArray(body.rows)) return null;
  return { clock, sessionDate: expectedDate, editability: body.editability as AttendanceEditability, session, rows: body.rows };
}

const ISSUE_CODES = new Set<string>([
  "invalid_date", "invalid_time_zone", "date_in_future", "date_not_editable", "session_not_draft", "draft_read_only",
  "invalid_status", "invalid_reason", "reason_required", "invalid_note", "note_too_long", "note_requires_absent",
  "athlete_unknown", "athlete_not_editable", "athlete_required", "late_athlete_not_included", "duplicate_athlete",
  "invalid_roster", "roster_empty", "too_many_records", "unresolved_conflicts", "unknown_conflict",
]);

function parseIssues(v: unknown): AttendanceIssue[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap(i => (isObj(i) && isStr(i.code) && ISSUE_CODES.has(i.code) && optStr(i.athleteId)
    ? [{ code: i.code as AttendanceRuleCode, athleteId: i.athleteId }]
    : []));
}

function readFailure(status: number): AttendanceReadFailure {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400) return "invalid";
  return "unavailable";
}

async function jsonOf(res: Response): Promise<unknown> {
  try { return await res.json(); } catch { return null; }
}

// ── Calls ─────────────────────────────────────────────────────────────────

export function attendanceApiPaths(slug: string) {
  const base = `/api/team/${encodeURIComponent(slug)}/attendance`;
  return {
    list: (from?: string, to?: string) => {
      const q = new URLSearchParams();
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      const qs = q.toString();
      return qs ? `${base}?${qs}` : base;
    },
    date: (date: string) => `${base}/${encodeURIComponent(date)}`,
  };
}

export type AttendanceApi = {
  listSessions(range?: { from?: string; to?: string }): Promise<AttendanceRead<AttendanceSessionList>>;
  loadDate(date: string): Promise<AttendanceRead<AttendanceDateView>>;
  /** The Phase 5-2 payload (buildSavePayload) to the Phase 5-3 PUT. */
  save(payload: AttendanceSavePayload): Promise<AttendanceSaveResult>;
};

export function createAttendanceApi(slug: string, fetchImpl: FetchLike = (i, init) => fetch(i, init)): AttendanceApi {
  const paths = attendanceApiPaths(slug);

  async function read<T>(url: string, parse: (body: unknown) => T | null): Promise<AttendanceRead<T>> {
    let res: Response;
    try {
      res = await fetchImpl(url, { method: "GET", cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
    } catch {
      return { ok: false, failure: "network" };
    }
    if (!res.ok) return { ok: false, failure: readFailure(res.status) };
    const value = parse(await jsonOf(res));
    return value ? { ok: true, value } : { ok: false, failure: "unavailable" };
  }

  return {
    listSessions: (range = {}) => read(paths.list(range.from, range.to), parseSessionList),

    loadDate: date => {
      if (!isIsoDate(date)) return Promise.resolve({ ok: false, failure: "invalid" });
      return read(paths.date(date), body => parseDateView(body, date));
    },

    async save(payload) {
      if (!isIsoDate(payload.sessionDate)) return { ok: false, failure: { kind: "invalid_request" } };
      let res: Response;
      try {
        res = await fetchImpl(paths.date(payload.sessionDate), {
          method: "PUT",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          // Exactly the two fields the API accepts — never an identity.
          body: JSON.stringify({ expectedVersion: payload.expectedVersion, records: payload.records }),
        });
      } catch {
        return { ok: false, failure: { kind: "network" } };
      }
      const body = await jsonOf(res);
      if (res.ok) {
        if (isObj(body) && body.ok === true && body.sessionDate === payload.sessionDate
            && typeof body.version === "number" && Number.isInteger(body.version) && body.version >= 1
            && isInstant(body.savedAt) && typeof body.created === "boolean") {
          return { ok: true, value: { sessionDate: payload.sessionDate, version: body.version, savedAt: body.savedAt, created: body.created } };
        }
        // A 2xx we can't read: the save probably happened, but we can't
        // confirm it — treated like a lost connection (never as success).
        return { ok: false, failure: { kind: "network" } };
      }
      const code = isObj(body) && isStr(body.code) ? body.code : "";
      switch (code) {
        case "version_conflict": return { ok: false, failure: { kind: "conflict" } };
        case "roster_changed": return { ok: false, failure: { kind: "roster_changed" } };
        case "session_not_draft":
        case "date_not_editable":
        case "date_in_future": return { ok: false, failure: { kind: "read_only", reason: code } };
        case "invalid_records": return { ok: false, failure: { kind: "invalid_records", issues: parseIssues(isObj(body) ? body.issues : null) } };
        case "invalid_request":
        case "invalid_date":
        case "unsupported_media_type":
        case "payload_too_large": return { ok: false, failure: { kind: "invalid_request" } };
        case "team_not_found": return { ok: false, failure: { kind: "not_found" } };
      }
      if (res.status === 401) return { ok: false, failure: { kind: "unauthorized" } };
      if (res.status === 403) return { ok: false, failure: { kind: "forbidden" } };
      if (res.status === 503) return { ok: false, failure: { kind: "unavailable" } };
      return { ok: false, failure: { kind: "error" } };
    },
  };
}
