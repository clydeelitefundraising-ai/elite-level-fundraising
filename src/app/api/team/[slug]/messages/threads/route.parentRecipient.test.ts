// Direct API requests: POST /api/team/[slug]/messages/threads and
// /threads/resolve can't start a conversation with a parent no one can sign
// in as (messageRecipients.ts), whatever the client sends — and still work
// for eligible parents, legacy team-code parents inside their session
// window, and existing conversations. Real getTeamActor() with a signed
// coach cookie; fetch-mocked PostgREST.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie } = await import("../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeCoachCookie } = await import("@/lib/teamAuth");

type Row = Record<string, unknown>;
const SLUG = "wolves";
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function makeWorld() {
  const db: Record<string, Row[]> = {
    campaign_settings: [{ campaign_slug: SLUG, season_completed_at: null, successor_campaign_slug: null }],
    team_coaches: [
      { id: "c-asst", campaign_slug: SLUG, role: "assistant_coach", name: "Avi Assistant", salt: "s-asst", account_id: null },
      { id: "c-head", campaign_slug: SLUG, role: "head_coach", name: "Hana Head", salt: "s-head", account_id: null },
    ],
    team_members: [
      { id: "m-fay", campaign_slug: SLUG, role: "athlete", athlete_id: "a-fay", name: "Fay Freshman", account_id: null, created_at: daysAgo(200) },
      { id: "m-tess", campaign_slug: SLUG, role: "parent", athlete_id: "a-fay", name: "Tess Two", account_id: "acct-tess", created_at: daysAgo(200) },
      { id: "m-nora", campaign_slug: SLUG, role: "parent", athlete_id: "a-fay", name: "Nora NoAccount", account_id: null, created_at: null },
      { id: "m-old", campaign_slug: SLUG, role: "parent", athlete_id: "a-fay", name: "Ola Old", account_id: null, created_at: daysAgo(60) },
      { id: "m-new", campaign_slug: SLUG, role: "parent", athlete_id: "a-fay", name: "Leo Legacy", account_id: null, created_at: daysAgo(2) },
    ],
    team_member_athletes: [], user_blocks: [], message_threads: [], message_thread_participants: [], message_thread_athletes: [], messages: [],
  };
  let n = 0;
  const matches = (row: Row, field: string, expr: string) => {
    if (expr.startsWith("eq.")) return String(row[field]) === decodeURIComponent(expr.slice(3));
    if (expr === "is.null") return row[field] == null;
    if (expr.startsWith("in.(")) return expr.slice(4, -1).split(",").map(decodeURIComponent).includes(String(row[field]));
    return true;
  };
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const method = init?.method ?? "GET";
    if (table.startsWith("rpc/")) return new Response("null", { status: 200 });
    const rows = (db[table] ??= []);
    if (method === "GET") {
      let out = rows;
      for (const [k, v] of params.entries()) if (!["select", "limit", "order", "offset"].includes(k)) out = out.filter(r => matches(r, k, v));
      const limit = params.get("limit");
      return new Response(JSON.stringify((limit ? out.slice(0, +limit) : out).map(r => ({ ...r }))), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const created = (Array.isArray(body) ? body : [body]).map(r => ({
        id: `${table}-${++n}`, created_at: new Date().toISOString(), removed_at: null, is_observer: false, is_auto_included: false,
        coach_id: null, member_id: null, platform_admin_id: null, thread_type: "dm", archived_at: null, ...r,
      }));
      rows.push(...created);
      return new Response(JSON.stringify(created), { status: 201 });
    }
    if (method === "PATCH") return new Response("[]", { status: 200 });
    return new Response("null", { status: 200 });
  }
  return { db, fetchImpl };
}

async function withWorld(run: (db: Record<string, Row[]>) => Promise<void>) {
  const { db, fetchImpl } = makeWorld();
  const real = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  __setTestCookie("team_member", undefined);
  __setTestCookie("elf_session", undefined);
  __setTestCookie("team_coach", makeCoachCookie("c-asst", "s-asst"));
  try { await run(db); } finally { globalThis.fetch = real; __setTestCookie("team_coach", undefined); }
}

async function post(path: "" | "/resolve", body: Row) {
  const mod = path ? await import("./resolve/route.ts") : await import("./route.ts");
  const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/threads${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return mod.POST(req as never, { params: Promise.resolve({ slug: SLUG }) });
}

test("direct API: a parent with no account (no join date, or joined more than 30 days ago) is refused with an explanation", async () => {
  for (const id of ["m-nora", "m-old"]) {
    for (const path of ["", "/resolve"] as const) {
      await withWorld(async db => {
        const res = await post(path, { recipient_actor_type: "member", recipient_id: id, body: "Hi" });
        assert.equal(res.status, 422, `${id} ${path}`);
        assert.match((await res.json()).error, /doesn't have an active ELF account/);
        assert.equal(db.message_threads.length, 0, "no conversation created");
        assert.equal(db.messages.length, 0, "no message stored");
      });
    }
  }
});

test("direct API: a parent with an account, and a legacy parent inside their session window, can be messaged", async () => {
  for (const id of ["m-tess", "m-new"]) {
    await withWorld(async db => {
      const res = await post("", { recipient_actor_type: "member", recipient_id: id, body: "Hi" });
      assert.equal(res.status, 201, id);
      assert.equal(db.message_threads.length, 1);
      const parts = db.message_thread_participants;
      assert.ok(parts.some(p => p.member_id === "m-fay" && !p.is_observer), "athlete included (parent oversight)");
      assert.ok(parts.some(p => p.coach_id === "c-head" && p.is_observer), "head coach oversight on an assistant's conversation");
    });
  }
});

test("direct API: an existing conversation with a parent who can no longer sign in is reused, not refused", async () => {
  await withWorld(async db => {
    // Ola's family conversation with the assistant, from when they could sign in.
    db.message_threads.push({ id: "t-old", campaign_slug: SLUG, thread_type: "dm", archived_at: null, subject: null, created_at: daysAgo(50) });
    for (const p of [
      { coach_id: "c-asst", is_observer: false }, { member_id: "m-old", is_observer: false }, { member_id: "m-fay", is_observer: false },
      { member_id: "m-tess", is_observer: false }, { member_id: "m-nora", is_observer: false }, { member_id: "m-new", is_observer: false },
      { coach_id: "c-head", is_observer: true },
    ]) {
      db.message_thread_participants.push({
        id: `p-${db.message_thread_participants.length}`, thread_id: "t-old", actor_type: p.coach_id ? "coach" : "member",
        coach_id: null, member_id: null, platform_admin_id: null, removed_at: null, is_auto_included: false, ...p,
      });
    }
    const res = await post("", { recipient_actor_type: "member", recipient_id: "m-old", body: "Following up" });
    assert.equal(res.status, 200, "reused");
    assert.equal(db.message_threads.length, 1, "no new conversation");
    assert.equal(db.messages.length, 1);
  });
});

test("direct API: another team's parent or an unknown id is never resolved", async () => {
  await withWorld(async db => {
    db.team_members.push({ id: "m-elsewhere", campaign_slug: "hawks", role: "parent", athlete_id: "a-x", name: "Other", account_id: "acct-x", created_at: daysAgo(1) });
    for (const id of ["m-elsewhere", "m-missing"]) {
      const res = await post("", { recipient_actor_type: "member", recipient_id: id, body: "Hi" });
      assert.equal(res.status, 404, id);
    }
    assert.equal(db.message_threads.length, 0);
  });
});
