// Group Messaging G3A — GET /api/team/[slug]/messages/group-directory.
// Same next/server + next/headers stub technique as groups/route.test.ts.
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
    athletes:      [],
    team_members:  [],
    team_coaches:  [],
  };

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr === "not.is.null") return row[field] !== null && row[field] !== undefined;
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

  async function fetchImpl(url: string): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const tableRows = db[table] ?? [];
    return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
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

function seedCoach(db: Record<string, Row[]>, id: string, role: "head_coach" | "assistant_coach" | "booster", name = "Coach") {
  db.team_coaches.push({ id, campaign_slug: SLUG, role, name, salt: `s-${id}` });
}
function seedRosterAthlete(db: Record<string, Row[]>, athleteId: string, name = "Carter Sanders") {
  db.athletes.push({ id: athleteId, campaign_slug: SLUG, name, event: null, class_year: null });
}
function seedJoinedAthlete(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Carter Sanders") {
  seedRosterAthlete(db, athleteId, name);
  db.team_members.push({ id: memberId, campaign_slug: SLUG, role: "athlete", athlete_id: athleteId, name, salt: `s-${memberId}` });
}

async function loadRoute() { return import("./route.ts"); }

test("Head Coach sees the full roster with joined status, excluding themselves from staff", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    seedCoach(db, "ac-1", "assistant_coach");
    seedJoinedAthlete(db, "m-carter", "athlete-carter");
    seedRosterAthlete(db, "athlete-colin", "Colin Morgan");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/group-directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
    const data = await res.json();

    const carter = data.athletes.find((a: Row) => a.id === "athlete-carter");
    const colin  = data.athletes.find((a: Row) => a.id === "athlete-colin");
    assert.equal(carter.joined, true);
    assert.equal(colin.joined, false);
    assert.ok(!("team_member_id" in carter), "must never expose an internal team_members id");

    assert.deepEqual(data.staff.map((s: Row) => s.id), ["ac-1"], "the calling coach must be excluded from the staff list");
  });
});

test("Assistant Coach can access the group directory", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "ac-1", "assistant_coach");
    signInAsCoach({ id: "ac-1", salt: "s-ac-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/group-directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
  });
});

test("Booster is rejected", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "booster-1", "booster");
    signInAsCoach({ id: "booster-1", salt: "s-booster-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/group-directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
  });
});

test("An athlete/member is rejected", async () => {
  await withFakeDb(async db => {
    seedJoinedAthlete(db, "m-carter", "athlete-carter");
    signInAsMember({ id: "m-carter", salt: "s-m-carter" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/group-directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
  });
});

test("An unauthenticated request is rejected", async () => {
  await withFakeDb(async () => {
    clearCookies();
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/group-directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
  });
});

test("parents are never included in the directory", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1", "head_coach");
    db.team_members.push({ id: "m-mom", campaign_slug: SLUG, role: "parent", athlete_id: null, name: "Mom", salt: "s-m-mom" });
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/group-directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.athletes.length, 0);
    assert.ok(!("parents" in data), "the response must never carry a parents field at all");
  });
});
