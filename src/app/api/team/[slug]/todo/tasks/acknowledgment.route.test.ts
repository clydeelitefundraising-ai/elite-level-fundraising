// Team Management Phase 3 — /api/team/[slug]/todo/tasks/[taskId]/acknowledgment
// and the list's per-row acknowledgment status. Same technique as
// route.test.ts: the real getTeamActor() resolves team_coach /
// team_member cookies against a fetch-mocked PostgREST layer, which also
// emulates team_task_ack_status() and team_task_acknowledge() with the
// same rules and error messages as phase_t3_task_acknowledgments.sql (the
// SQL itself is tested against PostgreSQL by
// supabase/tests/phase_t3_task_acknowledgments/run.sh).
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
const { resolveAckIdentity } = await import("@/lib/teamTaskAcksStore");

type Row = Record<string, unknown>;

const SLUG  = "wolves";
const OTHER = "hawks";

const COACHES = {
  head:      { id: "coach-head",  name: "Hana Head",  role: "head_coach",      campaign_slug: SLUG,  salt: "s1", account_id: "acct-head" },
  assistant: { id: "coach-asst",  name: "Ari Asst",   role: "assistant_coach", campaign_slug: SLUG,  salt: "s3", account_id: "acct-asst" },
  booster:   { id: "coach-boost", name: "Bo Booster", role: "booster",         campaign_slug: SLUG,  salt: "s4", account_id: null },
};
const MEMBERS = {
  athlete:  { id: "m-ath",   name: "Ava Athlete", role: "athlete", campaign_slug: SLUG,  athlete_id: "ath-1", account_id: "acct-ava", salt: "t1" },
  parent:   { id: "m-par",   name: "Pat Parent",  role: "parent",  campaign_slug: SLUG,  athlete_id: "ath-1", account_id: null,       salt: "t2" },
  parent2:  { id: "m-par2",  name: "Sam Parent",  role: "parent",  campaign_slug: SLUG,  athlete_id: "ath-1", account_id: "acct-sam", salt: "t3" },
  booster:  { id: "m-boost", name: "Mo Booster",  role: "booster", campaign_slug: SLUG,  athlete_id: null,    account_id: null,       salt: "t4" },
  // The Assistant Coach's own account is also Jake's parent on this team.
  coachPar: { id: "m-cpar",  name: "Ari Asst",    role: "parent",  campaign_slug: SLUG,  athlete_id: null,    account_id: "acct-asst", salt: "t5" },
  hawkPar:  { id: "m-hawk",  name: "Hal Hawk",    role: "parent",  campaign_slug: OTHER, athlete_id: "ath-h", account_id: null,       salt: "t6" },
  // An athlete account not yet linked to a roster athlete.
  unlinked: { id: "m-new",   name: "Nia New",     role: "athlete", campaign_slug: SLUG,  athlete_id: null,    account_id: null,       salt: "t7" },
};

function makeWorld(opts: { mode?: "ok" | "missing" } = {}) {
  const mode = opts.mode ?? "ok";
  const db: Record<string, Row[]> = {
    team_coaches: Object.values(COACHES).map(p => ({ ...p })),
    team_members: Object.values(MEMBERS).map(m => ({ ...m })),
    team_member_athletes: [
      { id: "l1", team_member_id: "m-par",  athlete_id: "ath-2" },  // Pat: Ava (legacy) + Jake (join table)
      { id: "l2", team_member_id: "m-cpar", athlete_id: "ath-2" },  // coach-parent: Jake only
    ],
    athletes: [
      { id: "ath-1", campaign_slug: SLUG,  name: "Ava Athlete" },
      { id: "ath-2", campaign_slug: SLUG,  name: "Jake Jr" },
      { id: "ath-3", campaign_slug: SLUG,  name: "Lone Rider" },
      { id: "ath-h", campaign_slug: OTHER, name: "Hawk Kid" },
    ],
    team_tasks: [],
    team_task_resources: [],
    team_task_acknowledgments: [],
    audit_logs: [],
  };
  const rpcCalls: { name: string; args: Row }[] = [];
  // failPaths: any REST read whose path contains one of these fails (500).
  const control: { failAcknowledge?: string; failStatus?: boolean; failPaths: string[] } = { failPaths: [] };
  let n = 0;

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

  // ── Mirrors of the Phase 3 SQL functions ────────────────────────────
  const member = (id: unknown) => db.team_members.find(m => m.id === id);
  function linked(memberId: unknown, athleteId: unknown, req: string, slug: string): boolean {
    const m = member(memberId);
    const a = db.athletes.find(x => x.id === athleteId && x.campaign_slug === slug);
    if (!m || !a || m.campaign_slug !== slug || m.role !== req) return false;
    return m.athlete_id === athleteId ||
      (req === "parent" && db.team_member_athletes.some(l => l.team_member_id === m.id && l.athlete_id === athleteId));
  }
  function counts(memberId: unknown, accountId: unknown, athleteId: unknown, req: string, slug: string): boolean {
    const m = member(memberId);
    return !!m && (m.account_id ?? null) === (accountId ?? null) && linked(memberId, athleteId, req, slug);
  }
  const reqsFor = (aud: unknown) => aud === "both" ? ["athlete", "parent"] : [String(aud)];

  function ackStatus(a: Row): Row[] {
    const slug = a.p_campaign_slug as string;
    const athleteIds = a.p_athlete_ids as string[] | null;
    const taskIds = a.p_task_ids as string[] | null;
    const tasks = db.team_tasks.filter(t => t.campaign_slug === slug && t.status === "active" && (!taskIds || taskIds.includes(t.id as string)));
    const athletes = db.athletes.filter(x => x.campaign_slug === slug && (!athleteIds || athleteIds.includes(x.id as string)));
    const out: Row[] = [];
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
    return out;
  }

  function acknowledge(a: Row): Response {
    if (control.failAcknowledge) return pgError(control.failAcknowledge);
    const slug = a.p_campaign_slug as string, req = a.p_requirement as string;
    if (!["athlete", "parent"].includes(req)) return pgError("team_task_ack_invalid_requirement");
    const name = String(a.p_full_name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) return pgError("team_task_ack_invalid_name");
    if (a.p_statement_version !== 1) return pgError("team_task_ack_unknown_statement");
    const t = db.team_tasks.find(x => x.id === a.p_task_id && x.campaign_slug === slug);
    if (!t) return pgError("team_task_ack_task_not_found");
    if (t.status !== "active") return pgError("team_task_ack_task_inactive");
    if (!(t.audience === "both" || t.audience === req)) return pgError("team_task_ack_not_required");
    if (a.p_expected_revision !== t.revision) return pgError("team_task_ack_revision_changed");
    const ids = [...new Set((a.p_athlete_ids as string[] | null ?? []).filter(Boolean))].sort();
    if (ids.length === 0) return pgError("team_task_ack_no_athletes");
    const m = db.team_members.find(x => x.id === a.p_member_id && x.campaign_slug === slug);
    if (!m) return pgError("team_task_ack_member_not_found");
    if ((m.account_id ?? null) !== (a.p_account_id ?? null)) return pgError("team_task_ack_identity_mismatch");
    if (m.role !== req) return pgError("team_task_ack_role_mismatch");
    if (!ids.every(id => linked(m.id, id, req, slug))) return pgError("team_task_ack_athlete_not_linked");
    return json(ids.map(athleteId => {
      const existing = db.team_task_acknowledgments.find(k => k.task_id === t.id && k.task_revision === t.revision &&
        k.athlete_id === athleteId && k.requirement === req && counts(k.member_id, k.account_id, athleteId, req, slug));
      if (existing) return { athlete_id: athleteId, outcome: "already_satisfied", acknowledgment_id: existing.id };
      const row = {
        id: `ack-${++n}`, campaign_slug: slug, task_id: t.id, task_revision: t.revision, requirement: req,
        athlete_id: athleteId, member_id: m.id, account_id: m.account_id ?? null, full_name: name,
        member_name_snapshot: m.name, athlete_name_snapshot: db.athletes.find(x => x.id === athleteId)!.name,
        task_title_snapshot: t.title, statement_version: 1, acknowledged_at: `2026-10-17T10:0${n}:00Z`,
      };
      db.team_task_acknowledgments.push(row);
      return { athlete_id: athleteId, outcome: "recorded", acknowledgment_id: row.id };
    }));
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [resource, query = ""] = path.split("?");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;

    if (control.failPaths.some(p => path.includes(p))) return json({ code: "XX000", message: "boom" }, 500);
    if (resource.startsWith("rpc/")) {
      const name = resource.slice(4);
      rpcCalls.push({ name, args: body });
      if (name === "team_task_ack_status" && control.failStatus) return json({ code: "XX000", message: "boom" }, 500);
      if (mode === "missing" && name.startsWith("team_task_ack")) {
        return json({ code: "PGRST202", message: `Could not find the function public.${name}` }, 404);
      }
      if (name === "team_task_ack_status") return json(ackStatus(body));
      if (name === "team_task_acknowledge") return acknowledge(body);
      return json({ code: "PGRST202", message: "unknown function" }, 404);
    }
    const table = db[resource];
    if (!table) return json([]);
    const params = new URLSearchParams(query);
    if (method === "GET") {
      const rows = filter(table, params).map(r => ({ ...r }));
      return json(resource === "team_tasks" ? rows.map(t => ({ ...t, resources: [] })) : rows);
    }
    if (method === "POST") { table.push({ ...body }); return json([body], 201); }
    return json([]);
  }

  return { db, rpcCalls, control, fetchImpl };
}

async function withWorld<T>(opts: Parameters<typeof makeWorld>[0], run: (w: ReturnType<typeof makeWorld>) => Promise<T>): Promise<T> {
  const w = makeWorld(opts);
  seedTasks(w.db);
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
const as = {
  coach: (p: { id: string; salt: string }) => { clearCookies(); __setTestCookie("team_coach", makeCoachCookie(p.id, p.salt)); },
  member: (m: { id: string; salt: string }) => { clearCookies(); __setTestCookie("team_member", makeMemberCookie(m.id, m.salt)); },
  nobody: () => clearCookies(),
};

function seedTasks(db: Record<string, Row[]>) {
  const mk = (id: string, audience: string, status = "active", slug = SLUG): Row => ({
    id, campaign_slug: slug, title: `Task ${id}`, instructions: null, body_text: null, audience, status, sort_order: 0,
    revision: 1, version: 1, revised_at: "x", created_at: "2026-01-01", updated_at: "x",
    archived_at: status === "archived" ? "x" : null, created_by_name: "Hana Head", updated_by_name: "Hana Head",
  });
  db.team_tasks.push(mk("t-both", "both"), mk("t-ath", "athlete"), mk("t-par", "parent"), mk("t-old", "both", "archived"), mk("t-hawk", "both", "active", OTHER));
}

const base = `http://test.local/api/team/${SLUG}/todo/tasks`;
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ackRoute = () => import("./[taskId]/acknowledgment/route.ts");
const listRoute = () => import("./route.ts");

async function getAck(taskId: string) {
  const { GET } = await ackRoute();
  return GET(req(`${base}/${taskId}/acknowledgment`) as never, { params: Promise.resolve({ slug: SLUG, taskId }) });
}
async function postAck(taskId: string, body: unknown) {
  const { POST } = await ackRoute();
  return POST(req(`${base}/${taskId}/acknowledgment`, "POST", body) as never, { params: Promise.resolve({ slug: SLUG, taskId }) });
}
async function list() {
  const { GET } = await listRoute();
  return GET(req(base) as never, { params: Promise.resolve({ slug: SLUG }) });
}
const ok = (athlete_ids: string[], extra: Row = {}) => ({ expected_revision: 1, full_name: "  Pat   Parent ", confirmed: true, athlete_ids, ...extra });
const ackCalls = (w: ReturnType<typeof makeWorld>) => w.rpcCalls.filter(c => c.name === "team_task_acknowledge");

// ── Athletes ──────────────────────────────────────────────────────────────

test("athlete: sees their own requirement, submits once; repeat is refused; list shows the check", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.athlete);
    const view = (await (await getAck("t-both")).json()).acknowledgment;
    assert.equal(view.requirement, "athlete");
    assert.deepEqual(view.children.map((c: Row) => c.athleteId), ["ath-1"]);
    assert.deepEqual(view.outstandingAthleteIds, ["ath-1"]);
    assert.equal(view.statement.text, "I acknowledge that I have reviewed and understand the information, instructions, links, and documents associated with this task.");
    assert.equal((await (await list()).json()).tasks.find((t: Row) => t.id === "t-both").my_ack, "todo");

    const res = await postAck("t-both", ok(["ath-1"], { full_name: "Ava Athlete" }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.recorded, 1);
    assert.deepEqual(body.acknowledgment.outstandingAthleteIds, []);
    assert.equal(body.acknowledgment.children[0].entries[0].by, "you");

    const again = await postAck("t-both", ok(["ath-1"], { full_name: "Ava Athlete" }));
    assert.equal(again.status, 409);
    assert.equal((await again.json()).reason, "already_satisfied");
    assert.equal(ackCalls(w).length, 1, "the repeat never reached the database");
    assert.equal(w.db.team_task_acknowledgments.length, 1);
    assert.equal((await (await list()).json()).tasks.find((t: Row) => t.id === "t-both").my_ack, "done");
  });
});

// ── Parents ───────────────────────────────────────────────────────────────

test("parent with two children: both shown and covered by one submission; identity from the server only", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    const view = (await (await getAck("t-par")).json()).acknowledgment;
    assert.deepEqual(view.children.map((c: Row) => c.name), ["Ava Athlete", "Jake Jr"]);
    assert.deepEqual([...view.outstandingAthleteIds].sort(), ["ath-1", "ath-2"]);

    // The body tries to smuggle in someone else's identity; it is ignored.
    const res = await postAck("t-par", ok(["ath-2", "ath-1"], { member_id: "m-par2", account_id: "acct-sam", requirement: "athlete" }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).recorded, 2);
    const [call] = ackCalls(w);
    assert.equal(call.args.p_member_id, "m-par");
    assert.equal(call.args.p_account_id, null);          // legacy team-login parent
    assert.equal(call.args.p_requirement, "parent");
    assert.equal(call.args.p_statement_version, 1);
    assert.equal(call.args.p_full_name, "Pat Parent");   // normalized
    assert.deepEqual([...(call.args.p_athlete_ids as string[])].sort(), ["ath-1", "ath-2"]);
    assert.deepEqual(w.db.team_task_acknowledgments.map(k => k.athlete_name_snapshot).sort(), ["Ava Athlete", "Jake Jr"]);
  });
});

test("the browser can't add an athlete it isn't linked to (children_changed, nothing written)", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    for (const shown of [["ath-1", "ath-2", "ath-3"], ["ath-1", "ath-h"], ["ath-1"], []]) {
      const res = await postAck("t-par", ok(shown));
      assert.equal(res.status, 409, JSON.stringify(shown));
      assert.equal((await res.json()).reason, "children_changed");
    }
    assert.equal(ackCalls(w).length, 0);
  });
});

test("one linked parent satisfies the parent requirement; a second parent is told it's done", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    assert.equal((await postAck("t-both", ok(["ath-1", "ath-2"]))).status, 200);

    as.member(MEMBERS.parent2);
    const view = (await (await getAck("t-both")).json()).acknowledgment;
    const parentEntry = view.children[0].entries.find((e: Row) => e.requirement === "parent");
    assert.equal(parentEntry.satisfied, true);
    assert.equal(parentEntry.by, "parent");
    assert.deepEqual(view.outstandingAthleteIds, []);
    assert.ok(!JSON.stringify(view).includes("Pat Parent"), "the other parent's typed name is never shown");
    const res = await postAck("t-both", ok(["ath-1"], { full_name: "Sam Parent" }));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).reason, "already_satisfied");
    assert.equal(ackCalls(w).length, 1);
  });
});

test("coach who is also a linked parent: acknowledges for their own child, as their parent row", async () => {
  await withWorld({}, async w => {
    as.coach(COACHES.assistant);
    const view = (await (await getAck("t-par")).json()).acknowledgment;
    assert.equal(view.requirement, "parent");
    assert.deepEqual(view.children.map((c: Row) => c.athleteId), ["ath-2"]);
    const res = await postAck("t-par", ok(["ath-2"], { full_name: "Ari Asst" }));
    assert.equal(res.status, 200);
    assert.equal(ackCalls(w)[0].args.p_member_id, "m-cpar");
    assert.equal(ackCalls(w)[0].args.p_account_id, "acct-asst");

    // Athlete-only task: nothing asked of a parent.
    assert.equal((await (await getAck("t-ath")).json()).acknowledgment, null);
    const notRequired = await postAck("t-ath", ok(["ath-2"]));
    assert.equal(notRequired.status, 400);
    assert.equal((await notRequired.json()).reason, "not_required");
  });
});

// ── Not allowed ───────────────────────────────────────────────────────────

test("coaches without children, boosters, anonymous visitors and other teams can't acknowledge", async () => {
  await withWorld({}, async w => {
    as.coach(COACHES.head);
    assert.equal((await (await getAck("t-both")).json()).acknowledgment, null);
    assert.equal((await postAck("t-both", ok(["ath-1"]))).status, 403);

    for (const set of [() => as.coach(COACHES.booster), () => as.member(MEMBERS.booster)]) {
      set();
      assert.equal((await getAck("t-both")).status, 404); // boosters can't see tasks at all
      assert.equal((await postAck("t-both", ok(["ath-1"]))).status, 404);
    }

    as.nobody();
    assert.equal((await getAck("t-both")).status, 401);
    assert.equal((await postAck("t-both", ok(["ath-1"]))).status, 401);

    as.member(MEMBERS.hawkPar); // a Hawks parent's session isn't valid on the Wolves team
    assert.equal((await postAck("t-both", ok(["ath-h"]))).status, 401);

    as.member(MEMBERS.parent); // a Wolves parent can't reach a Hawks task through the Wolves team
    assert.equal((await postAck("t-hawk", ok(["ath-1"]))).status, 404);

    assert.equal(ackCalls(w).length, 0);
  });
});

test("platform admins never acknowledge (no family identity)", async () => {
  await withWorld({}, async () => {
    const identity = await resolveAckIdentity({ kind: "platform_admin", session: { platformAdminId: "pa", accountId: "acct-head", name: "Ada", email: "a@x", campaign_slug: SLUG } }, SLUG);
    assert.equal(identity, null);
  });
});

test("audience and task state: other audience 404; archived 404 for families", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    assert.equal((await getAck("t-ath")).status, 404);
    assert.equal((await postAck("t-ath", ok(["ath-1"]))).status, 404);
    as.member(MEMBERS.athlete);
    assert.equal((await postAck("t-par", ok(["ath-1"]))).status, 404);
    assert.equal((await postAck("t-old", ok(["ath-1"]))).status, 404);
    assert.equal(ackCalls(w).length, 0);
  });
});

// ── Revisions, validation, database refusals ─────────────────────────────

test("stale revision is refused before the database; after re-review a new acknowledgment is recorded and history kept", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.athlete);
    assert.equal((await postAck("t-ath", ok(["ath-1"], { full_name: "Ava Athlete" }))).status, 200);
    // The Head Coach changes the task substantively: revision 1 -> 2.
    w.db.team_tasks.find(t => t.id === "t-ath")!.revision = 2;

    const view = (await (await getAck("t-ath")).json()).acknowledgment;
    assert.equal(view.revision, 2);
    assert.equal(view.children[0].entries[0].satisfied, false);
    assert.equal(view.children[0].entries[0].earlierRevision, true);
    assert.equal((await (await list()).json()).tasks.find((t: Row) => t.id === "t-ath").my_ack, "todo");

    const stale = await postAck("t-ath", ok(["ath-1"], { full_name: "Ava Athlete" }));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).reason, "revision_changed");
    assert.equal(ackCalls(w).length, 1);

    assert.equal((await postAck("t-ath", ok(["ath-1"], { expected_revision: 2, full_name: "Ava Athlete" }))).status, 200);
    assert.deepEqual(w.db.team_task_acknowledgments.map(k => k.task_revision), [1, 2]);
  });
});

test("input is validated before the database: name, checkbox, body shape", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.athlete);
    const cases: [Row, number, string][] = [
      [ok(["ath-1"], { full_name: " " }), 400, "invalid_name"],
      [ok(["ath-1"], { full_name: "A" }), 400, "invalid_name"],
      [ok(["ath-1"], { full_name: "x".repeat(121) }), 400, "invalid_name"],
      [ok(["ath-1"], { confirmed: false }), 400, "not_confirmed"],
      [ok(["ath-1"], { confirmed: "yes" }), 400, "not_confirmed"],
      [ok(["ath-1"], { expected_revision: "1" }), 400, "invalid_request"],
      [ok(["ath-1"], { athlete_ids: "ath-1" }), 400, "invalid_request"],
    ];
    for (const [body, status, reason] of cases) {
      const res = await postAck("t-both", body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal((await res.json()).reason, reason);
    }
    assert.equal(ackCalls(w).length, 0);
  });
});

test("database refusals are reported clearly (relationship changed / task changed mid-submit)", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    w.control.failAcknowledge = "team_task_ack_athlete_not_linked";
    let res = await postAck("t-par", ok(["ath-1", "ath-2"]));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).reason, "not_eligible");

    w.control.failAcknowledge = "team_task_ack_revision_changed";
    res = await postAck("t-par", ok(["ath-1", "ath-2"]));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).reason, "revision_changed");
    assert.equal(w.db.team_task_acknowledgments.length, 0);
  });
});

test("an unlinked parent's acknowledgment stops counting; the record is kept", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    assert.equal((await postAck("t-par", ok(["ath-1", "ath-2"]))).status, 200);
    w.db.team_member_athletes = w.db.team_member_athletes.filter(l => l.id !== "l1"); // unlink Pat from Jake
    as.coach(COACHES.assistant); // Jake's other parent
    const view = (await (await getAck("t-par")).json()).acknowledgment;
    assert.equal(view.children[0].entries[0].satisfied, false);
    assert.deepEqual(view.outstandingAthleteIds, ["ath-2"]);
    assert.equal(w.db.team_task_acknowledgments.length, 2);
  });
});

test("audit log: member actor, task and athletes recorded; the typed name is not", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    await postAck("t-par", ok(["ath-1", "ath-2"], { full_name: "Patricia Quinn Parent" }));
    await new Promise(r => setTimeout(r, 0));
    const log = w.db.audit_logs.find(l => l.action === "todo_task.acknowledged")!;
    assert.equal(log.actor_type, "member");
    assert.equal(log.actor_id, "m-par");
    assert.equal(log.entity_id, "t-par");
    assert.ok(!JSON.stringify(log).includes("Patricia"), "the typed full name is not copied into the audit log");
    assert.equal(w.db.team_task_acknowledgments[0].full_name, "Patricia Quinn Parent");
    assert.deepEqual([...((log.new_value as Row).athlete_ids as string[])].sort(), ["ath-1", "ath-2"]);
  });
});

test("missing acknowledgment functions: GET says unavailable, POST 503 (clear message, nothing written), list rows 'unknown'", async () => {
  await withWorld({ mode: "missing" }, async w => {
    as.member(MEMBERS.parent);
    const get = await (await getAck("t-par")).json();
    assert.equal(get.available, false);
    assert.equal(get.acknowledgment, null);
    const post = await postAck("t-par", ok(["ath-1", "ath-2"]));
    assert.equal(post.status, 503);
    assert.equal((await post.json()).error, "Acknowledgments are temporarily unavailable. Please try again.");
    assert.equal(ackCalls(w).length, 0);
    const listed = await list();
    assert.equal(listed.status, 200);
    assert.ok((await listed.json()).tasks.every((t: Row) => t.my_ack === "unknown"));
  });
});

test("coaches' list has no acknowledgment icons (row icons are for athletes and parents)", async () => {
  await withWorld({}, async () => {
    as.coach(COACHES.assistant);
    assert.ok((await (await list()).json()).tasks.every((t: Row) => !("my_ack" in t)));
  });
});

// ── Item 7: a failed lookup is never "done" or "not required" ─────────────

const myAck = async () => Object.fromEntries(((await (await list()).json()).tasks as Row[]).map(t => [t.id, t.my_ack]));

test("linked-child lookup failure: never 'nothing to acknowledge' or done; submission refused; nothing written", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    w.control.failPaths = ["team_member_athletes?"];
    const get = await getAck("t-par");
    assert.equal(get.status, 500);
    assert.ok((await get.json()).error);
    assert.deepEqual(await myAck(), { "t-par": "unknown", "t-both": "unknown" });
    for (const shown of [["ath-1", "ath-2"], ["ath-1"]]) { // full set, and the subset a failed query would have left
      assert.equal((await postAck("t-par", ok(shown))).status, 500, JSON.stringify(shown));
    }
    assert.equal(ackCalls(w).length, 0);
    assert.equal(w.db.team_task_acknowledgments.length, 0);
  });
});

test("a second child hidden by a query error never makes the parent look done", async () => {
  await withWorld({}, async w => {
    // Pat has already acknowledged t-par for Ava (legacy link) only.
    w.db.team_task_acknowledgments.push({ id: "ack-pre", campaign_slug: SLUG, task_id: "t-par", task_revision: 1, requirement: "parent",
      athlete_id: "ath-1", member_id: "m-par", account_id: null, full_name: "Pat Parent", member_name_snapshot: "Pat Parent", acknowledged_at: "x" });
    as.member(MEMBERS.parent);
    assert.equal((await myAck())["t-par"], "todo"); // Jake still outstanding
    w.control.failPaths = ["team_member_athletes?"]; // Jake's link can't be read
    assert.equal((await myAck())["t-par"], "unknown", "not 'done' from the legacy child alone");
    assert.equal((await getAck("t-par")).status, 500);
  });
});

test("identity lookup failure (coach-parent): detail and submit fail visibly; nothing written", async () => {
  await withWorld({}, async w => {
    as.coach(COACHES.assistant);
    for (const failing of ["select=account_id", "role=eq.parent"]) { // their coach row's account; their parent row
      w.control.failPaths = [failing];
      assert.equal((await getAck("t-par")).status, 500, failing);
      assert.equal((await postAck("t-par", ok(["ath-2"], { full_name: "Ari Asst" }))).status, 500, failing);
    }
    assert.equal(ackCalls(w).length, 0);
    assert.equal(w.db.team_task_acknowledgments.length, 0);
  });
});

test("status lookup failure: list 'unknown', detail error, submit refused; nothing written", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.athlete);
    w.control.failStatus = true;
    assert.deepEqual(await myAck(), { "t-both": "unknown", "t-ath": "unknown" });
    assert.equal((await getAck("t-both")).status, 500);
    assert.equal((await postAck("t-both", ok(["ath-1"], { full_name: "Ava Athlete" }))).status, 500);
    assert.equal(ackCalls(w).length, 0);
    assert.equal(w.db.team_task_acknowledgments.length, 0);
  });
});

test("recovery: once lookups work again, status and submission are normal", async () => {
  await withWorld({}, async w => {
    as.member(MEMBERS.parent);
    w.control.failPaths = ["team_member_athletes?"];
    assert.equal((await myAck())["t-par"], "unknown");
    w.control.failPaths = [];
    assert.equal((await myAck())["t-par"], "todo");
    const view = (await (await getAck("t-par")).json()).acknowledgment;
    assert.deepEqual([...view.outstandingAthleteIds].sort(), ["ath-1", "ath-2"]);
    assert.equal((await postAck("t-par", ok(["ath-1", "ath-2"]))).status, 200);
    assert.equal((await myAck())["t-par"], "done");
  });
});

test("genuinely not applicable stays null (athlete account not linked to a roster athlete)", async () => {
  await withWorld({}, async () => {
    as.member(MEMBERS.unlinked);
    assert.ok(Object.values(await myAck()).every(v => v === null));
    const get = await (await getAck("t-both")).json();
    assert.equal(get.available, true);
    assert.deepEqual(get.acknowledgment.children, []);
  });
});
