// Team Management Phase 5-3 — /api/team/[slug]/attendance (GET) and
// /api/team/[slug]/attendance/[date] (GET, PUT).
// Same technique as the Phase 3C completion tests: the real getTeamActor()
// resolves signed cookies against a fetch-mocked PostgREST layer that
// behaves like PostgREST where it matters (max-rows cap, limit/offset,
// order, exact counts) and mirrors the Phase 5-1 functions closely enough
// for routing; the database rules themselves are tested against real
// PostgreSQL in supabase/tests/phase_t5_attendance_drafts/.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest }       = await import("../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie }   = await import("../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeMemberCookie }  = await import("@/lib/memberAuth");
const { makeCoachCookie }   = await import("@/lib/teamAuth");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { addCalendarDays }   = await import("@/lib/teamAttendance");
const { buildAttendanceDraft, buildSavePayload, setAthleteAbsent, setAthleteNote } = await import("@/lib/teamAttendanceDraft");

type Row = Record<string, unknown>;

const SLUG  = "wolves";
const OTHER = "hawks";
const A = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const R = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TODAY = "2026-10-19";
const SECRET_NOTE = "Private medical detail 7731";

const COACHES = {
  head:      { id: "coach-head",  name: "Hana Head",  role: "head_coach",      campaign_slug: SLUG,  salt: "s1", account_id: "acct-head" },
  assistant: { id: "coach-asst",  name: "Ari Asst",   role: "assistant_coach", campaign_slug: SLUG,  salt: "s2", account_id: "acct-asst" },
  booster:   { id: "coach-boost", name: "Bo Booster", role: "booster",         campaign_slug: SLUG,  salt: "s3", account_id: null },
  hawkHead:  { id: "coach-hawk",  name: "Hal Hawk",   role: "head_coach",      campaign_slug: OTHER, salt: "s4", account_id: "acct-hawk" },
};
const MEMBERS = {
  athlete: { id: "m-ath",   name: "Ava Athlete", role: "athlete", campaign_slug: SLUG, athlete_id: A(1), account_id: null, salt: "t1" },
  parent:  { id: "m-par",   name: "Pat Parent",  role: "parent",  campaign_slug: SLUG, athlete_id: A(1), account_id: null, salt: "t2" },
  booster: { id: "m-boost", name: "Mo Booster",  role: "booster", campaign_slug: SLUG, athlete_id: null, account_id: null, salt: "t3" },
};

type Control = {
  maxRows: number;
  failPaths: string[];
  missingSchema: boolean;
  today: string;
  timeZone: string;
  tamper?: (resource: string, page: Row[], total: number, offset: number) => { page: Row[]; total: number | null } | void;
  onSummaries?: (call: number) => void;
  saveError?: { status: number; body: unknown };
};

function makeWorld() {
  const db: Record<string, Row[]> = {
    team_coaches: Object.values(COACHES).map(p => ({ ...p })),
    team_members: Object.values(MEMBERS).map(m => ({ ...m })),
    team_member_athletes: [],
    elf_accounts: [
      { id: "acct-asst", name: "Ari Asst", email: "ari@elf.test", salt: "sa2", profile_photo_url: null },
      { id: "acct-admin", name: "Ellie Admin", email: "admin@elf.test", salt: "sa", profile_photo_url: null },
    ],
    platform_admins: [{ id: "pa-1", account_id: "acct-admin", role: "platform_admin" }],
    // added_on: the athlete's local add date (stands in for created_at).
    athletes: [
      { id: A(1), campaign_slug: SLUG,  name: "Ava Athlete", class_year: "Senior",   added_on: "2026-01-01" },
      { id: A(2), campaign_slug: SLUG,  name: "Ben Brown",   class_year: "Junior",   added_on: "2026-01-01" },
      { id: A(3), campaign_slug: SLUG,  name: "Cy Clark",    class_year: null,       added_on: null },
      { id: A(4), campaign_slug: OTHER, name: "Hawk Kid",    class_year: "Senior",   added_on: "2026-01-01" },
    ],
  };
  // Saved sessions and records, keyed by `${slug}|${date}`.
  const sessions = new Map<string, Row>();
  const records = new Map<string, Row[]>();
  const audit: Row[] = [];
  const saves: Row[] = [];
  const control: Control = { maxRows: 1000, failPaths: [], missingSchema: false, today: TODAY, timeZone: "America/Phoenix" };
  const requests: string[] = [];
  let summaryCalls = 0;

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });
  const raise = (code: string) => json({ code: "P0001", details: null, hint: null, message: code }, 400);
  const editableDate = (date: string, today: string) => date <= today && date >= addCalendarDays(today, -14);

  function summaries(slug: string, from: string, to: string): Row[] {
    const out: Row[] = [];
    for (const s of sessions.values()) {
      if (s.campaign_slug !== slug || (s.session_date as string) < from || (s.session_date as string) > to) continue;
      const recs = records.get(`${slug}|${s.session_date}`) ?? [];
      const onTeam = (r: Row) => r.athlete_id !== null && db.athletes.some(a => a.id === r.athlete_id && a.campaign_slug === slug);
      const cur = recs.filter(onTeam);
      out.push({
        session_id: s.id, session_date: s.session_date, status: s.status, version: s.version, time_zone: s.time_zone,
        editable: s.status === "draft" && editableDate(s.session_date as string, control.today),
        created_at: "2026-10-19T15:00:00Z", updated_at: "2026-10-19T16:00:00Z",
        created_by_name: s.created_by_name ?? "Hana Head", updated_by_name: s.updated_by_name ?? "Hana Head",
        recorded_count: recs.length,
        present_count: cur.filter(r => r.status === "present").length,
        absent_count: cur.filter(r => r.status === "absent").length,
        excused_count: cur.filter(r => r.absence_reason === "excused").length,
        unexcused_count: cur.filter(r => r.absence_reason === "unexcused").length,
        other_count: cur.filter(r => r.absence_reason === "other").length,
        removed_count: recs.length - cur.length,
      });
    }
    return out;
  }

  function roster(slug: string, date: string): Row[] {
    const recs = records.get(`${slug}|${date}`) ?? [];
    const out: Row[] = [];
    for (const a of db.athletes.filter(x => x.campaign_slug === slug)) {
      const r = recs.find(x => x.athlete_id === a.id);
      const after = a.added_on !== null && (a.added_on as string) > date;
      out.push({
        record_id: r?.id ?? null, athlete_id: a.id, athlete_name: a.name, class_year: a.class_year, on_roster: true,
        added_after_session_date: after, has_record: !!r, requires_decision: !r && after,
        status: r?.status ?? null, absence_reason: r?.absence_reason ?? null, note: r?.note ?? null,
        record_updated_at: r ? "2026-10-19T16:00:00Z" : null, record_updated_by_name: r ? "Hana Head" : null,
      });
    }
    for (const r of recs) {
      if (r.athlete_id !== null && db.athletes.some(a => a.id === r.athlete_id && a.campaign_slug === slug)) continue;
      out.push({
        record_id: r.id, athlete_id: r.athlete_id, athlete_name: r.athlete_name_snapshot, class_year: r.class_year_snapshot,
        on_roster: false, added_after_session_date: false, has_record: true, requires_decision: false,
        status: r.status, absence_reason: r.absence_reason, note: r.note,
        record_updated_at: "2026-10-19T16:00:00Z", record_updated_by_name: "Hana Head",
      });
    }
    return out;
  }

  let recordSeq = 100;
  function save(body: Row): Response {
    saves.push(body);
    if (control.saveError) return json(control.saveError.body, control.saveError.status);
    const slug = body.p_campaign_slug as string, date = body.p_session_date as string, v = body.p_expected_version as number;
    const key = `${slug}|${date}`;
    const existing = sessions.get(key);
    if (existing && existing.status !== "draft") return raise("attendance_session_not_draft");
    if (date > control.today) return raise("attendance_date_in_future");
    if (!editableDate(date, control.today)) return raise("attendance_date_not_editable");
    if (v === 0 && existing) return raise("attendance_version_conflict");
    if (v > 0 && !existing) return raise("attendance_session_not_found");
    if (existing && existing.version !== v) return raise("attendance_version_conflict");
    const recs = body.p_records as Row[];
    const team = db.athletes.filter(a => a.campaign_slug === slug);
    for (const r of recs) if (!db.athletes.some(a => a.id === r.athlete_id)) return raise("attendance_athlete_removed");
    for (const a of team) {
      const required = (a.added_on === null || (a.added_on as string) <= date) || (records.get(key) ?? []).some(x => x.athlete_id === a.id);
      if (required && !recs.some(r => r.athlete_id === a.id)) return raise("attendance_roster_incomplete");
    }
    const session = existing ?? { id: `sess-${date}`, campaign_slug: slug, session_date: date, status: "draft", version: 0, time_zone: control.timeZone };
    session.version = (session.version as number) + 1;
    sessions.set(key, session);
    const kept = (records.get(key) ?? []).filter(x => !recs.some(r => r.athlete_id === x.athlete_id));
    records.set(key, [...kept, ...recs.map(r => ({ id: R(++recordSeq), ...r }))]);
    const c = (f: (r: Row) => boolean) => recs.filter(f).length;
    return json({
      session_id: session.id, session_date: date, version: session.version, saved_at: "2026-10-19T17:00:00Z", created: !existing,
      counts: { total: recs.length, present: c(r => r.status === "present"), absent: c(r => r.status === "absent"),
        excused: c(r => r.absence_reason === "excused"), unexcused: c(r => r.absence_reason === "unexcused"), other: c(r => r.absence_reason === "other") },
    });
  }

  function filterRows(rows: Row[], params: URLSearchParams): Row[] {
    let out = rows;
    for (const [k, v] of params.entries()) {
      if (["select", "limit", "offset", "order"].includes(k) || k.startsWith("p_")) continue;
      if (v.startsWith("eq.")) out = out.filter(r => String(r[k]) === v.slice(3));
      else if (v.startsWith("in.(")) out = out.filter(r => v.slice(4, -1).split(",").includes(String(r[k])));
    }
    return out;
  }
  function orderRows(rows: Row[], order: string | null): Row[] {
    if (!order) return rows;
    const keys = order.split(",").map(o => { const [col, dir = "asc", nulls] = o.split("."); return { col, desc: dir === "desc", nullsFirst: nulls === "nullsfirst" }; });
    return [...rows].sort((a, b) => {
      for (const { col, desc, nullsFirst } of keys) {
        const x = a[col] as string | null, y = b[col] as string | null;
        if (x === y) continue;
        if (x === null) return nullsFirst ? -1 : 1;
        if (y === null) return nullsFirst ? 1 : -1;
        return (x < y ? -1 : 1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const method = init?.method ?? "GET";
    requests.push(`${method} ${path}`);
    const [resource, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    if (control.failPaths.some(p => path.includes(p))) return json({ code: "XX000", message: `boom ${SECRET_NOTE}` }, 500);
    if (control.missingSchema && resource.startsWith("rpc/team_attendance")) {
      return json({ code: "PGRST202", message: "Could not find the function" }, 404);
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "null"));
      if (resource === "audit_logs") { audit.push(body); return json(null, 201); }
      if (resource === "rpc/team_attendance_save_draft") return save(body);
      return json({ code: "XX000", message: "unexpected write" }, 405);
    }
    if (resource === "rpc/team_attendance_today") return json(control.today);
    if (resource === "rpc/team_attendance_time_zone") return json(control.timeZone);
    if (resource === "rpc/team_attendance_date_editable") return json(editableDate(params.get("p_session_date")!, params.get("p_today")!));

    let all: Row[];
    if (resource === "rpc/team_attendance_session_summaries") {
      control.onSummaries?.(++summaryCalls);
      all = summaries(params.get("p_campaign_slug")!, params.get("p_from")!, params.get("p_to")!);
    } else if (resource === "rpc/team_attendance_session_roster") {
      all = roster(params.get("p_campaign_slug")!, params.get("p_session_date")!);
    } else {
      const table = db[resource];
      if (!table) return json([]);
      all = filterRows(table, params);
    }
    all = orderRows(all, params.get("order"));
    const offset = Number(params.get("offset") ?? 0);
    const limit = Math.min(Number(params.get("limit") ?? Infinity), control.maxRows);
    let page = all.slice(offset, offset + limit);
    let total: number | null = all.length;
    const t = control.tamper?.(resource, page, all.length, offset);
    if (t) ({ page, total } = t);
    const counted = ((init?.headers ?? {}) as Record<string, string>).Prefer === "count=exact";
    const headers: Record<string, string> = {};
    if (total !== null) headers["content-range"] = `${page.length ? `${offset}-${offset + page.length - 1}` : "*"}/${counted ? total : "*"}`;
    return json(page, 200, headers);
  }

  return { db, sessions, records, audit, saves, control, requests, fetchImpl };
}

type World = ReturnType<typeof makeWorld>;

async function withWorld<T>(run: (w: World) => Promise<T>): Promise<T> {
  const w = makeWorld();
  const realFetch = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  try {
    return await run(w);
  } finally {
    globalThis.fetch = realFetch;
    clearCookies();
  }
}

function clearCookies() {
  for (const c of ["elf_session", "team_member", "team_coach"]) __setTestCookie(c, undefined);
}
const as = {
  coach: (p: { id: string; salt: string }) => { clearCookies(); __setTestCookie("team_coach", makeCoachCookie(p.id, p.salt)); },
  member: (m: { id: string; salt: string }) => { clearCookies(); __setTestCookie("team_member", makeMemberCookie(m.id, m.salt)); },
  account: (id: string, salt: string) => { clearCookies(); __setTestCookie("elf_session", makeAccountCookie(id, salt)); },
  forged: () => { clearCookies(); __setTestCookie("team_coach", makeCoachCookie(COACHES.head.id, "wrong-salt")); },
  nobody: () => clearCookies(),
};
const ROLES: Record<string, () => void> = {
  head: () => as.coach(COACHES.head),
  assistant: () => as.account("acct-asst", "sa2"),
  admin: () => as.account("acct-admin", "sa"),
  boosterCoach: () => as.coach(COACHES.booster),
  boosterMember: () => as.member(MEMBERS.booster),
  parent: () => as.member(MEMBERS.parent),
  athlete: () => as.member(MEMBERS.athlete),
  otherTeamHead: () => as.coach(COACHES.hawkHead),
  forged: () => as.forged(),
  nobody: () => as.nobody(),
};

const base = `http://test.local/api/team/${SLUG}/attendance`;
async function list(query = "", slug = SLUG) {
  const { GET } = await import("./route.ts");
  return GET(new NextRequest(`${base}${query}`, { method: "GET" }) as never, { params: Promise.resolve({ slug }) });
}
async function load(date: string, slug = SLUG) {
  const { GET } = await import("./[date]/route.ts");
  return GET(new NextRequest(`${base}/${date}`, { method: "GET" }) as never, { params: Promise.resolve({ slug, date }) });
}
async function put(date: string, body: unknown, opts: { type?: string; raw?: string; headers?: Record<string, string>; query?: string; slug?: string } = {}) {
  const { PUT } = await import("./[date]/route.ts");
  const req = new NextRequest(`${base}/${date}${opts.query ?? ""}`, {
    method: "PUT",
    headers: { "content-type": opts.type ?? "application/json", "user-agent": "TestAgent", "x-forwarded-for": "203.0.113.7", ...opts.headers },
    body: opts.raw ?? JSON.stringify(body),
  });
  return PUT(req as never, { params: Promise.resolve({ slug: opts.slug ?? SLUG, date }) });
}
const body = async (res: Response) => JSON.parse(await res.text());
const everyone = (status = "present") => [A(1), A(2), A(3)].map(id => ({ athlete_id: id, status }));
const attendanceRequests = (w: World) => w.requests.filter(r => r.includes("team_attendance"));

// ── Who may use the API ───────────────────────────────────────────────────

test("Head Coach, Assistant Coach (via ELF account) and platform admin: list, load and save", async () => {
  for (const role of ["head", "assistant", "admin"]) {
    await withWorld(async w => {
      ROLES[role]();
      assert.equal((await list()).status, 200, `${role} list`);
      assert.equal((await load(TODAY)).status, 200, `${role} load`);
      const res = await put(TODAY, { expectedVersion: 0, records: everyone() });
      assert.equal(res.status, 200, `${role} save`);
      assert.equal(w.saves.length, 1);
    });
  }
});

test("boosters, parents, athletes, other teams, forged and missing sessions: refused before any attendance read", async () => {
  const expected: Record<string, number> = {
    boosterCoach: 403, boosterMember: 403, parent: 403, athlete: 403, otherTeamHead: 401, forged: 401, nobody: 401,
  };
  for (const [role, status] of Object.entries(expected)) {
    await withWorld(async w => {
      ROLES[role]();
      for (const res of [await list(), await load(TODAY), await put(TODAY, { expectedVersion: 0, records: everyone() })]) {
        assert.equal(res.status, status, role);
        const b = await body(res);
        assert.equal(b.code, status === 401 ? "unauthorized" : "forbidden", role);
        assert.equal(b.rows, undefined);
      }
      assert.deepEqual(attendanceRequests(w), [], `${role} touched attendance data`);
    });
  }
});

test("cross-team: a Head Coach of another team gets nothing from this team, and saves nothing", async () => {
  await withWorld(async w => {
    as.coach(COACHES.hawkHead);
    assert.equal((await put(TODAY, { expectedVersion: 0, records: everyone() })).status, 401);
    assert.equal((await load(TODAY)).status, 401);
    assert.equal(w.saves.length, 0);
    // ...and on their own team, our athletes are not theirs to read.
    const own = await body(await load(TODAY, OTHER));
    assert.deepEqual(own.rows.map((r: Row) => r.athlete_id), [A(4)]);
  });
});

test("forged identities in the body are refused; the query string is ignored; the actor always comes from the session", async () => {
  await withWorld(async w => {
    as.coach(COACHES.booster);
    const booster = await put(TODAY, { expectedVersion: 0, records: everyone(), coach_id: COACHES.head.id });
    assert.equal(booster.status, 403);

    as.coach(COACHES.head);
    for (const extra of [{ coach_id: "coach-asst" }, { platform_admin_id: "pa-1" }, { p_actor: { coach_id: "x" } }, { actor: "head_coach" }, { account_id: "acct-admin" }, { role: "head_coach" }]) {
      const res = await put(TODAY, { expectedVersion: 0, records: everyone(), ...extra });
      assert.equal(res.status, 400, JSON.stringify(extra));
      assert.equal((await body(res)).code, "invalid_request");
    }
    const inRecord = await put(TODAY, { expectedVersion: 0, records: [{ ...everyone()[0], coach_id: "coach-asst" }, ...everyone().slice(1)] });
    assert.equal(inRecord.status, 400);
    assert.equal(w.saves.length, 0);

    const ok = await put(TODAY, { expectedVersion: 0, records: everyone() }, { query: "?coach_id=coach-asst&platform_admin_id=pa-1" });
    assert.equal(ok.status, 200);
    assert.deepEqual(w.saves[0].p_actor, { coach_id: COACHES.head.id });
  });
  await withWorld(async w => {
    as.account("acct-admin", "sa");
    assert.equal((await put(TODAY, { expectedVersion: 0, records: everyone() })).status, 200);
    assert.deepEqual(w.saves[0].p_actor, { platform_admin_id: "pa-1" });
  });
  await withWorld(async w => {
    as.account("acct-asst", "sa2");
    assert.equal((await put(TODAY, { expectedVersion: 0, records: everyone() })).status, 200);
    assert.deepEqual(w.saves[0].p_actor, { coach_id: COACHES.assistant.id });
  });
});

// ── Clock and session list ────────────────────────────────────────────────

test("list: the database's today and time zone, server time, the editable window and sessions with totals", async () => {
  await withWorld(async () => {
    as.coach(COACHES.head);
    await put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "absent", absence_reason: "excused", note: SECRET_NOTE }, ...everyone().slice(1)] });
    const before = Date.now();
    const b = await body(await list());
    assert.equal(b.today, TODAY);
    assert.equal(b.timeZone, "America/Phoenix");
    assert.ok(Math.abs(Date.parse(b.serverTime) - before) < 5000);
    assert.equal(b.editableFrom, "2026-10-05");
    assert.equal(b.editableTo, TODAY);
    assert.deepEqual([b.from, b.to], ["2026-10-05", TODAY]);
    assert.equal(b.sessions.length, 1);
    const s = b.sessions[0];
    assert.deepEqual([s.sessionDate, s.status, s.version, s.editable, s.timeZone], [TODAY, "draft", 1, true, "America/Phoenix"]);
    assert.deepEqual([s.totals.total, s.totals.present, s.totals.absent, s.totals.excused, s.totals.removed, s.totals.presentPercent], [3, 2, 1, 1, 0, 66.7]);
    assert.ok(!JSON.stringify(b).includes(SECRET_NOTE), "the list never includes notes");
  });
});

test("today comes from the database (team zone), never from the server's or device's clock", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    w.control.today = "2031-03-08";
    const b = await body(await list());
    assert.equal(b.today, "2031-03-08");
    assert.equal(b.editableFrom, "2031-02-22");
    assert.equal((await body(await load("2031-03-08"))).editability, "editable");
    assert.equal((await body(await load("2031-03-09"))).editability, "date_in_future");
  });
});

test("list: ranges are validated (dates, order, at most 366 days)", async () => {
  await withWorld(async () => {
    as.coach(COACHES.head);
    assert.equal((await list("?from=2026-01-01&to=2026-12-31")).status, 200);
    assert.equal((await list("?from=2025-10-19&to=2026-10-20")).status, 200);   // 366 days
    for (const [q, code] of [
      ["?from=2025-10-18&to=2026-10-20", "invalid_range"], ["?from=2026-10-19&to=2026-10-18", "invalid_range"],
      ["?from=2026-02-30", "invalid_date"], ["?to=yesterday", "invalid_date"], ["?from=2026-10-19T00:00", "invalid_date"],
    ]) {
      const res = await list(q);
      assert.equal(res.status, 400, q);
      assert.equal((await body(res)).code, code, q);
    }
    const onlyTo = await body(await list("?to=2026-09-30"));
    assert.deepEqual([onlyTo.from, onlyTo.to], ["2026-09-16", "2026-09-30"]);
  });
});

// ── Loading one date ──────────────────────────────────────────────────────

test("a date with no session: the full roster, nothing saved, editability decided by the database", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    w.db.athletes.push({ id: A(5), campaign_slug: SLUG, name: "Fay New", class_year: "Freshman", added_on: TODAY });
    const b = await body(await load("2026-10-16"));
    assert.equal(b.session, null);
    assert.equal(b.editable, true);
    assert.equal(b.editability, "editable");
    assert.equal(b.sessionDate, "2026-10-16");
    assert.deepEqual(b.rows.map((r: Row) => r.athlete_id), [A(1), A(2), A(3), A(5)]);
    assert.ok(b.rows.every((r: Row) => r.on_roster && !r.has_record));
    assert.deepEqual(b.rows.filter((r: Row) => r.requires_decision).map((r: Row) => r.athlete_id), [A(5)]);
    assert.ok(w.requests.some(r => r.includes("rpc/team_attendance_date_editable")));
    // The rows feed the Phase 5-2 draft directly.
    const draft = buildAttendanceDraft({ sessionDate: b.sessionDate, session: null, rows: b.rows, now: new Date(b.serverTime) });
    assert.equal(draft.entries.filter(e => e.kind === "late_pending").length, 1);
  });
});

test("an existing session: version, totals, saved marks, and removed athletes' kept records", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    await put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(2), status: "absent", absence_reason: "other", note: " Ill " }, { athlete_id: A(1), status: "present" }, { athlete_id: A(3), status: "present" }] });
    w.db.athletes = w.db.athletes.filter(a => a.id !== A(1));                        // A1 removed from the roster
    w.records.get(`${SLUG}|${TODAY}`)!.forEach(r => { if (r.athlete_id === A(1)) Object.assign(r, { athlete_id: null, athlete_name_snapshot: "Ava Athlete", class_year_snapshot: "Senior" }); });
    const b = await body(await load(TODAY));
    assert.equal(b.session.version, 1);
    assert.equal(b.session.totals.removed, 1);
    assert.equal(b.session.totals.total, 2);
    const removed = b.rows.filter((r: Row) => !r.on_roster);
    assert.deepEqual(removed.map((r: Row) => [r.athlete_id, r.athlete_name, r.class_year, r.status]), [[null, "Ava Athlete", "Senior", "present"]]);
    assert.equal(b.rows.find((r: Row) => r.athlete_id === A(2)).note, "Ill");
    const draft = buildAttendanceDraft({ sessionDate: TODAY, session: { version: b.session.version, status: b.session.status, time_zone: b.session.timeZone }, rows: b.rows, now: new Date(b.serverTime) });
    assert.equal(draft.entries.filter(e => e.kind === "removed").length, 1);
  });
});

test("date boundaries: today and 14 days back editable; 15 back read-only; tomorrow future; finalized not draft", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    const e = async (d: string) => (await body(await load(d))).editability;
    assert.equal(await e(TODAY), "editable");
    assert.equal(await e("2026-10-05"), "editable");
    assert.equal(await e("2026-10-04"), "date_not_editable");
    assert.equal(await e("2026-10-20"), "date_in_future");
    w.sessions.set(`${SLUG}|2026-10-01`, { id: "s-old", campaign_slug: SLUG, session_date: "2026-10-01", status: "draft", version: 2, time_zone: "America/Phoenix" });
    w.records.set(`${SLUG}|2026-10-01`, everyone().map((r, i) => ({ id: R(i + 1), ...r })));
    const old = await body(await load("2026-10-01"));
    assert.equal(old.editability, "date_not_editable");
    assert.equal(old.session.version, 2);
    assert.equal(old.rows.length, 3, "older sessions stay readable");
    w.sessions.set(`${SLUG}|${TODAY}`, { id: "s-fin", campaign_slug: SLUG, session_date: TODAY, status: "finalized", version: 5, time_zone: "America/Phoenix" });
    w.records.set(`${SLUG}|${TODAY}`, everyone().map((r, i) => ({ id: R(i + 10), ...r })));
    assert.equal(await e(TODAY), "session_not_draft");
  });
});

test("invalid dates in the URL are refused before any database read", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    for (const d of ["2026-02-30", "today", "2026-10-19x", "20261019", "2026-10-19%27"]) {
      assert.equal((await load(d)).status, 400, d);
      assert.equal((await put(d, { expectedVersion: 0, records: everyone() })).status, 400, d);
    }
    assert.deepEqual(attendanceRequests(w), []);
  });
});

// ── Large rosters and completeness ────────────────────────────────────────

function bigTeam(w: World, n: number) {
  w.db.athletes = w.db.athletes.filter(a => a.campaign_slug !== SLUG);
  for (let i = 1; i <= n; i++) w.db.athletes.push({ id: A(1000 + i), campaign_slug: SLUG, name: `Athlete ${String(i).padStart(5, "0")}`, class_year: "Junior", added_on: "2026-01-01" });
}

test("rosters over 1,000 athletes are read completely, page by page (even under a lower server cap)", async () => {
  for (const cap of [1000, 400]) {
    await withWorld(async w => {
      as.coach(COACHES.head);
      bigTeam(w, 2500);
      w.control.maxRows = cap;
      const b = await body(await load(TODAY));
      assert.equal(b.rows.length, 2500, `cap ${cap}`);
      assert.equal(new Set(b.rows.map((r: Row) => r.athlete_id)).size, 2500);
      assert.equal(w.requests.filter(r => r.includes("session_roster")).length, Math.ceil(2500 / cap));
      assert.ok(w.requests.filter(r => r.includes("session_roster")).every(r => r.includes("order=athlete_name.asc,athlete_id.asc.nullsfirst,record_id.asc.nullsfirst")));
      // ...and a full-team save goes through.
      const ids = b.rows.map((r: Row) => ({ athlete_id: r.athlete_id, status: "present" }));
      assert.equal((await put(TODAY, { expectedVersion: 0, records: ids })).status, 200);
      assert.equal((w.saves[0].p_records as Row[]).length, 2500);
    });
  }
});

test("pagination failures never return a partial roster: a safe 503 instead", async () => {
  const cases: Record<string, (w: World) => void> = {
    "no exact count": w => { w.control.tamper = (res, page) => (res.includes("roster") ? { page, total: null } : undefined); },
    "count changes between pages": w => { w.control.tamper = (res, page, total, offset) => (res.includes("roster") && offset > 0 ? { page, total: total + 1 } : undefined); },
    "truncated (empty page early)": w => { w.control.tamper = (res, page, total, offset) => (res.includes("roster") && offset > 0 ? { page: [], total } : undefined); },
    "duplicate rows": w => { w.control.tamper = (res, page, total, offset) => (res.includes("roster") && offset > 0 ? { page: [page[0], ...page.slice(0, -1)].map((r, i) => (i === 0 ? { ...r, athlete_id: A(1001) } : r)), total } : undefined); },
    "a page fails": w => { w.control.failPaths = ["session_roster?p_campaign_slug=wolves&p_session_date=2026-10-19&order=athlete_name.asc,athlete_id.asc.nullsfirst,record_id.asc.nullsfirst&limit=1000&offset=1000"]; },
    "malformed row": w => { w.control.tamper = (res, page, total) => (res.includes("roster") ? { page: page.map((r, i) => (i === 3 ? { ...r, has_record: "yes" } : r)), total } : undefined); },
    "records don't match the session": w => {
      w.sessions.set(`${SLUG}|${TODAY}`, { id: "s1", campaign_slug: SLUG, session_date: TODAY, status: "draft", version: 1, time_zone: "America/Phoenix" });
      w.records.set(`${SLUG}|${TODAY}`, [{ id: R(1), athlete_id: A(1001), status: "present", absence_reason: null, note: null }]);
      w.control.tamper = (res, page, total) => (res.includes("roster") ? { page: page.map(r => ({ ...r, has_record: false, record_id: null, status: null, absence_reason: null, note: null })), total } : undefined);
    },
    "missing tables": w => { w.control.missingSchema = true; },
  };
  for (const [name, setup] of Object.entries(cases)) {
    await withWorld(async w => {
      as.coach(COACHES.head);
      bigTeam(w, 1500);
      setup(w);
      const errors: string[] = [];
      const realError = console.error;
      console.error = (...a: unknown[]) => { errors.push(a.join(" ")); };
      let res: Response;
      try { res = await load(TODAY); } finally { console.error = realError; }
      assert.equal(res.status, 503, name);
      const b = await body(res);
      assert.equal(b.code, "attendance_unavailable", name);
      assert.equal(b.rows, undefined, name);
      assert.ok(!errors.join("\n").includes(SECRET_NOTE), `${name}: error body logged`);
    });
  }
});

test("a save landing between the roster reads is retried; constant changes give a safe 503", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    await put(TODAY, { expectedVersion: 0, records: everyone() });
    let calls = 0;
    w.control.onSummaries = () => { if (++calls === 2) w.sessions.get(`${SLUG}|${TODAY}`)!.version = 2; };
    const b = await body(await load(TODAY));
    assert.equal(b.session.version, 2);
    assert.equal(w.requests.filter(r => r.includes("session_roster")).length, 2);
  });
  await withWorld(async w => {
    as.coach(COACHES.head);
    await put(TODAY, { expectedVersion: 0, records: everyone() });
    w.control.onSummaries = () => { (w.sessions.get(`${SLUG}|${TODAY}`)!.version as number)++; };
    const realError = console.error;
    console.error = () => {};
    try {
      const res = await load(TODAY);
      assert.equal(res.status, 503);
    } finally { console.error = realError; }
  });
});

// ── Saving ────────────────────────────────────────────────────────────────

test("create (version 0) then update (version 1): normalized, sorted records; audited with counts only", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    const created = await put(TODAY, { expectedVersion: 0, records: [
      { athlete_id: A(3), status: "present" },
      { athlete_id: A(1).toUpperCase(), status: "absent", absence_reason: "excused", note: `  ${SECRET_NOTE} \n` },
      { athlete_id: A(2), status: "present", absence_reason: null, note: null },
    ] });
    assert.equal(created.status, 200);
    const c = await body(created);
    assert.deepEqual([c.ok, c.version, c.created, c.sessionDate, c.counts.absent], [true, 1, true, TODAY, 1]);
    assert.deepEqual(w.saves[0].p_records, [
      { athlete_id: A(1), status: "absent", absence_reason: "excused", note: SECRET_NOTE },
      { athlete_id: A(2), status: "present", absence_reason: null, note: null },
      { athlete_id: A(3), status: "present", absence_reason: null, note: null },
    ]);
    assert.deepEqual(Object.keys(w.saves[0]).sort(), ["p_actor", "p_campaign_slug", "p_expected_version", "p_records", "p_session_date"]);
    assert.equal(w.audit.length, 1);
    assert.equal(w.audit[0].action, "attendance_session.created");

    const updated = await body(await put(TODAY, { expectedVersion: 1, records: everyone() }));
    assert.deepEqual([updated.version, updated.created], [2, false]);
    assert.equal(w.audit[1].action, "attendance_session.saved");

    const auditText = JSON.stringify(w.audit);
    for (const secret of [SECRET_NOTE, "Ava Athlete", "Ben Brown", A(1), "excused\":\"", "absence_reason"]) {
      assert.ok(!auditText.includes(secret), `audit leaked ${secret}`);
    }
    assert.equal(w.audit[0].entity_type, "team_attendance_session");
    assert.equal(w.audit[0].campaign_slug, SLUG);
    assert.equal(w.audit[0].actor_type, "coach");
    assert.deepEqual((w.audit[0].new_value as Row).counts, { total: 3, present: 2, absent: 1, excused: 1, unexcused: 0, other: 0 });
  });
});

test("a payload built by the Phase 5-2 draft model is accepted end to end", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    const loaded = await body(await load(TODAY));
    let draft = buildAttendanceDraft({ sessionDate: TODAY, session: null, rows: loaded.rows, now: new Date(loaded.serverTime) });
    draft = setAthleteNote(setAthleteAbsent(draft, A(2), "unexcused"), A(2), "Bus");
    const p = buildSavePayload(draft);
    assert.ok(p.ok);
    const res = await put(TODAY, { expectedVersion: p.payload.expectedVersion, records: p.payload.records });
    assert.equal(res.status, 200);
    assert.deepEqual(w.saves[0].p_records, p.payload.records);
  });
});

test("a stale version is a 409 version_conflict the editor can reload from; nothing overwritten, nothing audited", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    await put(TODAY, { expectedVersion: 0, records: everyone() });
    await put(TODAY, { expectedVersion: 1, records: everyone("present") });
    const stale = await put(TODAY, { expectedVersion: 1, records: [{ athlete_id: A(1), status: "absent", absence_reason: "other" }, ...everyone().slice(1)] });
    assert.equal(stale.status, 409);
    const b = await body(stale);
    assert.deepEqual([b.code, b.reload], ["version_conflict", true]);
    assert.ok(!JSON.stringify(b).includes("attendance_version_conflict"), "no raw database code");
    assert.equal(w.sessions.get(`${SLUG}|${TODAY}`)!.version, 2);
    assert.equal(w.audit.length, 2);
    const dup = await body(await put("2026-10-18", { expectedVersion: 0, records: everyone() }));
    assert.equal(dup.ok, true);
    const again = await put("2026-10-18", { expectedVersion: 0, records: everyone() });
    assert.equal((await body(again)).code, "version_conflict", "a second 'create' for the same date is a conflict, never a duplicate");
  });
});

test("database refusals map to stable codes and statuses; raw messages are never returned or logged", async () => {
  const cases: [string, number, string][] = [
    ["attendance_roster_incomplete", 409, "roster_changed"],
    ["attendance_athlete_removed", 409, "roster_changed"],
    ["attendance_late_athlete_unconfirmed", 409, "roster_changed"],
    ["attendance_session_not_found", 409, "version_conflict"],
    ["attendance_session_not_draft", 409, "session_not_draft"],
    ["attendance_date_not_editable", 409, "date_not_editable"],
    ["attendance_date_in_future", 409, "date_in_future"],
    ["attendance_record_invalid", 422, "invalid_records"],
    ["attendance_athlete_cross_team", 422, "invalid_records"],
    ["attendance_athlete_duplicate", 422, "invalid_records"],
    ["attendance_team_not_found", 404, "team_not_found"],
    ["attendance_actor_not_authorized", 403, "forbidden"],
  ];
  for (const [dbCode, status, code] of cases) {
    await withWorld(async w => {
      as.coach(COACHES.head);
      w.control.saveError = { status: 400, body: { code: "P0001", message: dbCode, details: SECRET_NOTE } };
      const res = await put(TODAY, { expectedVersion: 0, records: everyone() });
      assert.equal(res.status, status, dbCode);
      const text = await res.text();
      assert.equal(JSON.parse(text).code, code, dbCode);
      assert.equal(JSON.parse(text).reload === true, code === "version_conflict" || code === "roster_changed", dbCode);
      assert.ok(!text.includes(dbCode) && !text.includes(SECRET_NOTE), dbCode);
      assert.equal(w.audit.length, 0);
    });
  }
  // An unexpected database error: generic 500, and the body (which can
  // quote row values) is neither returned nor logged.
  await withWorld(async w => {
    as.coach(COACHES.head);
    w.control.saveError = { status: 400, body: { code: "23514", message: `new row violates check constraint`, details: `Failing row contains (${SECRET_NOTE}, Ava Athlete)` } };
    const logged: string[] = [];
    const realError = console.error;
    console.error = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
    let res: Response;
    try { res = await put(TODAY, { expectedVersion: 0, records: everyone() }); } finally { console.error = realError; }
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.equal(JSON.parse(text).code, "error");
    for (const secret of [SECRET_NOTE, "Ava Athlete", "Failing row"]) {
      assert.ok(!text.includes(secret) && !logged.join("\n").includes(secret), secret);
    }
  });
  await withWorld(async w => {
    as.coach(COACHES.head);
    w.control.missingSchema = true;
    const res = await put(TODAY, { expectedVersion: 0, records: everyone() });
    assert.equal(res.status, 503);
    assert.equal((await body(res)).code, "attendance_unavailable");
  });
});

test("roster checks are the database's: a missing athlete or one removed meanwhile is roster_changed", async () => {
  await withWorld(async () => {
    as.coach(COACHES.head);
    const missing = await put(TODAY, { expectedVersion: 0, records: everyone().slice(0, 2) });
    assert.deepEqual([missing.status, (await body(missing)).code], [409, "roster_changed"]);
    const ghost = await put(TODAY, { expectedVersion: 0, records: [...everyone(), { athlete_id: A(99), status: "present" }] });
    assert.deepEqual([ghost.status, (await body(ghost)).code], [409, "roster_changed"]);
  });
});

test("late-added athletes: the confirmation is forwarded only when explicitly true", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    w.db.athletes.push({ id: A(5), campaign_slug: SLUG, name: "Fay New", class_year: null, added_on: TODAY });
    const res = await put("2026-10-16", { expectedVersion: 0, records: [...everyone(), { athlete_id: A(5), status: "present", confirm_added_after_date: true }] });
    assert.equal(res.status, 200);
    assert.deepEqual((w.saves[0].p_records as Row[]).find(r => r.athlete_id === A(5)), { athlete_id: A(5), status: "present", absence_reason: null, note: null, confirm_added_after_date: true });
    await put("2026-10-15", { expectedVersion: 0, records: [...everyone(), { athlete_id: A(5), status: "present", confirm_added_after_date: false }] });
    assert.ok(!("confirm_added_after_date" in (w.saves[1].p_records as Row[]).find(r => r.athlete_id === A(5))!));
    const notBool = await put("2026-10-14", { expectedVersion: 0, records: [...everyone(), { athlete_id: A(5), status: "present", confirm_added_after_date: "yes" }] });
    assert.equal(notBool.status, 422);
    assert.deepEqual((await body(notBool)).issues, [{ code: "invalid_roster", athleteId: A(5) }]);
    assert.equal(w.saves.length, 2);
  });
});

test("request validation: refused before reaching the database", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    const r1 = everyone();
    const checks: [string, Promise<Response>, number, string][] = [
      ["wrong content type", put(TODAY, { expectedVersion: 0, records: r1 }, { type: "text/plain" }), 415, "unsupported_media_type"],
      ["form post", put(TODAY, null, { type: "application/x-www-form-urlencoded", raw: "expectedVersion=0" }), 415, "unsupported_media_type"],
      ["declared too large", put(TODAY, { expectedVersion: 0, records: r1 }, { headers: { "content-length": "4000001" } }), 413, "payload_too_large"],
      ["actually too large", put(TODAY, null, { raw: JSON.stringify({ expectedVersion: 0, records: r1, pad: "x".repeat(4_000_001) }) }), 413, "payload_too_large"],
      ["not JSON", put(TODAY, null, { raw: "{expectedVersion:0" }), 400, "invalid_request"],
      ["JSON array", put(TODAY, [1, 2]), 400, "invalid_request"],
      ["no version", put(TODAY, { records: r1 }), 400, "invalid_request"],
      ["negative version", put(TODAY, { expectedVersion: -1, records: r1 }), 400, "invalid_request"],
      ["fractional version", put(TODAY, { expectedVersion: 1.5, records: r1 }), 400, "invalid_request"],
      ["text version", put(TODAY, { expectedVersion: "1", records: r1 }), 400, "invalid_request"],
      ["records not a list", put(TODAY, { expectedVersion: 0, records: {} }), 400, "invalid_request"],
      ["no records", put(TODAY, { expectedVersion: 0, records: [] }), 422, "invalid_records"],
      ["bad athlete id", put(TODAY, { expectedVersion: 0, records: [{ athlete_id: "abc", status: "present" }] }), 400, "invalid_request"],
      ["unknown status", put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "late" }] }), 422, "invalid_records"],
      ["absent, no reason", put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "absent" }] }), 422, "invalid_records"],
      ["present with a reason", put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "present", absence_reason: "excused" }] }), 422, "invalid_records"],
      ["present with a note", put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "present", note: "x" }] }), 422, "invalid_records"],
      ["unknown reason", put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "absent", absence_reason: "sick" }] }), 422, "invalid_records"],
      ["501-character note", put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "absent", absence_reason: "other", note: "n".repeat(501) }] }), 422, "invalid_records"],
      ["duplicate athlete", put(TODAY, { expectedVersion: 0, records: [...r1, r1[0]] }), 422, "invalid_records"],
      ["5,001 records", put(TODAY, { expectedVersion: 0, records: Array.from({ length: 5001 }, (_, i) => ({ athlete_id: A(i + 1), status: "present" })) }), 422, "invalid_records"],
    ];
    for (const [name, pending, status, code] of checks) {
      const res = await pending;
      assert.equal(res.status, status, name);
      const b = await body(res);
      assert.equal(b.code, code, name);
    }
    assert.equal(w.saves.length, 0);
  });
});

test("record issues name the code and athlete id only — never the note", async () => {
  await withWorld(async () => {
    as.coach(COACHES.head);
    const res = await put(TODAY, { expectedVersion: 0, records: [
      { athlete_id: A(1), status: "absent", absence_reason: "other", note: `${SECRET_NOTE} ${"n".repeat(500)}` },
      { athlete_id: A(2), status: "absent" },
    ] });
    const text = await res.text();
    assert.deepEqual(JSON.parse(text).issues, [{ code: "note_too_long", athleteId: A(1) }, { code: "reason_required", athleteId: A(2) }]);
    assert.ok(!text.includes(SECRET_NOTE));
  });
});

test("a 500-character note (outside the BMP) is accepted; responses are never cached", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    const note = String.fromCodePoint(0x1f3c3).repeat(500);
    const res = await put(TODAY, { expectedVersion: 0, records: [{ athlete_id: A(1), status: "absent", absence_reason: "other", note }, ...everyone().slice(1)] });
    assert.equal(res.status, 200);
    assert.equal(((w.saves[0].p_records as Row[])[0].note as string).length, 1000);
    for (const r of [res, await list(), await load(TODAY), await put(TODAY, { expectedVersion: 9, records: everyone() })]) {
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    }
  });
});
