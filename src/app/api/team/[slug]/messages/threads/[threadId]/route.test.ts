// Group Messaging G3B — GET /api/team/[slug]/messages/threads/[threadId]
// now also returns rosterAssignments for a group thread (G3A's
// getGroupRosterAssignments), the data source ManageGroupModal needs to
// represent roster ASSIGNMENT rather than merely current
// message_thread_participants. Same next/server + next/headers stub
// technique as groups/route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";

register(new URL("../../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie } = await import("../../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeCoachCookie } = await import("@/lib/teamAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    athletes:                    [],
    team_members:                [],
    team_coaches:                [],
    message_threads:             [],
    message_thread_participants: [],
    message_thread_athletes:     [],
    messages:                    [],
    message_reads:               [],
  };
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr === "is.null") return row[field] === null || row[field] === undefined;
    if (expr.startsWith("in.(") && expr.endsWith(")")) {
      const ids = expr.slice(4, -1).split(",").map(decodeURIComponent);
      return ids.includes(String(row[field]));
    }
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order") continue;
      rows = rows.filter(r => matches(r, key, val));
    }
    return rows.map(r => ({ ...r }));
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const method = init?.method ?? "GET";
    const tableRows = db[table] ?? [];
    if (method === "GET") {
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }
    return new Response("not implemented", { status: 500 });
  }

  return { db, fetchImpl, genId };
}

async function withFakeDb<T>(run: (db: Record<string, Row[]>) => Promise<T>): Promise<T> {
  const { db, fetchImpl } = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    return await run(db);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function clearCookies() {
  __setTestCookie("elf_session", undefined);
  __setTestCookie("team_member", undefined);
  __setTestCookie("team_coach", undefined);
}
function signInAsCoach(coach: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_coach", makeCoachCookie(coach.id, coach.salt));
}

const SLUG = "wolves";

function seedCoach(db: Record<string, Row[]>, id: string, name = "Coach") {
  db.team_coaches.push({ id, campaign_slug: SLUG, role: "head_coach", name, salt: `s-${id}` });
}

async function loadRoute() { return import("./route.ts"); }

test("GET thread detail: a GROUP thread includes rosterAssignments", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    db.athletes.push({ id: "athlete-carter", campaign_slug: SLUG, name: "Carter Sanders" });
    db.message_threads.push({
      id: "group-1", campaign_slug: SLUG, thread_type: "group", group_name: "Varsity Long Jump", archived_at: null,
      subject: null, created_by_type: "coach", created_by_coach_id: "coach-1", created_by_member_id: null,
      created_by_platform_admin_id: null, creator_name: "Coach", creator_role: "head_coach",
      last_message_at: new Date().toISOString(), last_message_preview: null, created_at: new Date().toISOString(),
    });
    db.message_thread_participants.push({
      id: "p-coach", thread_id: "group-1", actor_type: "coach", coach_id: "coach-1", member_id: null,
      platform_admin_id: null, is_auto_included: false, is_observer: false, removed_at: null,
    });
    db.message_thread_athletes.push({ id: "a1", thread_id: "group-1", athlete_id: "athlete-carter", removed_at: null });

    signInAsCoach({ id: "coach-1", salt: "s-coach-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/threads/group-1`) as never, { params: Promise.resolve({ slug: SLUG, threadId: "group-1" }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.rosterAssignments));
    assert.deepEqual(data.rosterAssignments.map((a: Row) => a.athlete_id), ["athlete-carter"]);
  });
});

test("GET thread detail: a DM thread never returns rosterAssignments", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "coach-1");
    db.message_threads.push({
      id: "dm-1", campaign_slug: SLUG, thread_type: "dm", group_name: null, archived_at: null,
      subject: null, created_by_type: "coach", created_by_coach_id: "coach-1", created_by_member_id: null,
      created_by_platform_admin_id: null, creator_name: "Coach", creator_role: "head_coach",
      last_message_at: new Date().toISOString(), last_message_preview: null, created_at: new Date().toISOString(),
    });
    db.message_thread_participants.push({
      id: "p-coach", thread_id: "dm-1", actor_type: "coach", coach_id: "coach-1", member_id: null,
      platform_admin_id: null, is_auto_included: false, is_observer: false, removed_at: null,
    });

    signInAsCoach({ id: "coach-1", salt: "s-coach-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/threads/dm-1`) as never, { params: Promise.resolve({ slug: SLUG, threadId: "dm-1" }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.rosterAssignments, undefined);
  });
});

test("GET thread detail: an unauthenticated request is still rejected", async () => {
  await withFakeDb(async () => {
    clearCookies();
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/threads/group-1`) as never, { params: Promise.resolve({ slug: SLUG, threadId: "group-1" }) });
    assert.equal(res.status, 401);
  });
});
