// Group Messaging G1 — route-level authorization tests for
// POST /api/team/[slug]/messages/groups (create),
// PATCH/DELETE /api/team/[slug]/messages/groups/[threadId] (rename/archive),
// POST/DELETE /api/team/[slug]/messages/groups/[threadId]/participants.
// Same next/server + next/headers stub technique as
// family/requests/route.test.ts (Family Relationships Phase D) and
// contacts/route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie } = await import("../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeMemberCookie } = await import("@/lib/memberAuth");
const { makeCoachCookie }  = await import("@/lib/teamAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    team_members:                [],
    team_member_athletes:        [],
    team_coaches:                [],
    message_threads:             [],
    message_thread_participants: [],
    message_thread_athletes:     [],
    athletes:                    [],
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
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
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
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const rows = Array.isArray(body) ? body : [body];
      const created = rows.map(r => ({
        id: genId(table), created_at: new Date().toISOString(),
        is_auto_included: false, is_observer: false, removed_at: null,
        coach_id: null, member_id: null, platform_admin_id: null,
        last_message_at: new Date().toISOString(), last_message_preview: null,
        subject: null, thread_type: "dm", group_name: null, archived_at: null,
        created_by_member_id: null, created_by_platform_admin_id: null,
        ...r,
      }));
      (db[table] ??= []).push(...created);
      return new Response(JSON.stringify(created), { status: 201 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(String(init?.body ?? "{}"));
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      for (const row of tableRows) if (matchedIds.has(row.id)) Object.assign(row, patch);
      return new Response(JSON.stringify(matched.map(r => ({ ...r, ...patch }))), { status: 200 });
    }
    return new Response("not implemented", { status: 500 });
  }

  return { db, fetchImpl };
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
function signInAsMember(member: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_member", makeMemberCookie(member.id, member.salt));
}

const SLUG = "wolves";
const OTHER_SLUG = "hawks";

function seedCoach(db: Record<string, Row[]>, id: string, role: "head_coach" | "assistant_coach" | "booster", slug = SLUG) {
  db.team_coaches.push({ id, campaign_slug: slug, role, name: "Coach", salt: `s-${id}` });
}
// G3A: a roster athlete must exist in the `athletes` table for
// validateAthleteForCampaign to accept its rosterAthleteId — seedAthlete
// seeds BOTH the roster row and a joined team_members row (for "joined
// athlete" test scenarios); seedRosterOnlyAthlete seeds ONLY the roster
// row, for "unjoined" scenarios.
function seedAthlete(db: Record<string, Row[]>, memberId: string, athleteId: string, slug = SLUG) {
  db.athletes.push({ id: athleteId, campaign_slug: slug, name: "Athlete" });
  db.team_members.push({ id: memberId, campaign_slug: slug, role: "athlete", athlete_id: athleteId, name: "Athlete", salt: `s-${memberId}` });
}
function seedRosterOnlyAthlete(db: Record<string, Row[]>, athleteId: string, slug = SLUG) {
  db.athletes.push({ id: athleteId, campaign_slug: slug, name: "Athlete" });
}
function seedParentMember(db: Record<string, Row[]>, memberId: string, slug = SLUG) {
  db.team_members.push({ id: memberId, campaign_slug: slug, role: "parent", athlete_id: null, name: "Parent", salt: `s-${memberId}` });
}

async function loadCreateRoute()       { return import("./route.ts"); }
async function loadManageRoute()       { return import("./[threadId]/route.ts"); }
async function loadParticipantsRoute() { return import("./[threadId]/participants/route.ts"); }

function postCreate(body: unknown): Request {
  return new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

// ── CREATE authorization ────────────────────────────────────────────────────

test("Head Coach can create a group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "Varsity Jumps", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 201);
  });
});

test("Assistant Coach can create a group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "ac-1", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "ac-1", salt: "s-ac-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "Distance Group", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 201);
  });
});

test("Booster is rejected", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "booster-1", "booster");
    signInAsCoach({ id: "booster-1", salt: "s-booster-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: [], staffIds: ["booster-1"] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
    assert.equal((db.message_threads ?? []).length, 0);
  });
});

test("a parent (team_members role=parent) is rejected", async () => {
  await withFakeDb(async db => {
    seedParentMember(db, "m-parent");
    signInAsMember({ id: "m-parent", salt: "s-m-parent" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: [], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
  });
});

test("an athlete (team_members role=athlete) is rejected", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsMember({ id: "m-carter", salt: "s-m-carter" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: [], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
  });
});

test("an unauthenticated/public request is rejected", async () => {
  await withFakeDb(async () => {
    clearCookies();
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: [], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
  });
});

test("a cross-team athlete id is rejected", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-other", "athlete-other", OTHER_SLUG);
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: ["athlete-other"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
    assert.equal(db.message_threads.length, 0);
  });
});

test("a cross-team staff id is rejected", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedCoach(db, "other-coach", "head_coach", OTHER_SLUG);
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: [], staffIds: ["other-coach"] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
    assert.equal(db.message_threads.length, 0);
  });
});

test("name is required", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
  });
});

test("whitespace-only name is rejected", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "   ", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
  });
});

test("name over 80 characters is rejected", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "a".repeat(81), rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
  });
});

test("two groups with identical participants can be created back to back", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res1 = await POST(postCreate({ name: "Varsity Jumps", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const res2 = await POST(postCreate({ name: "State Meet Travel", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);
    const data1 = await res1.json();
    const data2 = await res2.json();
    assert.notEqual(data1.id, data2.id);
  });
});

// ── MANAGEMENT authorization (rename) ──────────────────────────────────────

test("Head Coach can rename any group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedCoach(db, "ac-1", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "ac-1", salt: "s-ac-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "Original", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { PATCH } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
    assert.equal(db.message_threads.find(t => t.id === thread.id)?.group_name, "Renamed");
  });
});

test("the creating Assistant Coach can rename their own group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "ac-1", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "ac-1", salt: "s-ac-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "Original", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { PATCH } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
  });
});

test("a DIFFERENT Assistant Coach cannot rename someone else's group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "ac-1", "assistant_coach");
    seedCoach(db, "ac-2", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "ac-1", salt: "s-ac-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "Original", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    signInAsCoach({ id: "ac-2", salt: "s-ac-2" });
    const { PATCH } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Hijacked" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 403);
  });
});

test("Booster cannot rename a group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedCoach(db, "booster-1", "booster");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "Original", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    signInAsCoach({ id: "booster-1", salt: "s-booster-1" });
    const { PATCH } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "X" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 401);
  });
});

test("a thread from a DIFFERENT campaign is rejected (404)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedCoach(db, "hc-other", "head_coach", OTHER_SLUG);
    seedAthlete(db, "m-other", "athlete-other", OTHER_SLUG);
    signInAsCoach({ id: "hc-other", salt: "s-hc-other" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "Other Team Group", rosterAthleteIds: ["athlete-other"], staffIds: [] }) as never, { params: Promise.resolve({ slug: OTHER_SLUG }) });
    const thread = await created.json();

    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { PATCH } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Stolen" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 404);
  });
});

test("a DM thread is rejected by the group-management API", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    db.message_threads.push({
      id: "dm-thread-1", campaign_slug: SLUG, thread_type: "dm", group_name: null, archived_at: null,
      subject: null, created_by_type: "coach", created_by_coach_id: "hc-1", created_by_member_id: null,
      created_by_platform_admin_id: null, creator_name: "Coach", creator_role: "head_coach",
      last_message_at: new Date().toISOString(), last_message_preview: null, created_at: new Date().toISOString(),
    });
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { PATCH } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/dm-thread-1`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Not a group" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, threadId: "dm-thread-1" }) });
    assert.equal(res.status, 404);
  });
});

// ── Archive (DELETE on groups/[threadId]) ───────────────────────────────────

test("Head Coach can archive a group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, { method: "DELETE" });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
    assert.ok(db.message_threads.find(t => t.id === thread.id)?.archived_at);
  });
});

test("Assistant Coach cannot archive even their own group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "ac-1", "assistant_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "ac-1", salt: "s-ac-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, { method: "DELETE" });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 401);
  });
});

// ── PARTICIPANTS route authorization + behavior ────────────────────────────

test("Head Coach can add a participant to any group", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedAthlete(db, "m-colin", "athlete-colin");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { POST: addParticipants } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteIds: ["athlete-colin"], staffIds: [] }),
    });
    const res = await addParticipants(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
    assert.ok(db.message_thread_participants.some(p => p.thread_id === thread.id && p.member_id === "m-colin"));
  });
});

test("removing a participant via the API soft-removes, never hard-deletes", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteId: "athlete-carter" }),
    });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
    const row = db.message_thread_participants.find(p => p.thread_id === thread.id && p.member_id === "m-carter");
    assert.ok(row, "row must still exist");
    assert.ok(row?.removed_at, "row must be marked removed, not deleted");
  });
});

test("a cross-team athlete cannot be added as a participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedAthlete(db, "m-other", "athlete-other", OTHER_SLUG);
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { POST: addParticipants } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteIds: ["athlete-other"], staffIds: [] }),
    });
    const res = await addParticipants(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 400);
    assert.ok(!db.message_thread_participants.some(p => p.member_id === "m-other"));
  });
});

// ── G1 review correction 1: archived groups are inaccessible (route-level) ──

test("archived group: rename is rejected with 404 (loadManageableGroup can no longer find it)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE: archive } = await loadManageRoute();
    const archiveReq = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, { method: "DELETE" });
    const archiveRes = await archive(archiveReq as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(archiveRes.status, 200);

    const { PATCH } = await loadManageRoute();
    const renameReq = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renamed After Archive" }),
    });
    const res = await PATCH(renameReq as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 404);
    assert.equal(db.message_threads.find(t => t.id === thread.id)?.group_name, "G", "the name must be unchanged");
  });
});

test("archived group: adding a participant is rejected with 404", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedAthlete(db, "m-colin", "athlete-colin");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE: archive } = await loadManageRoute();
    await archive(new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, { method: "DELETE" }) as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });

    const { POST: addParticipants } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteIds: ["athlete-colin"], staffIds: [] }),
    });
    const res = await addParticipants(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 404);
    assert.ok(!db.message_thread_participants.some(p => p.member_id === "m-colin"));
  });
});

test("archived group: removing a participant is rejected with 404", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE: archive } = await loadManageRoute();
    await archive(new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, { method: "DELETE" }) as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });

    const { DELETE: removeParticipant } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteId: "athlete-carter" }),
    });
    const res = await removeParticipant(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group Messaging G3A — rosterAthleteIds / roster assignment (route-level)
// ═══════════════════════════════════════════════════════════════════════════

test("G3A: the legacy athleteIds shape is rejected outright on create, never silently reinterpreted", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", athleteIds: ["m-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
    assert.equal(db.message_threads.length, 0, "no group must be created from the obsolete shape");
  });
});

test("G3A: a roster-only (never-joined) athlete can be selected for group creation", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedRosterOnlyAthlete(db, "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "Varsity Long Jump", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 201);
    const thread = await res.json();
    assert.ok(!db.message_thread_participants.some(p => p.thread_id === thread.id && p.member_id === "athlete-carter"), "no fake participant for the unjoined athlete");
    assert.ok(db.message_thread_athletes.some((a: Row) => a.thread_id === thread.id && a.athlete_id === "athlete-carter"), "roster assignment must still be recorded");
  });
});

test("G3A: a cross-team roster athlete id is rejected even though it exists in the athletes table (different campaign)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedRosterOnlyAthlete(db, "athlete-other", OTHER_SLUG);
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: ["athlete-other"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
    assert.equal(db.message_threads.length, 0);
  });
});

test("G3A: a nonexistent roster athlete id is rejected", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST } = await loadCreateRoute();
    const res = await POST(postCreate({ name: "G", rosterAthleteIds: ["athlete-does-not-exist"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
    assert.equal(db.message_threads.length, 0);
  });
});

test("G3A: the legacy athleteIds shape is rejected outright on Add People too", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedAthlete(db, "m-colin", "athlete-colin");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { POST: addParticipants } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athleteIds: ["m-colin"], staffIds: [] }),
    });
    const res = await addParticipants(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 400);
  });
});

test("G3A: Add People accepts a roster-only athlete", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedRosterOnlyAthlete(db, "athlete-colin");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { POST: addParticipants } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteIds: ["athlete-colin"], staffIds: [] }),
    });
    const res = await addParticipants(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
    assert.ok(db.message_thread_athletes.some((a: Row) => a.thread_id === thread.id && a.athlete_id === "athlete-colin"));
    assert.ok(!db.message_thread_participants.some(p => p.thread_id === thread.id && p.member_id === "athlete-colin"));
  });
});

test("G3A: a cross-team roster athlete cannot be added as a participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    seedRosterOnlyAthlete(db, "athlete-other", OTHER_SLUG);
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { POST: addParticipants } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteIds: ["athlete-other"], staffIds: [] }),
    });
    const res = await addParticipants(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 400);
  });
});

test("G3A: the legacy athleteId shape is rejected outright on remove", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ athleteId: "m-carter" }),
    });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 400);
  });
});

test("G3A: removing via rosterAthleteId soft-removes the roster assignment and the joined participant", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteId: "athlete-carter" }),
    });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);

    const assignment = db.message_thread_athletes.find((a: Row) => a.thread_id === thread.id && a.athlete_id === "athlete-carter");
    assert.ok(assignment?.removed_at, "the roster assignment must be soft-removed, not deleted");
    const participant = db.message_thread_participants.find(p => p.thread_id === thread.id && p.member_id === "m-carter");
    assert.ok(participant?.removed_at, "the joined athlete's participant row must also be soft-removed");
  });
});

test("G3A: removing a roster-only athlete that was never joined succeeds cleanly", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedRosterOnlyAthlete(db, "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteId: "athlete-carter" }),
    });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
  });
});

test("G3A: a non-manager (booster) cannot remove a roster athlete", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedCoach(db, "booster-1", "booster");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    signInAsCoach({ id: "booster-1", salt: "s-booster-1" });
    const { DELETE } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteId: "athlete-carter" }),
    });
    const res = await DELETE(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 401);
  });
});

test("G3A: archived group rejects a rosterAthleteId removal with 404", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { DELETE: archive } = await loadManageRoute();
    await archive(new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, { method: "DELETE" }) as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });

    const { DELETE: removeParticipant } = await loadParticipantsRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}/participants`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rosterAthleteId: "athlete-carter" }),
    });
    const res = await removeParticipant(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 404);
  });
});

test("active group rename still works normally (unaffected by the archived check)", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedAthlete(db, "m-carter", "athlete-carter");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { POST: createGroup } = await loadCreateRoute();
    const created = await createGroup(postCreate({ name: "G", rosterAthleteIds: ["athlete-carter"], staffIds: [] }) as never, { params: Promise.resolve({ slug: SLUG }) });
    const thread = await created.json();

    const { PATCH } = await loadManageRoute();
    const req = new NextRequest(`http://test.local/api/team/${SLUG}/messages/groups/${thread.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ slug: SLUG, threadId: thread.id }) });
    assert.equal(res.status, 200);
  });
});
