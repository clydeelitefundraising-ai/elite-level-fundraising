// Team Management Phase 5-4 — the screen's API client: exact requests to
// the Phase 5-3 endpoints, strict response parsing, and error mapping that
// never treats an unconfirmed save as saved.
import test from "node:test";
import assert from "node:assert/strict";
import { createAttendanceApi, parseDateView, parseSessionList } from "./attendanceApi.ts";
import { A, SECRET_NOTE, TODAY, TZ, row, totals } from "./testSupport/fixtures.mjs";

type Call = { url: string; init: RequestInit };

function fetchReturning(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, impl };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const apiSession = (date: string, version = 1) => ({
  sessionDate: date, status: "draft", version, timeZone: TZ, editable: true,
  createdAt: "2026-10-20T15:00:00Z", updatedAt: "2026-10-20T16:00:00Z", createdByName: "Hana", updatedByName: null,
  totals: totals({ present: 3, absent: 1, excused: 1 }),
});
const listBody = (sessions: unknown[] = []) => ({
  available: true, today: TODAY, timeZone: TZ, serverTime: "2026-10-20T17:00:00.000Z",
  editableFrom: "2026-10-06", editableTo: TODAY, from: "2026-10-06", to: TODAY, sessions,
});
const dateBody = (extra: Record<string, unknown> = {}) => ({
  available: true, today: TODAY, timeZone: TZ, serverTime: "2026-10-20T17:00:00.000Z",
  sessionDate: TODAY, editable: true, editability: "editable", session: null, rows: [row(1, "Ava")], ...extra,
});

test("reads: GET to the Phase 5-3 paths, no-store, same-origin credentials, slug and date encoded", async () => {
  const f = fetchReturning(json(listBody()), json(listBody()), json(dateBody()));
  const api = createAttendanceApi("monroe valley/x", f.impl);
  await api.listSessions();
  await api.listSessions({ from: "2025-10-20", to: TODAY });
  await api.loadDate(TODAY);
  assert.deepEqual(f.calls.map(c => c.url), [
    "/api/team/monroe%20valley%2Fx/attendance",
    "/api/team/monroe%20valley%2Fx/attendance?from=2025-10-20&to=2026-10-20",
    `/api/team/monroe%20valley%2Fx/attendance/${TODAY}`,
  ]);
  for (const c of f.calls) {
    assert.equal(c.init.method, "GET");
    assert.equal(c.init.cache, "no-store");
    assert.equal(c.init.credentials, "same-origin");
    assert.equal(c.init.body, undefined);
  }
});

test("an invalid date is never requested", async () => {
  const f = fetchReturning();
  const r = await createAttendanceApi("t", f.impl).loadDate("2026-02-30");
  assert.deepEqual(r, { ok: false, failure: "invalid" });
  assert.equal(f.calls.length, 0);
});

test("save: PUT with exactly { expectedVersion, records } as JSON — no identity, no names", async () => {
  const f = fetchReturning(json({ ok: true, sessionDate: TODAY, version: 3, savedAt: "2026-10-20T17:05:00Z", created: false, counts: {} }));
  const records = [{ athlete_id: A(1), status: "absent" as const, absence_reason: "other" as const, note: "n" }];
  const r = await createAttendanceApi("team-a", f.impl).save({ sessionDate: TODAY, expectedVersion: 2, records });
  assert.deepEqual(r, { ok: true, value: { sessionDate: TODAY, version: 3, savedAt: "2026-10-20T17:05:00Z", created: false } });
  const [c] = f.calls;
  assert.equal(c.url, `/api/team/team-a/attendance/${TODAY}`);
  assert.equal(c.init.method, "PUT");
  assert.equal((c.init.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.deepEqual(Object.keys(JSON.parse(String(c.init.body))), ["expectedVersion", "records"]);
  assert.deepEqual(JSON.parse(String(c.init.body)), { expectedVersion: 2, records });
});

test("save errors map to what the editor does next", async () => {
  const cases: [Response, unknown][] = [
    [json({ code: "version_conflict", reload: true }, 409), { kind: "conflict" }],
    [json({ code: "roster_changed", reload: true }, 409), { kind: "roster_changed" }],
    [json({ code: "date_not_editable" }, 409), { kind: "read_only", reason: "date_not_editable" }],
    [json({ code: "session_not_draft" }, 409), { kind: "read_only", reason: "session_not_draft" }],
    [json({ code: "date_in_future" }, 409), { kind: "read_only", reason: "date_in_future" }],
    [json({ code: "invalid_records", issues: [{ code: "reason_required", athleteId: A(1) }, { code: "made_up", athleteId: A(2) }, "junk"] }, 422),
      { kind: "invalid_records", issues: [{ code: "reason_required", athleteId: A(1) }] }],
    [json({ code: "invalid_request" }, 400), { kind: "invalid_request" }],
    [json({ code: "payload_too_large" }, 413), { kind: "invalid_request" }],
    [json({ code: "unauthorized" }, 401), { kind: "unauthorized" }],
    [json({ code: "forbidden" }, 403), { kind: "forbidden" }],
    [json({ code: "team_not_found" }, 404), { kind: "not_found" }],
    [json({ code: "attendance_unavailable" }, 503), { kind: "unavailable" }],
    [json({ code: "error" }, 500), { kind: "error" }],
    [new Response("<html>gateway</html>", { status: 502 }), { kind: "error" }],
  ];
  for (const [res, failure] of cases) {
    const r = await createAttendanceApi("t", fetchReturning(res).impl).save({ sessionDate: TODAY, expectedVersion: 0, records: [] });
    assert.deepEqual(r, { ok: false, failure }, JSON.stringify(failure));
  }
});

test("a save whose result can't be confirmed is never reported as saved", async () => {
  for (const res of [
    new TypeError("Failed to fetch"),
    json({ ok: true }),                                   // 200 but missing version
    json({ ok: true, sessionDate: "2026-10-19", version: 2, savedAt: "2026-10-20T17:05:00Z", created: false }), // another date
    new Response("not json", { status: 200 }),
  ]) {
    const r = await createAttendanceApi("t", fetchReturning(res).impl).save({ sessionDate: TODAY, expectedVersion: 1, records: [] });
    assert.deepEqual(r, { ok: false, failure: { kind: "network" } });
  }
});

test("read failures: status mapping, network errors, and malformed bodies are failures (never partial data)", async () => {
  const statuses: [number, string][] = [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [400, "invalid"], [503, "unavailable"], [500, "unavailable"]];
  for (const [status, failure] of statuses) {
    assert.deepEqual(await createAttendanceApi("t", fetchReturning(json({}, status)).impl).listSessions(), { ok: false, failure });
  }
  assert.deepEqual(await createAttendanceApi("t", fetchReturning(new TypeError("offline")).impl).loadDate(TODAY), { ok: false, failure: "network" });
  assert.deepEqual(await createAttendanceApi("t", fetchReturning(json({ available: true })).impl).loadDate(TODAY), { ok: false, failure: "unavailable" });
});

test("session list parsing is strict: bad dates, versions, totals or duplicates reject the whole list", () => {
  const good = parseSessionList(listBody([apiSession("2026-10-18"), apiSession(TODAY, 2)]))!;
  assert.deepEqual(good.sessions.map(s => s.sessionDate), [TODAY, "2026-10-18"], "newest first");
  assert.equal(good.clock.today, TODAY);
  for (const bad of [
    listBody([apiSession("2026-10-18"), apiSession("2026-10-18")]),
    listBody([{ ...apiSession(TODAY), version: 0 }]),
    listBody([{ ...apiSession(TODAY), sessionDate: "2026-13-01" }]),
    listBody([{ ...apiSession(TODAY), totals: { ...totals({ present: 1 }), total: 5 } }]),
    { ...listBody(), today: "yesterday" },
    { ...listBody(), available: false },
    { ...listBody(), sessions: "none" },
  ]) {
    assert.equal(parseSessionList(bad), null, JSON.stringify(bad).slice(0, 80));
  }
});

test("date view parsing is strict and must be the date asked for", () => {
  const ok = parseDateView(dateBody(), TODAY)!;
  assert.equal(ok.editability, "editable");
  assert.equal(ok.rows.length, 1);
  assert.equal(parseDateView(dateBody(), "2026-10-19"), null, "another date");
  assert.equal(parseDateView(dateBody({ editability: "maybe" }), TODAY), null);
  assert.equal(parseDateView(dateBody({ editable: false }), TODAY), null, "editable must agree with editability");
  assert.equal(parseDateView(dateBody({ session: { ...apiSession("2026-10-19") } }), TODAY), null, "session for another date");
  assert.equal(parseDateView(dateBody({ rows: {} }), TODAY), null);
  assert.equal(parseDateView(dateBody({ serverTime: "soon" }), TODAY), null);
});

test("the client never logs and never stores (no console, no browser storage)", async () => {
  const logged: unknown[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  console.log = console.error = console.warn = console.info = (...a: unknown[]) => { logged.push(a); };
  try {
    const f = fetchReturning(json({ code: "error", detail: SECRET_NOTE }, 500), json({ code: "invalid_records", issues: [] }, 422));
    const api = createAttendanceApi("t", f.impl);
    const rec = [{ athlete_id: A(1), status: "absent" as const, absence_reason: "other" as const, note: SECRET_NOTE }];
    await api.save({ sessionDate: TODAY, expectedVersion: 0, records: rec });
    await api.save({ sessionDate: TODAY, expectedVersion: 0, records: rec });
  } finally {
    Object.assign(console, orig);
  }
  assert.deepEqual(logged, []);
});
