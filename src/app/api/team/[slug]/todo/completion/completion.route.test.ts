// Team Management Phase 3C — /api/team/[slug]/todo/completion (summary),
// .../completion/tasks/[taskId] and .../completion/athletes/[athleteId].
// Same technique as the Phase 3 acknowledgment tests: the real
// getTeamActor() resolves cookies against a fetch-mocked PostgREST layer.
// The mock also behaves like PostgREST where it matters here: a max-rows
// cap on every response, limit/offset, order, select projection and
// exact counts (Content-Range) — plus a mirror of team_task_ack_status()
// with the same rules as phase_t3_task_acknowledgments.sql.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest }       = await import("../../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie }   = await import("../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeMemberCookie }  = await import("@/lib/memberAuth");
const { makeCoachCookie }   = await import("@/lib/teamAuth");
const { makeAccountCookie } = await import("@/lib/accountAuth");

type Row = Record<string, unknown>;

const SLUG  = "wolves";
const OTHER = "hawks";
const uuid = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = (n: number) => uuid("a0", n); // athletes
const T = (n: number) => uuid("b0", n); // tasks

const COACHES = {
  head:      { id: "coach-head",  name: "Hana Head",  role: "head_coach",      campaign_slug: SLUG,  salt: "s1", account_id: "acct-head" },
  assistant: { id: "coach-asst",  name: "Ari Asst",   role: "assistant_coach", campaign_slug: SLUG,  salt: "s2", account_id: "acct-asst" },
  booster:   { id: "coach-boost", name: "Bo Booster", role: "booster",         campaign_slug: SLUG,  salt: "s3", account_id: null },
  hawkHead:  { id: "coach-hawk",  name: "Hal Hawk",   role: "head_coach",      campaign_slug: OTHER, salt: "s4", account_id: "acct-hawk" },
};
const MEMBERS = {
  ava:     { id: "m-ava",   name: "Ava Account",  role: "athlete", campaign_slug: SLUG,  athlete_id: A(1), account_id: "acct-ava", salt: "t1" },
  pat:     { id: "m-pat",   name: "Pat Parent",   role: "parent",  campaign_slug: SLUG,  athlete_id: A(1), account_id: "acct-pat", salt: "t2" },
  sam:     { id: "m-sam",   name: "Sam Parent",   role: "parent",  campaign_slug: SLUG,  athlete_id: A(1), account_id: "acct-sam", salt: "t3" },
  booster: { id: "m-boost", name: "Mo Booster",   role: "booster", campaign_slug: SLUG,  athlete_id: null, account_id: null,       salt: "t4" },
  hawkPar: { id: "m-hawk",  name: "Hope Hawk",    role: "parent",  campaign_slug: OTHER, athlete_id: A(4), account_id: null,       salt: "t5" },
};
// Typed acknowledgment names — must never appear in any response.
const TYPED = { pat: "Patricia Q. Typed", ava: "Ava Typed-Name", sam: "Samuel Typed" };

type Control = {
  maxRows: number;
  failPaths: string[];                 // any read whose path contains one of these fails (500)
  missingFunctions: boolean;           // team_task_ack_status not migrated
  tamper?: (resource: string, page: Row[], total: number, offset: number) => { page: Row[]; total: number | null } | void;
};

function makeWorld() {
  const db: Record<string, Row[]> = {
    team_coaches: Object.values(COACHES).map(p => ({ ...p })),
    team_members: Object.values(MEMBERS).map(m => ({ ...m })),
    team_member_athletes: [
      { id: "l1", team_member_id: "m-pat", athlete_id: A(2) }, // Pat: Ava (legacy) + Jake (second-child table)
    ],
    athletes: [
      { id: A(1), campaign_slug: SLUG,  name: "Ava Athlete", class_year: "Senior", jersey_number: 1 },
      { id: A(2), campaign_slug: SLUG,  name: "Jake Jr",     class_year: "Junior", jersey_number: 2 },
      { id: A(3), campaign_slug: SLUG,  name: "Lone Rider",  class_year: null,     jersey_number: null },
      { id: A(4), campaign_slug: OTHER, name: "Hawk Kid",    class_year: "Senior", jersey_number: 9 },
    ],
    team_tasks: [],
    team_task_acknowledgments: [],
    elf_accounts: [
      { id: "acct-admin", name: "Ellie Admin", email: "admin@elf.test", salt: "sa", profile_photo_url: null },
      { id: "acct-hawk-only", name: "Hawk Only", email: "h@elf.test", salt: "sh", profile_photo_url: null },
    ],
    platform_admins: [{ id: "pa-1", account_id: "acct-admin", role: "platform_admin" }],
  };
  const control: Control = { maxRows: 1000, failPaths: [], missingFunctions: false };
  const requests: string[] = [];

  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  // ── Mirror of the Phase 3 SQL functions ───────────────────────────────
  const member = (id: unknown) => db.team_members.find(m => m.id === id);
  let athleteIndex: Map<unknown, Row> | null = null; // speeds up the big-roster tests
  function linked(memberId: unknown, athleteId: unknown, req: string, slug: string): boolean {
    const m = member(memberId);
    const found = athleteIndex ? athleteIndex.get(athleteId) : db.athletes.find(x => x.id === athleteId);
    const a = found && found.campaign_slug === slug ? found : undefined;
    if (!m || !a || m.campaign_slug !== slug || m.role !== req) return false;
    return m.athlete_id === athleteId ||
      (req === "parent" && db.team_member_athletes.some(l => l.team_member_id === m.id && l.athlete_id === athleteId));
  }
  function counts(memberId: unknown, accountId: unknown, athleteId: unknown, req: string, slug: string): boolean {
    const m = member(memberId);
    return memberId != null && !!m && (m.account_id ?? null) === (accountId ?? null) && linked(memberId, athleteId, req, slug);
  }
  const reqsFor = (aud: unknown) => aud === "both" ? ["athlete", "parent"] : [String(aud)];
  const pgArray = (v: string | null) => v === null ? null : v.replace(/^\{|\}$/g, "").split(",").filter(Boolean);

  function ackStatus(slug: string, athleteIds: string[] | null, taskIds: string[] | null): Row[] {
    const tasks = db.team_tasks.filter(t => t.campaign_slug === slug && t.status === "active" && (!taskIds || taskIds.includes(t.id as string)));
    const athletes = db.athletes.filter(x => x.campaign_slug === slug && (!athleteIds || athleteIds.includes(x.id as string)));
    const out: Row[] = [];
    athleteIndex = new Map(db.athletes.map(x => [x.id, x]));
    for (const t of tasks) for (const ath of athletes) for (const req of reqsFor(t.audience)) {
      const acks = db.team_task_acknowledgments.filter(k => k.task_id === t.id && k.athlete_id === ath.id && k.requirement === req);
      const s = acks.find(k => k.task_revision === t.revision && counts(k.member_id, k.account_id, ath.id, req, slug));
      out.push({
        task_id: t.id, task_revision: t.revision, athlete_id: ath.id, requirement: req,
        satisfied: !!s, acknowledgment_id: s?.id ?? null, acknowledged_by_member_id: s?.member_id ?? null,
        acknowledged_full_name: s?.full_name ?? null, acknowledged_member_name: s?.member_name_snapshot ?? null,
        acknowledged_at: s?.acknowledged_at ?? null,
        has_eligible_member: db.team_members.some(m => m.campaign_slug === slug && m.role === req && linked(m.id, ath.id, req, slug)),
        earlier_revision_acknowledged: acks.some(k => (k.task_revision as number) < (t.revision as number) && counts(k.member_id, k.account_id, ath.id, req, slug)),
      });
    }
    athleteIndex = null;
    return out;
  }

  // ── PostgREST-ish reads ───────────────────────────────────────────────
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
    const keys = order.split(",").map(o => { const [col, dir = "asc"] = o.split("."); return { col, desc: dir === "desc" }; });
    return [...rows].sort((a, b) => {
      for (const { col, desc } of keys) {
        const x = a[col] as string | number, y = b[col] as string | number;
        if (x === y) continue;
        return (x < y ? -1 : 1) * (desc ? -1 : 1);
      }
      return 0;
    });
  }
  function project(rows: Row[], select: string | null): Row[] {
    if (!select || select === "*") return rows;
    const cols = select.split(",");
    return rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    requests.push(path);
    const [resource, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    if (control.failPaths.some(p => path.includes(p))) return json({ code: "XX000", message: "boom" }, 500);
    if ((init?.method ?? "GET") !== "GET") return json({ code: "XX000", message: "completion is read-only" }, 405);

    let all: Row[];
    if (resource === "rpc/team_task_ack_status") {
      if (control.missingFunctions) return json({ code: "PGRST202", message: "Could not find the function" }, 404);
      all = ackStatus(params.get("p_campaign_slug")!, pgArray(params.get("p_athlete_ids")), pgArray(params.get("p_task_ids")));
    } else {
      const table = db[resource];
      if (!table) return json([]);
      all = filterRows(table, params);
    }
    all = project(orderRows(all, params.get("order")), params.get("select"));

    const offset = Number(params.get("offset") ?? 0);
    const limit = Math.min(Number(params.get("limit") ?? Infinity), control.maxRows);
    let page = all.slice(offset, offset + limit);
    let total: number | null = all.length;
    const t = control.tamper?.(resource, page, all.length, offset);
    if (t) ({ page, total } = t);
    const counted = ((init?.headers ?? {}) as Record<string, string>).Prefer === "count=exact";
    const headers: Record<string, string> = {};
    if (total !== null) {
      headers["content-range"] = `${page.length ? `${offset}-${offset + page.length - 1}` : "*"}/${counted ? total : "*"}`;
    }
    return json(page, 200, headers);
  }

  return { db, control, requests, fetchImpl };
}

type World = ReturnType<typeof makeWorld>;

function seed(w: World) {
  const mk = (id: string, audience: string, opts: Row = {}): Row => ({
    id, campaign_slug: SLUG, title: `Task ${id.slice(-2)}`, audience, status: "active", sort_order: 0,
    revision: 1, created_at: "2026-01-01", ...opts,
  });
  w.db.team_tasks.push(
    mk(T(1), "both",    { title: "Physical Forms", sort_order: 0 }),
    mk(T(2), "athlete", { title: "Athlete Waiver", sort_order: 1 }),
    mk(T(3), "parent",  { title: "Parent Consent", sort_order: 2, revision: 2 }), // revised after Sam acknowledged
    mk(T(4), "both",    { title: "Old Archived",   sort_order: 3, status: "archived" }),
    mk(T(5), "both",    { title: "Hawks Task",     campaign_slug: OTHER }),
  );
  let n = 0;
  const ack = (task: string, rev: number, req: string, athlete: string, m: typeof MEMBERS[keyof typeof MEMBERS], typed: string) =>
    w.db.team_task_acknowledgments.push({
      id: `ack-${++n}`, campaign_slug: SLUG, task_id: task, task_revision: rev, requirement: req, athlete_id: athlete,
      member_id: m.id, account_id: m.account_id, full_name: typed, member_name_snapshot: m.name,
      athlete_name_snapshot: "x", task_title_snapshot: "x", acknowledged_at: `2026-10-1${n}T10:00:00Z`,
    });
  // One parent acknowledgment satisfying two children — Jake via the second-child table.
  ack(T(1), 1, "parent", A(1), MEMBERS.pat, TYPED.pat);
  ack(T(1), 1, "parent", A(2), MEMBERS.pat, TYPED.pat);
  ack(T(1), 1, "athlete", A(1), MEMBERS.ava, TYPED.ava);
  // Earlier revision of the parent-only task.
  ack(T(3), 1, "parent", A(1), MEMBERS.sam, TYPED.sam);
  // History on an archived task — must stay out of current reports.
  ack(T(4), 1, "parent", A(1), MEMBERS.pat, TYPED.pat);
}

async function withWorld<R>(run: (w: World) => Promise<R>, opts: { seed?: boolean } = {}): Promise<R> {
  const w = makeWorld();
  if (opts.seed !== false) seed(w);
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
  nobody: () => clearCookies(),
};

const base = `http://test.local/api/team/${SLUG}/todo/completion`;
const req = (url: string) => new NextRequest(url, { method: "GET" });
async function getSummary(slug = SLUG) {
  const { GET } = await import("./route.ts");
  return GET(req(base) as never, { params: Promise.resolve({ slug }) });
}
async function getTask(taskId: string, slug = SLUG) {
  const { GET } = await import("./tasks/[taskId]/route.ts");
  return GET(req(`${base}/tasks/${taskId}`) as never, { params: Promise.resolve({ slug, taskId }) });
}
async function getAthlete(athleteId: string, slug = SLUG) {
  const { GET } = await import("./athletes/[athleteId]/route.ts");
  return GET(req(`${base}/athletes/${athleteId}`) as never, { params: Promise.resolve({ slug, athleteId }) });
}
const all3 = () => [getSummary(), getTask(T(1)), getAthlete(A(1))];

type Entry = { requirement: string; state: string; acknowledgedAt: string | null };
const states = (entries: Entry[]) => Object.fromEntries(entries.map(e => [e.requirement, e.state]));
const byName = (rows: { athlete: { name: string }; entries: Entry[] }[]) => Object.fromEntries(rows.map(r => [r.athlete.name, states(r.entries)]));
const summaryOf = async () => {
  const res = await getSummary();
  assert.equal(res.status, 200);
  const body = await res.json();
  return Object.fromEntries((body.tasks as Row[]).map(t => [(t.task as Row).title, t])) as Record<string, Row & { requirements: Row; totals: Row; athletes: Row }>;
};

// ── Authorization ─────────────────────────────────────────────────────────

test("Head Coach, Assistant Coach and platform admins can view all three", async () => {
  await withWorld(async () => {
    for (const who of [() => as.coach(COACHES.head), () => as.coach(COACHES.assistant), () => as.account("acct-admin", "sa")]) {
      who();
      for (const res of await Promise.all(all3())) assert.equal(res.status, 200);
    }
  });
});

test("boosters, athletes, parents and visitors get no completion data (server-enforced)", async () => {
  await withWorld(async w => {
    const denied: [string, () => void, number][] = [
      ["booster coach", () => as.coach(COACHES.booster), 403],
      ["booster member", () => as.member(MEMBERS.booster), 403],
      ["athlete", () => as.member(MEMBERS.ava), 403],
      ["parent", () => as.member(MEMBERS.pat), 403],
      ["visitor", () => as.nobody(), 401],
    ];
    for (const [label, who, status] of denied) {
      who();
      const before = w.requests.length;
      for (const res of await Promise.all(all3())) {
        assert.equal(res.status, status, label);
        const body = await res.json();
        assert.ok(!("tasks" in body) && !("athletes" in body) && !("summary" in body), label);
      }
      assert.ok(!w.requests.slice(before).some(p => p.startsWith("rpc/team_task_ack_status")), `${label}: no status read`);
    }
  });
});

test("cross-team: another team's coach or account can't view; another team's task or athlete is not found", async () => {
  await withWorld(async () => {
    as.coach(COACHES.hawkHead); // head coach — of the hawks
    for (const res of await Promise.all(all3())) assert.ok(res.status === 401 || res.status === 403, String(res.status));
    as.account("acct-hawk-only", "sh");
    for (const res of await Promise.all(all3())) assert.equal(res.status, 401);

    as.coach(COACHES.head);
    assert.equal((await getTask(T(5))).status, 404);    // hawks task via wolves
    assert.equal((await getAthlete(A(4))).status, 404); // hawks athlete via wolves
    for (const bad of ["nope", "1,2", "}", `${T(1)},${T(5)}`]) {
      assert.equal((await getTask(bad)).status, 404, bad);
      assert.equal((await getAthlete(bad)).status, 404, bad);
    }
    // The hawks' own data never leaks into the wolves summary.
    assert.ok(!JSON.stringify(await (await getSummary()).json()).includes("Hawk"));
  });
});

// ── States and counts ─────────────────────────────────────────────────────

test("task detail: complete, not joined, no parent linked; one parent covers two children (second-child link)", async () => {
  await withWorld(async () => {
    as.coach(COACHES.head);
    const body = await (await getTask(T(1))).json();
    assert.deepEqual(byName(body.athletes), {
      "Ava Athlete": { athlete: "complete", parent: "complete" },
      "Jake Jr":     { athlete: "not_joined", parent: "complete" },  // Pat, via team_member_athletes
      "Lone Rider":  { athlete: "not_joined", parent: "no_parent_linked" },
    });
    const ava = body.athletes.find((r: Row) => (r.athlete as Row).name === "Ava Athlete");
    assert.equal(ava.status, "complete");
    assert.ok(ava.entries.every((e: Entry) => typeof e.acknowledgedAt === "string"));
    assert.deepEqual(Object.keys(body.athletes[0].athlete).sort(), ["class_year", "id", "jersey_number", "name"]);
  });
});

test("requirement counts vs distinct-athlete counts; cannot-complete-yet is a breakdown, not double-counted", async () => {
  await withWorld(async () => {
    as.coach(COACHES.assistant);
    const s = await summaryOf();
    const pf = s["Physical Forms"];
    assert.deepEqual(pf.requirements.athlete, { required: 3, complete: 1, outstanding: 2, notAcknowledged: 0, needsUpdate: 0, cannotCompleteYet: 2, unknown: 0 });
    assert.deepEqual(pf.requirements.parent,  { required: 3, complete: 2, outstanding: 1, notAcknowledged: 0, needsUpdate: 0, cannotCompleteYet: 1, unknown: 0 });
    assert.deepEqual(pf.totals,               { required: 6, complete: 3, outstanding: 3, notAcknowledged: 0, needsUpdate: 0, cannotCompleteYet: 3, unknown: 0 });
    // 3 outstanding requirements, but only 2 distinct athletes outstanding.
    assert.deepEqual(pf.athletes, { total: 3, complete: 1, outstanding: 2, unknown: 0 });
    for (const t of Object.values(s)) {
      const c = t.totals as Record<string, number>;
      assert.equal(c.complete + c.outstanding + c.unknown, c.required);
      assert.equal(c.notAcknowledged + c.needsUpdate + c.cannotCompleteYet, c.outstanding);
    }
  });
});

test("athlete-only and parent-only tasks carry only their own requirement; revised task shows needs-update", async () => {
  await withWorld(async () => {
    as.coach(COACHES.head);
    const s = await summaryOf();
    assert.deepEqual(Object.keys(s["Athlete Waiver"].requirements), ["athlete"]);
    assert.deepEqual(Object.keys(s["Parent Consent"].requirements), ["parent"]);
    assert.deepEqual(byName((await (await getTask(T(2))).json()).athletes), {
      "Ava Athlete": { athlete: "outstanding" }, "Jake Jr": { athlete: "not_joined" }, "Lone Rider": { athlete: "not_joined" },
    });
    // Sam acknowledged revision 1; the task is now revision 2.
    assert.deepEqual(byName((await (await getTask(T(3))).json()).athletes), {
      "Ava Athlete": { parent: "needs_update" }, "Jake Jr": { parent: "outstanding" }, "Lone Rider": { parent: "no_parent_linked" },
    });
    assert.equal(s["Parent Consent"].requirements.parent.needsUpdate, 1);
  });
});

test("athlete detail: every active task, only applicable requirements, archived excluded", async () => {
  await withWorld(async () => {
    as.coach(COACHES.head);
    const body = await (await getAthlete(A(1))).json();
    assert.equal(body.athlete.name, "Ava Athlete");
    assert.deepEqual(body.tasks.map((t: Row) => [(t.task as Row).title, states(t.entries as Entry[])]), [
      ["Physical Forms", { athlete: "complete", parent: "complete" }],
      ["Athlete Waiver", { athlete: "outstanding" }],
      ["Parent Consent", { parent: "needs_update" }],
    ]);
    assert.deepEqual(body.totals, { required: 4, complete: 2, outstanding: 2, notAcknowledged: 1, needsUpdate: 1, cannotCompleteYet: 0, unknown: 0 });
  });
});

test("archived tasks: never in the summary; detail is refused; their history is untouched", async () => {
  await withWorld(async w => {
    as.coach(COACHES.head);
    const s = await summaryOf();
    assert.deepEqual(Object.keys(s), ["Physical Forms", "Athlete Waiver", "Parent Consent"]);
    const res = await getTask(T(4));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).reason, "inactive");
    assert.equal(w.db.team_task_acknowledgments.filter(k => k.task_id === T(4)).length, 1);
  });
});

test("revising a task: earlier acknowledgments become needs-update, never complete", async () => {
  await withWorld(async w => {
    w.db.team_tasks.find(t => t.id === T(1))!.revision = 2;
    as.coach(COACHES.head);
    assert.deepEqual(byName((await (await getTask(T(1))).json()).athletes), {
      "Ava Athlete": { athlete: "needs_update", parent: "needs_update" },
      "Jake Jr":     { athlete: "not_joined",   parent: "needs_update" },
      "Lone Rider":  { athlete: "not_joined",   parent: "no_parent_linked" },
    });
  });
});

test("deleted or unlinked accounts stop counting", async () => {
  // Unlinking Pat from Jake: Jake has no parent any more.
  await withWorld(async w => {
    w.db.team_member_athletes = [];
    as.coach(COACHES.head);
    assert.deepEqual(states((await (await getTask(T(1))).json()).athletes.find((r: Row) => (r.athlete as Row).name === "Jake Jr").entries), { athlete: "not_joined", parent: "no_parent_linked" });
  });
  // Pat's member row deleted (member_id SET NULL): Ava's parent requirement is open again (Sam can still do it).
  await withWorld(async w => {
    w.db.team_members = w.db.team_members.filter(m => m.id !== "m-pat");
    for (const k of w.db.team_task_acknowledgments) if (k.member_id === "m-pat") k.member_id = null;
    as.coach(COACHES.head);
    assert.deepEqual(byName((await (await getTask(T(1))).json()).athletes)["Ava Athlete"], { athlete: "complete", parent: "outstanding" });
  });
  // Pat's account deleted and the member row now belongs to no account: the acknowledgment doesn't count.
  await withWorld(async w => {
    w.db.team_members.find(m => m.id === "m-pat")!.account_id = null;
    as.coach(COACHES.head);
    const rows = byName((await (await getTask(T(1))).json()).athletes);
    assert.equal(rows["Ava Athlete"].parent, "outstanding");
    assert.equal(rows["Jake Jr"].parent, "outstanding");
  });
});

test("athletes added after a task was created are outstanding, not missing", async () => {
  await withWorld(async w => {
    w.db.athletes.push({ id: A(9), campaign_slug: SLUG, name: "New Kid", class_year: "Freshman", jersey_number: null });
    as.coach(COACHES.head);
    assert.deepEqual(byName((await (await getTask(T(1))).json()).athletes)["New Kid"], { athlete: "not_joined", parent: "no_parent_linked" });
    assert.equal((await summaryOf())["Physical Forms"].athletes.total, 4);
  });
});

// ── Pagination past the 1,000-row cap ─────────────────────────────────────

function bigTeam(w: World, athletes: number, tasks: { id: string; audience: string }[]) {
  w.db.athletes = w.db.athletes.filter(a => a.campaign_slug !== SLUG);
  w.db.team_tasks = [];
  w.db.team_task_acknowledgments = [];
  w.db.team_member_athletes = [];
  w.db.team_members = w.db.team_members.filter(m => m.role === "booster");
  for (let i = 1; i <= athletes; i++) {
    w.db.athletes.push({ id: A(100 + i), campaign_slug: SLUG, name: `Athlete ${String(i).padStart(4, "0")}`, class_year: null, jersey_number: null });
  }
  // Every 3rd athlete has joined and acknowledged task 0's athlete requirement.
  for (let i = 3; i <= athletes; i += 3) {
    w.db.team_members.push({ id: `m-big-${i}`, name: `M ${i}`, role: "athlete", campaign_slug: SLUG, athlete_id: A(100 + i), account_id: `acct-big-${i}`, salt: "x" });
    w.db.team_task_acknowledgments.push({ id: `ack-big-${i}`, campaign_slug: SLUG, task_id: tasks[0].id, task_revision: 1, requirement: "athlete",
      athlete_id: A(100 + i), member_id: `m-big-${i}`, account_id: `acct-big-${i}`, full_name: "Typed Big", member_name_snapshot: `M ${i}`, acknowledged_at: "2026-10-18T00:00:00Z" });
  }
  tasks.forEach((t, i) => w.db.team_tasks.push({ id: t.id, campaign_slug: SLUG, title: `Big ${i}`, audience: t.audience, status: "active", sort_order: i, revision: 1, created_at: "2026-01-01" }));
}

test("pagination: 1,100 athletes x 2 tasks (4,400 status rows) are all read, verified and counted", async () => {
  await withWorld(async w => {
    bigTeam(w, 1100, [{ id: T(11), audience: "both" }, { id: T(12), audience: "both" }]);
    as.coach(COACHES.head);
    const s = await summaryOf();
    const big0 = s["Big 0"];
    assert.equal(big0.athletes.total, 1100);
    assert.deepEqual(big0.requirements.athlete, { required: 1100, complete: 366, outstanding: 734, notAcknowledged: 0, needsUpdate: 0, cannotCompleteYet: 734, unknown: 0 });
    assert.equal(s["Big 1"].totals.complete, 0);
    // Pages, not one request per athlete: roster 2 pages, status 5 pages, tasks 1, plus the actor lookup.
    const statusReads = w.requests.filter(p => p.startsWith("rpc/team_task_ack_status")).length;
    const rosterReads = w.requests.filter(p => p.startsWith("athletes?")).length;
    assert.equal(statusReads, 5);
    assert.equal(rosterReads, 2);
    assert.ok(w.requests.length < 15, `${w.requests.length} requests`);

    const detail = await (await getTask(T(11))).json();
    assert.equal(detail.athletes.length, 1100);
    assert.equal(new Set(detail.athletes.map((r: Row) => (r.athlete as Row).id)).size, 1100);
  });
});

test("pagination: a server cap lower than the page size still reads everything", async () => {
  await withWorld(async w => {
    bigTeam(w, 600, [{ id: T(11), audience: "both" }]);
    w.control.maxRows = 250;
    as.coach(COACHES.head);
    const s = await summaryOf();
    assert.equal(s["Big 0"].totals.required, 1200);
    assert.equal(s["Big 0"].totals.complete, 200);
  });
});

// ── Fail closed: truncated, missing, duplicate, changed or failed reads ──

async function expectUnavailable(_w: World, label: string, reason = "error") {
  as.coach(COACHES.head);
  for (const res of await Promise.all(all3())) {
    assert.equal(res.status, 503, label);
    const body = await res.json();
    assert.equal(body.reason, reason, label);
    assert.ok(!("tasks" in body) && !("athletes" in body) && !("summary" in body) && !("totals" in body), `${label}: no partial data`);
  }
}

test("truncated pages (rows missing behind a full count) are never treated as complete", async () => {
  await withWorld(async w => {
    w.control.tamper = (resource, page, total) => resource.startsWith("rpc/") ? { page: page.slice(0, -1), total } : undefined;
    await expectUnavailable(w, "status truncated");
  });
  await withWorld(async w => {
    bigTeam(w, 1100, [{ id: T(11), audience: "athlete" }]);
    w.control.tamper = (resource, page, total, offset) => resource === "athletes" && offset > 0 ? { page: [], total } : undefined;
    as.coach(COACHES.head);
    assert.equal((await getSummary()).status, 503);
  });
});

test("no exact count, a changing count, or a duplicate row fails closed", async () => {
  await withWorld(async w => {
    w.control.tamper = (resource, page) => resource.startsWith("rpc/") ? { page, total: null } : undefined;
    await expectUnavailable(w, "no count");
  });
  await withWorld(async w => {
    bigTeam(w, 1100, [{ id: T(11), audience: "athlete" }]);
    w.control.tamper = (resource, page, total, offset) => resource === "athletes" && offset > 0 ? { page, total: total + 1 } : undefined;
    as.coach(COACHES.head);
    assert.equal((await getSummary()).status, 503, "count changed between pages");
  });
  await withWorld(async w => {
    w.control.tamper = (resource, page, total) => resource.startsWith("rpc/") && page.length > 1 ? { page: [...page.slice(0, -1), page[0]], total } : undefined;
    await expectUnavailable(w, "duplicate row");
  });
});

test("status rows that don't match the tasks and roster exactly fail closed (missing / extra / stale revision)", async () => {
  // A status row missing while the count agrees (the function skipped one).
  await withWorld(async w => {
    w.control.tamper = (resource, page) => resource.startsWith("rpc/") ? { page: page.slice(1), total: page.length - 1 } : undefined;
    await expectUnavailable(w, "missing row");
  });
  // A status row for an athlete the roster read didn't include (added between reads).
  await withWorld(async w => {
    w.control.tamper = (resource, page) => resource.startsWith("rpc/") && page.length
      ? { page: [...page, { ...page[0], athlete_id: A(77) }], total: page.length + 1 } : undefined;
    await expectUnavailable(w, "extra row");
  });
  // The task was revised between the task read and the status read.
  await withWorld(async w => {
    w.control.tamper = (resource, page, total) => resource.startsWith("rpc/")
      ? { page: page.map(r => ({ ...r, task_revision: (r.task_revision as number) + 1 })), total } : undefined;
    await expectUnavailable(w, "stale revision");
  });
});

test("database errors and missing functions: 503, no partial data, nothing green", async () => {
  for (const failing of ["rpc/team_task_ack_status", "athletes?", "team_tasks?"]) {
    await withWorld(async w => {
      w.control.failPaths = [failing];
      as.coach(COACHES.head);
      // Each route reads at least one of these; every one must fail closed.
      for (const res of await Promise.all(all3())) {
        const body = await res.json();
        assert.equal(res.status, 503, `${failing}: ${JSON.stringify(body).slice(0, 80)}`);
        assert.ok(!("tasks" in body) && !("athletes" in body) && !("summary" in body), failing);
      }
    });
  }
  await withWorld(async w => {
    w.control.missingFunctions = true;
    await expectUnavailable(w, "missing function", "unavailable");
  });
});

test("recovery: once reads succeed again the data is back", async () => {
  await withWorld(async w => {
    w.control.failPaths = ["rpc/team_task_ack_status"];
    as.coach(COACHES.head);
    assert.equal((await getSummary()).status, 503);
    w.control.failPaths = [];
    assert.equal((await getSummary()).status, 200);
  });
});

// ── Privacy ───────────────────────────────────────────────────────────────

test("no typed names, member names, member/account ids or acknowledgment ids in any response; never fetched", async () => {
  await withWorld(async w => {
    for (const who of [() => as.coach(COACHES.head), () => as.account("acct-admin", "sa")]) {
      who();
      const bodies = await Promise.all([...all3(), getTask(T(3)), getAthlete(A(2))].map(async p => JSON.stringify(await (await p).json())));
      for (const body of bodies) {
        for (const secret of [...Object.values(TYPED), "Pat Parent", "Sam Parent", "Ava Account", "m-pat", "m-sam", "m-ava", "acct-", "ack-", "full_name", "member"]) {
          assert.ok(!body.includes(secret), `${secret} leaked: ${body.slice(0, 120)}`);
        }
      }
    }
    const statusSelects = w.requests.filter(p => p.startsWith("rpc/team_task_ack_status")).map(p => new URLSearchParams(p.split("?")[1]).get("select") ?? "");
    assert.ok(statusSelects.length > 0);
    for (const sel of statusSelects) {
      assert.ok(sel.length > 0, "explicit column list");
      for (const col of ["acknowledged_full_name", "acknowledged_member_name", "acknowledged_by_member_id", "acknowledgment_id"]) {
        assert.ok(!sel.split(",").includes(col), `${col} fetched: ${sel}`);
      }
    }
  });
});

test("read-only: completion never writes", async () => {
  await withWorld(async w => {
    const before = JSON.stringify(w.db);
    as.coach(COACHES.head);
    await Promise.all(all3());
    assert.equal(JSON.stringify(w.db), before);
    assert.ok(w.requests.every(p => !p.startsWith("audit_logs")));
  });
});

// ── Family view: /api/team/[slug]/todo/family-completion/[athleteId] ─────

async function getFamily(athleteId: string, slug = SLUG) {
  const { GET } = await import("../family-completion/[athleteId]/route.ts");
  return GET(req(`http://test.local/api/team/${slug}/todo/family-completion/${athleteId}`) as never, { params: Promise.resolve({ slug, athleteId }) });
}
const familyTasks = async (athleteId: string) => {
  const res = await getFamily(athleteId);
  assert.equal(res.status, 200, athleteId);
  const body = await res.json();
  return (body.tasks as { task: Row; entries: Entry[] }[]).map(t => [t.task.title, states(t.entries)]);
};

test("family: an athlete sees their own profile — athlete-visible tasks, both requirements of a Both task", async () => {
  await withWorld(async () => {
    as.member(MEMBERS.ava);
    assert.deepEqual(await familyTasks(A(1)), [
      ["Physical Forms", { athlete: "complete", parent: "complete" }],
      ["Athlete Waiver", { athlete: "outstanding" }],
      // "Parent Consent" (parent-only) is not visible to athletes in their To-Do List, so not here either.
    ]);
  });
});

test("family: an athlete can't view another athlete, another team's athlete, or a bad id", async () => {
  await withWorld(async w => {
    as.member(MEMBERS.ava);
    const before = w.requests.length;
    for (const id of [A(2), A(3), A(4), "nope", `${A(1)},${A(2)}`]) {
      const res = await getFamily(id);
      assert.equal(res.status, 404, id);
      const body = await res.json();
      assert.ok(!("tasks" in body) && !("athlete" in body), id);
    }
    assert.ok(!w.requests.slice(before).some(p => p.startsWith("rpc/team_task_ack_status")), "no status read for someone else's athlete");
  });
});

test("family: a parent sees each linked child (legacy and second-child links) — parent-visible tasks", async () => {
  await withWorld(async () => {
    as.member(MEMBERS.pat);
    assert.deepEqual(await familyTasks(A(1)), [
      ["Physical Forms", { athlete: "complete", parent: "complete" }],
      ["Parent Consent", { parent: "needs_update" }], // Sam acknowledged revision 1; it's revision 2 now
    ]);
    assert.deepEqual(await familyTasks(A(2)), [   // Jake: linked only through team_member_athletes
      ["Physical Forms", { athlete: "not_joined", parent: "complete" }],
      ["Parent Consent", { parent: "outstanding" }],
    ]);
  });
});

test("family: a parent can't view an unlinked child; another parent of one child can't view the other", async () => {
  await withWorld(async () => {
    as.member(MEMBERS.pat);
    assert.equal((await getFamily(A(3))).status, 404);
    as.member(MEMBERS.sam); // Sam: Ava only
    assert.equal((await getFamily(A(1))).status, 200);
    assert.equal((await getFamily(A(2))).status, 404);
  });
});

test("family: removed links and deleted accounts take effect immediately", async () => {
  await withWorld(async w => {
    w.db.team_member_athletes = []; // Pat unlinked from Jake
    as.member(MEMBERS.pat);
    assert.equal((await getFamily(A(2))).status, 404);
    assert.equal((await getFamily(A(1))).status, 200); // legacy link to Ava remains
  });
  await withWorld(async w => {
    w.db.team_members.find(m => m.id === "m-pat")!.account_id = null; // Pat's account deleted
    as.member(MEMBERS.pat);
    // Pat's earlier acknowledgment no longer counts; Sam (still linked) hasn't acknowledged.
    assert.deepEqual((await familyTasks(A(1)))[0], ["Physical Forms", { athlete: "complete", parent: "outstanding" }]);
  });
});

test("family: current revision only — a revised task needs a new acknowledgment", async () => {
  await withWorld(async w => {
    w.db.team_tasks.find(t => t.id === T(1))!.revision = 2;
    as.member(MEMBERS.ava);
    assert.deepEqual((await familyTasks(A(1)))[0], ["Physical Forms", { athlete: "needs_update", parent: "needs_update" }]);
  });
});

test("family: coaches (incl. a coach who is also a parent), boosters and visitors are refused; coach view unchanged", async () => {
  await withWorld(async w => {
    // The Assistant Coach's own account is also a parent of Lone Rider.
    w.db.team_members.push({ id: "m-cpar", name: "Ari Asst", role: "parent", campaign_slug: SLUG, athlete_id: A(3), account_id: "acct-asst", salt: "t9" });
    for (const [label, who, status] of [
      ["coach-parent", () => as.coach(COACHES.assistant), 403],
      ["head coach", () => as.coach(COACHES.head), 403],
      ["platform admin", () => as.account("acct-admin", "sa"), 403],
      ["booster coach", () => as.coach(COACHES.booster), 403],
      ["booster member", () => as.member(MEMBERS.booster), 403],
      ["visitor", () => as.nobody(), 401],
    ] as const) {
      who();
      const res = await getFamily(A(3));
      assert.equal(res.status, status, label);
      assert.ok(!("tasks" in await res.json()), label);
    }
    // Coaches keep the coach view (all athletes) — the coach-parent included.
    as.coach(COACHES.assistant);
    assert.equal((await getAthlete(A(3))).status, 200);
    // And the coach-only API stays coach-only for families.
    for (const m of [MEMBERS.ava, MEMBERS.pat]) {
      as.member(m);
      assert.equal((await getAthlete(A(1))).status, 403);
      assert.equal((await getSummary()).status, 403);
    }
  });
});

test("family: another team's parent is refused here", async () => {
  await withWorld(async () => {
    as.member(MEMBERS.hawkPar);
    const res = await getFamily(A(4));
    assert.ok(res.status === 401 || res.status === 403 || res.status === 404, String(res.status));
    assert.ok(!("tasks" in await res.json()));
  });
});

test("family: failed reads fail closed (identity links, status), then recover", async () => {
  await withWorld(async w => {
    as.member(MEMBERS.pat);
    w.control.failPaths = ["team_member_athletes?"]; // can't verify Pat's second child
    for (const id of [A(1), A(2)]) {
      const res = await getFamily(id);
      assert.equal(res.status, 503, id);
      const body = await res.json();
      assert.equal(body.error, "Completion status is temporarily unavailable. Please try again.");
      assert.ok(!("tasks" in body));
    }
    w.control.failPaths = ["rpc/team_task_ack_status"];
    assert.equal((await getFamily(A(1))).status, 503);
    w.control.tamper = (resource, page, total) => resource.startsWith("rpc/") ? { page: page.slice(1), total } : undefined; // truncated
    w.control.failPaths = [];
    assert.equal((await getFamily(A(1))).status, 503);
    w.control.tamper = undefined;
    assert.equal((await getFamily(A(1))).status, 200);
  });
});

test("family: no typed names, member names or ids; only athlete, tasks and counts", async () => {
  await withWorld(async () => {
    for (const [m, id] of [[MEMBERS.ava, A(1)], [MEMBERS.pat, A(1)], [MEMBERS.pat, A(2)]] as const) {
      as.member(m);
      const body = await (await getFamily(id)).json();
      assert.deepEqual(Object.keys(body).sort(), ["athlete", "available", "tasks", "totals"]);
      const text = JSON.stringify(body);
      for (const secret of [...Object.values(TYPED), "Pat Parent", "Sam Parent", "Ava Account", "m-pat", "m-sam", "m-ava", "acct-", "ack-", "full_name", "member"]) {
        assert.ok(!text.includes(secret), `${secret} leaked`);
      }
    }
  });
});
