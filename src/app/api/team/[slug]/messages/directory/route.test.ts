// Group Messaging G3C bugfix — GET /api/team/[slug]/messages/directory.
// The Athlete branch now returns the FULL roster (joined or not); Parent and
// Coach branches are explicitly verified UNCHANGED. Same next/server +
// next/headers stub technique as groups/route.test.ts.
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
const { makeCoachCookie } = await import("@/lib/teamAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    athletes:      [],
    team_members:  [],
    team_coaches:  [],
  };

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
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

function signInAsCoach(coach: { id: string; salt: string }) {
  __setTestCookie("team_coach", makeCoachCookie(coach.id, coach.salt));
}

const SLUG = "wolves";
const OTHER_SLUG = "hawks";

function seedCoach(db: Record<string, Row[]>, id: string, role: "head_coach" | "assistant_coach" = "head_coach", slug = SLUG) {
  db.team_coaches.push({ id, campaign_slug: slug, role, name: "Coach", salt: `s-${id}`, elf_accounts: null });
}
function seedRosterAthlete(db: Record<string, Row[]>, athleteId: string, name = "Carter Sanders", slug = SLUG) {
  db.athletes.push({ id: athleteId, campaign_slug: slug, name, event: "Long Jump", class_year: "JR", profile_photo: null });
}
function seedJoinedAthlete(db: Record<string, Row[]>, memberId: string, athleteId: string, name = "Carter Sanders", slug = SLUG) {
  seedRosterAthlete(db, athleteId, name, slug);
  db.team_members.push({
    id: memberId, campaign_slug: slug, role: "athlete", athlete_id: athleteId, name, salt: `s-${memberId}`,
    athletes: { profile_photo: null }, elf_accounts: null,
  });
}
function seedParentMember(db: Record<string, Row[]>, memberId: string, name = "Mom", slug = SLUG) {
  db.team_members.push({
    id: memberId, campaign_slug: slug, role: "parent", athlete_id: null, name, salt: `s-${memberId}`,
    athletes: null, elf_accounts: null,
  });
}

async function loadRoute() { return import("./route.ts"); }

test("GET directory: the full roster is returned, including a never-joined athlete", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1");
    seedJoinedAthlete(db, "m-carter", "athlete-carter", "Carter Sanders");
    seedRosterAthlete(db, "athlete-colin", "Colin Morgan");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.athletes.length, 2);

    const carter = data.athletes.find((a: Row) => a.athleteId === "athlete-carter");
    assert.equal(carter.joined, true);
    assert.equal(carter.teamMemberId, "m-carter");

    const colin = data.athletes.find((a: Row) => a.athleteId === "athlete-colin");
    assert.equal(colin.joined, false);
    assert.equal(colin.teamMemberId, null);
  });
});

test("GET directory: roster-only team has an empty team_members table but a non-empty athlete array", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1");
    seedRosterAthlete(db, "athlete-carter", "Carter Sanders");
    seedRosterAthlete(db, "athlete-colin", "Colin Morgan");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.athletes.length, 2, "the UC Riverside bug: an imported-but-unjoined roster must never render as an empty athletes array");
    assert.ok(data.athletes.every((a: Row) => a.joined === false));
    assert.ok(data.athletes.every((a: Row) => a.teamMemberId === null));
  });
});

test("GET directory: a cross-campaign team_members row never marks a roster athlete joined", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1");
    seedRosterAthlete(db, "athlete-carter", "Carter Sanders");
    // Same athleteId coincidentally reused on another campaign's member row
    // — must never leak across campaigns.
    db.team_members.push({
      id: "m-other-team", campaign_slug: OTHER_SLUG, role: "athlete", athlete_id: "athlete-carter", name: "Carter Sanders", salt: "s-other",
      athletes: null, elf_accounts: null,
    });
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    const carter = data.athletes.find((a: Row) => a.athleteId === "athlete-carter");
    assert.equal(carter.joined, false);
    assert.equal(carter.teamMemberId, null);
  });
});

test("GET directory: athleteId is always athletes.id, teamMemberId is always team_members.id — never swapped", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1");
    seedJoinedAthlete(db, "m-carter", "athlete-carter", "Carter Sanders");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.athletes[0].athleteId, "athlete-carter");
    assert.equal(data.athletes[0].teamMemberId, "m-carter");
  });
});

test("GET directory: parent branch is unchanged — joined parents only, same shape as before", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1");
    seedParentMember(db, "m-mom", "Mom");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.parents.length, 1);
    assert.equal(data.parents[0].id, "m-mom");
    assert.equal(data.parents[0].name, "Mom");
    assert.ok(!("athleteId" in data.parents[0]), "parent entries must keep their existing shape, not the new athlete shape");
  });
});

test("GET directory: coach branch is unchanged — excludes the calling coach's own id", async () => {
  await withFakeDb(async db => {
    seedCoach(db, "hc-1");
    seedCoach(db, "ac-1", "assistant_coach");
    signInAsCoach({ id: "hc-1", salt: "s-hc-1" });
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.deepEqual(data.coaches.map((c: Row) => c.id), ["ac-1"]);
  });
});

test("GET directory: an unauthenticated request is rejected", async () => {
  await withFakeDb(async () => {
    __setTestCookie("team_coach", undefined);
    __setTestCookie("team_member", undefined);
    __setTestCookie("elf_session", undefined);
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest(`http://test.local/api/team/${SLUG}/messages/directory`) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
  });
});
