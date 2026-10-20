// Test-only fixtures for the attendance screen tests: API-shaped date
// views and session lists (as the Phase 5-3 API returns them) and a fake
// API that records calls.

export const TODAY = "2026-10-20";
export const TZ = "America/Phoenix";
/** Server time: 10:00 in Phoenix on TODAY. */
export const SERVER_TIME = "2026-10-20T17:00:00.000Z";
export const SECRET_NOTE = "Private medical detail 7731";

export const A = n => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const R = n => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const clock = (today = TODAY, serverTime = SERVER_TIME) => ({ today, timeZone: TZ, serverTime });

/** A roster row as team_attendance_session_roster() returns it. */
export function row(n, name, extra = {}) {
  return {
    record_id: null, athlete_id: A(n), athlete_name: name, class_year: "Junior", on_roster: true,
    added_after_session_date: false, has_record: false, requires_decision: false,
    status: null, absence_reason: null, note: null, record_updated_at: null, record_updated_by_name: null,
    ...extra,
  };
}

/** A saved record on a roster row. */
export function saved(r, n, status, reason = null, note = null, by = "Hana Head") {
  return {
    ...r, record_id: R(n), has_record: true, requires_decision: false, status,
    absence_reason: status === "absent" ? reason : null, note: status === "absent" ? note : null,
    record_updated_at: "2026-10-20T16:00:00.000Z", record_updated_by_name: by,
  };
}

export function totals(t = {}) {
  const present = t.present ?? 0, absent = t.absent ?? 0, total = present + absent;
  return {
    total, present, absent, excused: t.excused ?? 0, unexcused: t.unexcused ?? 0, other: t.other ?? 0,
    reasonMissing: 0, removed: t.removed ?? 0,
    presentRate: total ? present / total : null,
    presentPercent: total ? Math.round((present / total) * 1000) / 10 : null,
    state: total ? "data" : "no_data",
  };
}

export function session(date, version, t = {}, extra = {}) {
  return {
    sessionDate: date, status: "draft", version, timeZone: TZ, editable: true,
    createdAt: "2026-10-20T15:00:00.000Z", updatedAt: "2026-10-20T16:00:00.000Z",
    createdByName: "Hana Head", updatedByName: "Hana Head", totals: totals(t), ...extra,
  };
}

/** What GET /attendance/[date] returns (parsed). */
export function dateView(date, rows, opts = {}) {
  return {
    clock: opts.clock ?? clock(),
    sessionDate: date,
    editability: opts.editability ?? "editable",
    session: opts.session ?? null,
    rows,
  };
}

export function sessionList(sessions = [], c = clock()) {
  const from = "2026-10-06";
  return { clock: c, editableFrom: from, editableTo: c.today, from: "2025-10-20", to: c.today, sessions };
}

/** Five athletes on a new date. */
export function newRoster() {
  return [row(1, "Ava Adams"), row(2, "Ben Brown"), row(3, "Cy Clark", { class_year: null }), row(4, "Dee Diaz", { class_year: "Senior" }), row(5, "Eli Evans")];
}

/** A fake AttendanceApi: queued responses, recorded calls. */
export function fakeApi({ saves = [], loads = [], lists = [] } = {}) {
  const calls = { save: [], loadDate: [], listSessions: [] };
  return {
    calls,
    async save(payload) { calls.save.push(structuredClone(payload)); return saves.shift() ?? { ok: false, failure: { kind: "error" } }; },
    async loadDate(date) { calls.loadDate.push(date); return loads.shift() ?? { ok: false, failure: "unavailable" }; },
    async listSessions(range) { calls.listSessions.push(range ?? null); return lists.shift() ?? { ok: false, failure: "unavailable" }; },
  };
}
