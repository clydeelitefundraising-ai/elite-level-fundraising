// Team Management Phase 2 — /api/team/[slug]/todo/* route tests. Same
// technique as fundraising-inquiries/route.test.ts: the real
// getTeamActor() resolves legacy team_coach / team_member cookies (real
// makeCoachCookie / makeMemberCookie + verify) against a fetch-mocked
// in-memory PostgREST layer, which also emulates the three team_task_*
// database functions and their error messages.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest }      = await import("../../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie }  = await import("../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeMemberCookie } = await import("@/lib/memberAuth");
const { makeCoachCookie }  = await import("@/lib/teamAuth");

type Row = Record<string, unknown>;

const SLUG  = "wolves";
const OTHER = "hawks";
const FILE_OURS   = "aaaaaaaa-0000-4000-8000-000000000001";
const FILE_OURS_2 = "aaaaaaaa-0000-4000-8000-000000000002";
const FILE_THEIRS = "bbbbbbbb-0000-4000-8000-000000000001";

const PEOPLE = {
  head:      { id: "coach-head",  name: "Hana Head",   role: "head_coach",      campaign_slug: SLUG,  salt: "s1", account_id: "acct-head" },
  legacy:    { id: "coach-old",   name: "Old Login",   role: "head_coach",      campaign_slug: SLUG,  salt: "s2", account_id: null },
  assistant: { id: "coach-asst",  name: "Ari Asst",    role: "assistant_coach", campaign_slug: SLUG,  salt: "s3", account_id: "acct-asst" },
  booster:   { id: "coach-boost", name: "Bo Booster",  role: "booster",         campaign_slug: SLUG,  salt: "s4", account_id: null },
  otherHead: { id: "coach-hawk",  name: "Hawk Head",   role: "head_coach",      campaign_slug: OTHER, salt: "s5", account_id: "acct-hawk" },
};
const MEMBERS = {
  athlete: { id: "m-ath",   name: "Ava Athlete", role: "athlete", campaign_slug: SLUG, athlete_id: "ath-1", account_id: null, salt: "t1" },
  parent:  { id: "m-par",   name: "Pat Parent",  role: "parent",  campaign_slug: SLUG, athlete_id: "ath-1", account_id: null, salt: "t2" },
  booster: { id: "m-boost", name: "Mo Booster",  role: "booster", campaign_slug: SLUG, athlete_id: null,    account_id: null, salt: "t3" },
};

function makeWorld(opts: { mode?: "ok" | "missing" | "broken" } = {}) {
  const mode = opts.mode ?? "ok";
  const db: Record<string, Row[]> = {
    team_coaches: Object.values(PEOPLE).map(p => ({ ...p })),
    team_members: Object.values(MEMBERS).map(m => ({ ...m })),
    team_files: [
      { id: FILE_OURS,   campaign_slug: SLUG,  name: "physical.pdf", file_type: "pdf", size_bytes: 10, created_at: "2026-01-01" },
      { id: FILE_OURS_2, campaign_slug: SLUG,  name: "rules.pdf",    file_type: "pdf", size_bytes: 10, created_at: "2026-01-02" },
      { id: FILE_THEIRS, campaign_slug: OTHER, name: "secret.pdf",   file_type: "pdf", size_bytes: 10, created_at: "2026-01-01" },
    ],
    team_tasks: [],
    team_task_resources: [],
    audit_logs: [],
  };
  const rpcCalls: { name: string; args: Row }[] = [];
  let n = 0;
  const newId = () => `task-${++n}`;

  const TASK_TABLES = new Set(["team_tasks", "team_task_resources"]);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const pgError = (message: string) => json({ code: "P0001", message }, 400);

  function matches(row: Row, key: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[key]) === decodeURIComponent(expr.slice(3));
    if (expr.startsWith("in.(")) return expr.slice(4, -1).split(",").map(decodeURIComponent).includes(String(row[key]));
    return true;
  }
  function filter(rows: Row[], params: URLSearchParams): Row[] {
    let out = rows;
    for (const [k, v] of params.entries()) {
      if (["select", "limit", "order"].includes(k) || k.includes(".")) continue;
      out = out.filter(r => matches(r, k, v));
    }
    const limit = params.get("limit");
    return limit ? out.slice(0, Number(limit)) : out;
  }
  function withResources(task: Row): Row {
    const resources = db.team_task_resources
      .filter(r => r.task_id === task.id)
      .map(r => ({ ...r, attachment: r.attachment_id ? db.team_files.find(f => f.id === r.attachment_id) ?? null : null }));
    return { ...task, resources };
  }
  function insertResources(taskId: string, slug: string, resources: Row[]) {
    resources.forEach((r, i) => {
      if (r.attachment_id && !db.team_files.some(f => f.id === r.attachment_id && f.campaign_slug === slug)) {
        throw new Error("team_task_resource_file_not_on_team");
      }
      db.team_task_resources.push({ id: `res-${++n}`, task_id: taskId, campaign_slug: slug, kind: r.kind, url: r.url ?? null, attachment_id: r.attachment_id ?? null, label: r.label ?? null, sort_order: i });
    });
  }

  function rpc(name: string, a: Row): Response {
    rpcCalls.push({ name, args: a });
    if (mode === "missing") return json({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
    if (mode === "broken") return json({ code: "XX000", message: "boom" }, 500);
    try {
      if (name === "team_task_create") {
        const slug = a.p_campaign_slug as string;
        const task = a.p_task as Row;
        const active = db.team_tasks.filter(t => t.campaign_slug === slug && t.status === "active");
        const row: Row = {
          id: newId(), campaign_slug: slug, ...task, status: "active",
          sort_order: active.length ? Math.max(...active.map(t => t.sort_order as number)) + 1 : 0,
          revision: 1, version: 1, revised_at: "now", created_at: `2026-01-0${n}`, updated_at: "now", archived_at: null,
          created_by_name: (a.p_actor as Row).name, updated_by_name: (a.p_actor as Row).name,
          created_by_account_id: (a.p_actor as Row).account_id, created_by_coach_id: (a.p_actor as Row).coach_id,
        };
        db.team_tasks.push(row);
        insertResources(row.id as string, slug, a.p_resources as Row[]);
        return json(row);
      }
      if (name === "team_task_update") {
        const t = db.team_tasks.find(x => x.id === a.p_task_id && x.campaign_slug === a.p_campaign_slug);
        if (!t) return pgError("team_task_not_found");
        if (t.status !== "active") return pgError("team_task_not_active");
        if (t.version !== a.p_expected_version) return pgError("team_task_version_conflict");
        // Mirrors the migration: +1 if the link/file SET changed
        // (team_task_update) or a requirement field changed
        // (team_tasks_guard) — at most +1 per edit. The app never sends
        // this decision.
        const set = (rs: Row[]) => [...new Set(rs.map(r => r.kind === "file" ? `file:${r.attachment_id}` : `link:${r.url}`))].sort().join("|");
        const resourcesChanged = set(db.team_task_resources.filter(r => r.task_id === t.id)) !== set(a.p_resources as Row[]);
        const next = a.p_task as Row;
        const fieldsChanged = ["title", "instructions", "body_text", "audience"].some(k => (t[k] ?? null) !== (next[k] ?? null));
        Object.assign(t, next, {
          version: (t.version as number) + 1,
          revision: (t.revision as number) + (resourcesChanged || fieldsChanged ? 1 : 0),
          updated_by_name: (a.p_actor as Row).name,
        });
        db.team_task_resources = db.team_task_resources.filter(r => r.task_id !== t.id);
        insertResources(t.id as string, t.campaign_slug as string, a.p_resources as Row[]);
        return json(t);
      }
      if (name === "team_task_move") {
        const list = db.team_tasks
          .filter(t => t.campaign_slug === a.p_campaign_slug && t.status === "active")
          .sort((x, y) => (x.sort_order as number) - (y.sort_order as number));
        const i = list.findIndex(t => t.id === a.p_task_id);
        if (i < 0) return pgError("team_task_not_found");
        const j = a.p_direction === "up" ? i - 1 : i + 1;
        if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]];
        list.forEach((t, k) => { t.sort_order = k; });
        return new Response(null, { status: 204 });
      }
    } catch (err) {
      return pgError((err as Error).message);
    }
    return json({ code: "PGRST202", message: "unknown function" }, 404);
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [resource, query = ""] = path.split("?");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (resource.startsWith("rpc/")) return rpc(resource.slice(4), body);
    if (TASK_TABLES.has(resource) && mode === "missing") {
      return json({ code: "PGRST205", message: `Could not find the table 'public.${resource}' in the schema cache` }, 404);
    }
    if (TASK_TABLES.has(resource) && mode === "broken") return json({ code: "XX000", message: "boom" }, 500);

    const table = db[resource];
    if (!table) return json([]);
    const params = new URLSearchParams(query);

    if (method === "GET") {
      const rows = filter(table, params).map(r => ({ ...r }));
      return json(resource === "team_tasks" ? rows.map(withResources) : rows);
    }
    if (method === "POST") {
      table.push({ ...body });
      return json([body], 201);
    }
    if (method === "PATCH") {
      const rows = filter(table, params);
      for (const r of rows) Object.assign(r, body);
      return json(rows.map(r => ({ ...r })));
    }
    return json([]);
  }

  return { db, rpcCalls, fetchImpl };
}

async function withWorld<T>(opts: Parameters<typeof makeWorld>[0], run: (w: ReturnType<typeof makeWorld>) => Promise<T>): Promise<T> {
  const w = makeWorld(opts);
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
  __setTestCookie("elf_session", undefined);
  __setTestCookie("team_member", undefined);
  __setTestCookie("team_coach", undefined);
}
function asCoach(p: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_coach", makeCoachCookie(p.id, p.salt));
}
function asMember(m: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_member", makeMemberCookie(m.id, m.salt));
}

const routes = {
  list:    () => import("./route.ts"),
  one:     () => import("./[taskId]/route.ts"),
  move:    () => import("./[taskId]/move/route.ts"),
  archive: () => import("./[taskId]/archive/route.ts"),
  files:   () => import("../files/route.ts"),
};

const base = `http://test.local/api/team/${SLUG}/todo`;
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ slug: SLUG, ...extra }) });

async function createAs(person: { id: string; salt: string }, body: Row) {
  asCoach(person);
  const { POST } = await routes.list();
  return POST(req(`${base}/tasks`, "POST", body) as never, ctx());
}
async function listAs(set: () => void, query = "") {
  set();
  const { GET } = await routes.list();
  return GET(req(`${base}/tasks${query}`) as never, ctx());
}

function seedTasks(db: Record<string, Row[]>) {
  const mk = (id: string, audience: string, sort_order: number, status = "active", slug = SLUG): Row => ({
    id, campaign_slug: slug, title: `Task ${id}`, instructions: null, body_text: null, audience, status, sort_order,
    revision: 1, version: 1, revised_at: "x", created_at: `2026-01-1${sort_order}`, updated_at: "x",
    archived_at: status === "archived" ? "x" : null, created_by_name: "Hana Head", updated_by_name: "Hana Head",
  });
  db.team_tasks.push(
    mk("t-ath", "athlete", 0), mk("t-par", "parent", 1), mk("t-both", "both", 2),
    mk("t-old", "both", 3, "archived"), mk("t-hawk", "both", 0, "active", OTHER),
  );
}
const ids = async (res: Response) => ((await res.json()).tasks as Row[]).map(t => t.id);

// ── Create: Head Coach only ───────────────────────────────────────────────

test("Head Coach creates a task with links and an existing team document", async () => {
  await withWorld({}, async ({ db, rpcCalls }) => {
    const res = await createAs(PEOPLE.head, {
      title: " Physical form ", audience: "both", instructions: "Bring it signed.",
      resources: [{ kind: "link", url: "https://forms.example.com/p", label: "Form" }, { kind: "file", attachment_id: FILE_OURS }],
      // Client-supplied identity/role fields must be ignored.
      created_by_account_id: "attacker", role: "head_coach", campaign_slug: OTHER,
    });
    assert.equal(res.status, 200);
    assert.equal(db.team_tasks.length, 1);
    const call = rpcCalls[0];
    assert.equal(call.name, "team_task_create");
    assert.equal(call.args.p_campaign_slug, SLUG);
    assert.deepEqual(call.args.p_task, { title: "Physical form", instructions: "Bring it signed.", body_text: null, audience: "both" });
    assert.deepEqual(call.args.p_actor, { account_id: "acct-head", coach_id: "coach-head", platform_admin_id: null, name: "Hana Head" });
    assert.deepEqual(db.team_task_resources.map(r => [r.kind, r.url ?? r.attachment_id]), [["link", "https://forms.example.com/p"], ["file", FILE_OURS]]);
    assert.ok(db.audit_logs.some(l => l.action === "todo_task.created"));
  });
});

test("legacy team-login Head Coach (no ELF account) can create; account id recorded as null", async () => {
  await withWorld({}, async ({ rpcCalls }) => {
    const res = await createAs(PEOPLE.legacy, { title: "Waiver", audience: "parent" });
    assert.equal(res.status, 200);
    assert.deepEqual(rpcCalls[0].args.p_actor, { account_id: null, coach_id: "coach-old", platform_admin_id: null, name: "Old Login" });
  });
});

test("Assistant Coach, boosters, athletes, parents and anonymous visitors cannot create", async () => {
  await withWorld({}, async ({ db, rpcCalls }) => {
    for (const p of [PEOPLE.assistant, PEOPLE.booster]) assert.equal((await createAs(p, { title: "X", audience: "both" })).status, 403);
    for (const m of Object.values(MEMBERS)) {
      asMember(m);
      const { POST } = await routes.list();
      assert.equal((await POST(req(`${base}/tasks`, "POST", { title: "X", audience: "both" }) as never, ctx())).status, 403);
    }
    clearCookies();
    const { POST } = await routes.list();
    assert.equal((await POST(req(`${base}/tasks`, "POST", { title: "X", audience: "both" }) as never, ctx())).status, 403);
    assert.equal(db.team_tasks.length, 0);
    assert.equal(rpcCalls.length, 0);
  });
});

test("cross-team: another team's Head Coach can't create here, and can't attach another team's file", async () => {
  await withWorld({}, async ({ db, rpcCalls }) => {
    assert.equal((await createAs(PEOPLE.otherHead, { title: "X", audience: "both" })).status, 403);
    const res = await createAs(PEOPLE.head, { title: "X", audience: "both", resources: [{ kind: "file", attachment_id: FILE_THEIRS }] });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /aren't available on this team/);
    assert.equal(rpcCalls.length, 0);
    assert.equal(db.team_tasks.length, 0);
  });
});

test("invalid input is rejected server-side before any write", async () => {
  await withWorld({}, async ({ rpcCalls }) => {
    for (const body of [
      { title: "", audience: "both" },
      { title: "X", audience: "coaches" },
      { title: "X", audience: "both", resources: [{ kind: "link", url: "javascript:alert(1)" }] },
      { title: "X", audience: "both", resources: [{ kind: "file", attachment_id: "not-a-uuid" }] },
    ]) {
      assert.equal((await createAs(PEOPLE.head, body)).status, 400, JSON.stringify(body));
    }
    assert.equal(rpcCalls.length, 0);
  });
});

// ── Visibility ────────────────────────────────────────────────────────────

test("visibility: coaches all audiences; athlete Athlete+Both; parent Parent+Both; boosters none", async () => {
  await withWorld({}, async ({ db }) => {
    seedTasks(db);
    assert.deepEqual(await ids(await listAs(() => asCoach(PEOPLE.head))), ["t-ath", "t-par", "t-both"]);
    const asst = await listAs(() => asCoach(PEOPLE.assistant));
    const asstBody = await asst.json();
    assert.deepEqual(asstBody.tasks.map((t: Row) => t.id), ["t-ath", "t-par", "t-both"]);
    assert.equal(asstBody.canManage, false);
    assert.deepEqual(await ids(await listAs(() => asMember(MEMBERS.athlete))), ["t-ath", "t-both"]);
    assert.deepEqual(await ids(await listAs(() => asMember(MEMBERS.parent))), ["t-par", "t-both"]);
    assert.deepEqual(await ids(await listAs(() => asMember(MEMBERS.booster))), []);
    assert.deepEqual(await ids(await listAs(() => asCoach(PEOPLE.booster))), []);
    assert.equal((await listAs(clearCookies)).status, 401);
  });
});

test("cross-team isolation: a team never sees another team's tasks; detail of another team's task is 404", async () => {
  await withWorld({}, async ({ db }) => {
    seedTasks(db);
    const res = await listAs(() => asCoach(PEOPLE.head));
    assert.ok(!(await ids(res)).includes("t-hawk"));
    asCoach(PEOPLE.head);
    const { GET } = await routes.one();
    assert.equal((await GET(req(`${base}/tasks/t-hawk`) as never, ctx({ taskId: "t-hawk" }))).status, 404);
  });
});

test("task detail hides other audiences and archived tasks (404, not 403)", async () => {
  await withWorld({}, async ({ db }) => {
    seedTasks(db);
    const { GET } = await routes.one();
    asMember(MEMBERS.athlete);
    assert.equal((await GET(req(`${base}/tasks/t-par`) as never, ctx({ taskId: "t-par" }))).status, 404);
    assert.equal((await GET(req(`${base}/tasks/t-both`) as never, ctx({ taskId: "t-both" }))).status, 200);
    asCoach(PEOPLE.assistant);
    assert.equal((await GET(req(`${base}/tasks/t-old`) as never, ctx({ taskId: "t-old" }))).status, 404);
    asCoach(PEOPLE.head);
    assert.equal((await GET(req(`${base}/tasks/t-old`) as never, ctx({ taskId: "t-old" }))).status, 200);
  });
});

test("archived list: Head Coach only", async () => {
  await withWorld({}, async ({ db }) => {
    seedTasks(db);
    assert.deepEqual(await ids(await listAs(() => asCoach(PEOPLE.head), "?status=archived")), ["t-old"]);
    assert.equal((await listAs(() => asCoach(PEOPLE.assistant), "?status=archived")).status, 403);
    assert.equal((await listAs(() => asMember(MEMBERS.parent), "?status=archived")).status, 403);
  });
});

// ── Edit + revision ───────────────────────────────────────────────────────

async function patchAs(person: { id: string; salt: string }, id: string, body: Row) {
  asCoach(person);
  const { PATCH } = await routes.one();
  return PATCH(req(`${base}/tasks/${id}`, "PATCH", body) as never, ctx({ taskId: id }));
}

test("edits: substantive change bumps revision; label-only/reordered resources do not", async () => {
  await withWorld({}, async ({ db }) => {
    await createAs(PEOPLE.head, {
      title: "Physical", audience: "both",
      resources: [{ kind: "link", url: "https://a.com/", label: "A" }, { kind: "file", attachment_id: FILE_OURS }],
    });
    const id = db.team_tasks[0].id as string;

    // Reordered resources + new label: not substantive.
    let res = await patchAs(PEOPLE.head, id, {
      expected_version: 1, title: "Physical", audience: "both",
      resources: [{ kind: "file", attachment_id: FILE_OURS }, { kind: "link", url: "https://a.com/", label: "Renamed" }],
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).revisionChanged, false);
    assert.deepEqual([db.team_tasks[0].revision, db.team_tasks[0].version], [1, 2]);

    // Audience change: substantive.
    res = await patchAs(PEOPLE.head, id, { expected_version: 2, title: "Physical", audience: "parent", resources: [{ kind: "file", attachment_id: FILE_OURS }] });
    assert.equal((await res.json()).revisionChanged, true);
    assert.deepEqual([db.team_tasks[0].revision, db.team_tasks[0].version], [2, 3]);
    assert.ok(db.audit_logs.some(l => l.action === "todo_task.updated"));
  });
});

test("revision integrity: the app never sends a revision decision; the database's answer is reported", async () => {
  await withWorld({}, async ({ db, rpcCalls }) => {
    await createAs(PEOPLE.head, {
      title: "Physical", audience: "both", instructions: "Bring it",
      resources: [{ kind: "link", url: "https://a.com/", label: "A" }, { kind: "file", attachment_id: FILE_OURS }],
    });
    const id = db.team_tasks[0].id as string;
    const linkA = { kind: "link", url: "https://a.com/", label: "A" };
    const fileOurs = { kind: "file", attachment_id: FILE_OURS };
    const baseBody = { title: "Physical", audience: "both", instructions: "Bring it" };
    let version = 1;
    const edit = async (changes: Row) => {
      const res = await patchAs(PEOPLE.head, id, { ...baseBody, resources: [linkA, fileOurs], ...changes, expected_version: version++ });
      assert.equal(res.status, 200);
      const call = rpcCalls.at(-1)!;
      assert.equal(call.name, "team_task_update");
      assert.ok(!("p_bump_revision" in call.args), "the app must not decide the revision");
      return { changed: (await res.json()).revisionChanged as boolean, revision: db.team_tasks[0].revision as number };
    };

    // Not substantive.
    assert.deepEqual(await edit({}), { changed: false, revision: 1 });                                               // no change
    assert.deepEqual(await edit({ resources: [fileOurs, linkA] }), { changed: false, revision: 1 });                // reordered
    assert.deepEqual(await edit({ resources: [{ ...linkA, label: "Renamed" }, fileOurs] }), { changed: false, revision: 1 }); // label only
    assert.deepEqual(await edit({ resources: [linkA, linkA, fileOurs] }), { changed: false, revision: 1 });         // duplicate dropped

    // Substantive — each exactly +1.
    assert.deepEqual(await edit({ resources: [{ ...linkA, url: "https://b.com/" }, fileOurs] }), { changed: true, revision: 2 }); // URL changed
    assert.deepEqual(await edit({ resources: [{ ...linkA, url: "https://b.com/" }, { kind: "file", attachment_id: FILE_OURS_2 }] }), { changed: true, revision: 3 }); // file swapped
    assert.deepEqual(await edit({ resources: [linkA] }), { changed: true, revision: 4 });                          // file removed
    assert.deepEqual(await edit({ resources: [linkA, fileOurs] }), { changed: true, revision: 5 });                 // file added
    assert.deepEqual(await edit({ title: "Physical exam" }), { changed: true, revision: 6 });
    assert.deepEqual(await edit({ title: "Physical exam", instructions: "Bring it Monday" }), { changed: true, revision: 7 });
    assert.deepEqual(await edit({ title: "Physical exam", instructions: "Bring it Monday", body_text: "Rules" }), { changed: true, revision: 8 });
    // Field AND link set changed in one edit: still only +1.
    assert.deepEqual(await edit({ title: "Physical exam", instructions: "Bring it Monday", body_text: "Rules", audience: "athlete", resources: [fileOurs] }), { changed: true, revision: 9 });
  });
});

test("edits: stale version → 409 conflict, nothing written", async () => {
  await withWorld({}, async ({ db, rpcCalls }) => {
    await createAs(PEOPLE.head, { title: "Physical", audience: "both" });
    const id = db.team_tasks[0].id as string;
    const before = rpcCalls.length;
    const res = await patchAs(PEOPLE.head, id, { expected_version: 7, title: "Changed", audience: "both" });
    assert.equal(res.status, 409);
    assert.equal(rpcCalls.length, before);
    assert.equal(db.team_tasks[0].title, "Physical");
    assert.equal((await patchAs(PEOPLE.head, id, { title: "Changed", audience: "both" })).status, 400); // version required
  });
});

test("edits: archived tasks can't be edited; Assistant Coach can't edit; other team's task is 404", async () => {
  await withWorld({}, async ({ db }) => {
    seedTasks(db);
    assert.equal((await patchAs(PEOPLE.head, "t-old", { expected_version: 1, title: "X", audience: "both" })).status, 409);
    assert.equal((await patchAs(PEOPLE.assistant, "t-both", { expected_version: 1, title: "X", audience: "both" })).status, 403);
    assert.equal((await patchAs(PEOPLE.head, "t-hawk", { expected_version: 1, title: "X", audience: "both" })).status, 404);
    assert.equal(db.team_tasks.find(t => t.id === "t-hawk")!.title, "Task t-hawk");
  });
});

test("edits: attaching another team's file is rejected", async () => {
  await withWorld({}, async ({ db }) => {
    seedTasks(db);
    const res = await patchAs(PEOPLE.head, "t-both", { expected_version: 1, title: "X", audience: "both", resources: [{ kind: "file", attachment_id: FILE_THEIRS }] });
    assert.equal(res.status, 400);
  });
});

// ── Ordering ──────────────────────────────────────────────────────────────

test("move: Head Coach reorders without touching revision or version; others are refused", async () => {
  await withWorld({}, async ({ db, rpcCalls }) => {
    seedTasks(db);
    const { POST } = await routes.move();
    asCoach(PEOPLE.head);
    const res = await POST(req(`${base}/tasks/t-both/move`, "POST", { direction: "up" }) as never, ctx({ taskId: "t-both" }));
    assert.equal(res.status, 200);
    assert.deepEqual(rpcCalls.at(-1), { name: "team_task_move", args: { p_task_id: "t-both", p_campaign_slug: SLUG, p_direction: "up" } });
    assert.deepEqual(await ids(await listAs(() => asCoach(PEOPLE.head))), ["t-ath", "t-both", "t-par"]);
    assert.ok(db.team_tasks.every(t => t.revision === 1 && t.version === 1));

    asCoach(PEOPLE.head);
    assert.equal((await POST(req(`${base}/tasks/t-both/move`, "POST", { direction: "sideways" }) as never, ctx({ taskId: "t-both" }))).status, 400);
    asCoach(PEOPLE.assistant);
    assert.equal((await POST(req(`${base}/tasks/t-both/move`, "POST", { direction: "up" }) as never, ctx({ taskId: "t-both" }))).status, 403);
    asMember(MEMBERS.parent);
    assert.equal((await POST(req(`${base}/tasks/t-both/move`, "POST", { direction: "up" }) as never, ctx({ taskId: "t-both" }))).status, 403);
  });
});

// ── Archive ───────────────────────────────────────────────────────────────

test("archive/restore: Head Coach only, never deletes, idempotent, keeps revision", async () => {
  await withWorld({}, async ({ db }) => {
    seedTasks(db);
    const { POST } = await routes.archive();
    const archive = (archived: boolean) => POST(req(`${base}/tasks/t-par/archive`, "POST", { archived }) as never, ctx({ taskId: "t-par" }));

    asCoach(PEOPLE.assistant);
    assert.equal((await archive(true)).status, 403);
    asMember(MEMBERS.parent);
    assert.equal((await archive(true)).status, 403);

    asCoach(PEOPLE.head);
    assert.equal((await archive(true)).status, 200);
    const t = db.team_tasks.find(x => x.id === "t-par")!;
    assert.equal(t.status, "archived");
    assert.ok(t.archived_at);
    assert.equal((await archive(true)).status, 200); // already archived: no-op
    assert.equal(db.team_tasks.length, 5);           // nothing deleted
    assert.deepEqual(await ids(await listAs(() => asMember(MEMBERS.parent))), ["t-both"]);

    asCoach(PEOPLE.head);
    assert.equal((await archive(false)).status, 200);
    assert.equal(t.status, "active");
    assert.equal(t.archived_at, null);
    assert.equal(t.revision, 1);
    assert.ok(db.audit_logs.some(l => l.action === "todo_task.archived"));
    assert.ok(db.audit_logs.some(l => l.action === "todo_task.restored"));

    asCoach(PEOPLE.head);
    const other = await POST(req(`${base}/tasks/t-hawk/archive`, "POST", { archived: true }) as never, ctx({ taskId: "t-hawk" }));
    assert.equal(other.status, 404);
    assert.equal(db.team_tasks.find(x => x.id === "t-hawk")!.status, "active");
  });
});

test("there is no delete endpoint for tasks", async () => {
  const one = await routes.one();
  assert.equal("DELETE" in one, false);
});

// ── File picker ───────────────────────────────────────────────────────────

test("existing-file picker: Head Coach sees only this team's files", async () => {
  await withWorld({}, async () => {
    const { GET } = await routes.files();
    asCoach(PEOPLE.head);
    const res = await GET(req(`${base}/files`) as never, ctx());
    assert.deepEqual(((await res.json()).files as Row[]).map(f => f.id).sort(), [FILE_OURS, FILE_OURS_2]);
    asCoach(PEOPLE.assistant);
    assert.equal((await GET(req(`${base}/files`) as never, ctx())).status, 403);
  });
});

// ── Missing tables vs real errors ─────────────────────────────────────────

test("before the migration: list returns available:false (200); writes return 503", async () => {
  await withWorld({ mode: "missing" }, async () => {
    const res = await listAs(() => asCoach(PEOPLE.head));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { available: false, tasks: [], canManage: false, viewer: "manager" });
    assert.equal((await createAs(PEOPLE.head, { title: "X", audience: "both" })).status, 503);
  });
});

test("any other database failure is a real error, never 'no tasks'", async () => {
  await withWorld({ mode: "broken" }, async () => {
    const res = await listAs(() => asCoach(PEOPLE.head));
    assert.equal(res.status, 500);
    assert.equal((await createAs(PEOPLE.head, { title: "X", audience: "both" })).status, 500);
  });
});
