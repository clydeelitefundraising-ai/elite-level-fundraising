// resolveRequiredFamilyParticipants — Family Relationships Phase B.
//
// A separate file from messages.test.ts deliberately: messages.ts's module
// body reads NEXT_PUBLIC_SUPABASE_URL into a top-level `const BASE` the
// moment it's imported, and messages.test.ts already statically imports
// messages.ts (for its many pure-function tests, which need no env vars) —
// by the time this file's env-var setup would run, that import would
// already be resolved with an unset BASE. Keeping this fetch-mocked suite
// in its own file, which sets the env vars BEFORE dynamically importing
// messages.ts, avoids that import-order trap entirely (same reasoning as
// parentAccessRequests.test.ts/familyRelationships.test.ts).
//
// This is the function the audit found only discovered relationships via
// the legacy team_members.athlete_id column — these tests prove it now
// unions that column with team_member_athletes, via the canonical helper.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const teamMembers: Row[] = [];
  const teamMemberAthletes: Row[] = [];

  async function fetchImpl(url: string): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query);

    function eq(field: string): string | null {
      const raw = params.get(field);
      return raw?.startsWith("eq.") ? decodeURIComponent(raw.slice(3)) : null;
    }
    function inList(field: string): string[] | null {
      const raw = params.get(field);
      if (!raw?.startsWith("in.(")) return null;
      return raw.slice(4, -1).split(",").map(decodeURIComponent);
    }

    if (table === "team_members") {
      let rows = teamMembers;
      const ids = inList("id");
      const campaignSlug = eq("campaign_slug");
      const athleteId = eq("athlete_id");
      const rolesRaw = params.get("role");
      if (ids) rows = rows.filter(r => ids.includes(r.id as string));
      if (campaignSlug) rows = rows.filter(r => r.campaign_slug === campaignSlug);
      if (athleteId) rows = rows.filter(r => r.athlete_id === athleteId);
      if (rolesRaw?.startsWith("in.(")) {
        const roles = rolesRaw.slice(4, -1).split(",");
        rows = rows.filter(r => roles.includes(r.role as string));
      }
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (table === "team_member_athletes") {
      let rows = teamMemberAthletes;
      const memberId = eq("team_member_id");
      const athleteId = eq("athlete_id");
      if (memberId) rows = rows.filter(r => r.team_member_id === memberId);
      if (athleteId) rows = rows.filter(r => r.athlete_id === athleteId);
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    return new Response("not implemented", { status: 500 });
  }

  return { teamMembers, teamMemberAthletes, fetchImpl };
}

async function withFakeDb<T>(run: (ctx: ReturnType<typeof makeFakeDb>) => Promise<T>): Promise<T> {
  const ctx = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = ctx.fetchImpl as typeof fetch;
  try {
    return await run(ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function loadMessages() {
  return import("./messages.ts");
}

test("J. messaging Athlete B includes a parent linked ONLY via team_member_athletes", async () => {
  await withFakeDb(async ({ teamMembers, teamMemberAthletes }) => {
    teamMembers.push(
      { id: "athlete-b-member", role: "athlete", athlete_id: "athlete-b", campaign_slug: "wolves" },
      { id: "parent-member", role: "parent", athlete_id: "athlete-a", campaign_slug: "wolves" }, // legacy column points at a DIFFERENT child
    );
    teamMemberAthletes.push({ team_member_id: "parent-member", athlete_id: "athlete-b" }); // second child, join-table only

    const { resolveRequiredFamilyParticipants } = await loadMessages();
    const result = await resolveRequiredFamilyParticipants(["athlete-b-member"], "wolves");

    assert.deepEqual(result.map(r => r.member_id).sort(), ["athlete-b-member", "parent-member"]);
  });
});

test("two parents linked to the same athlete both resolve as required participants", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push(
      { id: "athlete-member", role: "athlete", athlete_id: "athlete-a", campaign_slug: "wolves" },
      { id: "mom-member", role: "parent", athlete_id: "athlete-a", campaign_slug: "wolves" },
      { id: "dad-member", role: "parent", athlete_id: "athlete-a", campaign_slug: "wolves" },
    );
    const { resolveRequiredFamilyParticipants } = await loadMessages();
    const result = await resolveRequiredFamilyParticipants(["athlete-member"], "wolves");
    assert.deepEqual(result.map(r => r.member_id).sort(), ["athlete-member", "dad-member", "mom-member"]);
  });
});

test("a parent linked to two children resolves correctly for a thread about either one", async () => {
  await withFakeDb(async ({ teamMembers, teamMemberAthletes }) => {
    teamMembers.push(
      { id: "emma-member", role: "athlete", athlete_id: "athlete-emma", campaign_slug: "wolves" },
      { id: "jake-member", role: "athlete", athlete_id: "athlete-jake", campaign_slug: "wolves" },
      { id: "parent-member", role: "parent", athlete_id: "athlete-emma", campaign_slug: "wolves" },
    );
    teamMemberAthletes.push({ team_member_id: "parent-member", athlete_id: "athlete-jake" });

    const { resolveRequiredFamilyParticipants } = await loadMessages();

    const forEmma = await resolveRequiredFamilyParticipants(["emma-member"], "wolves");
    assert.deepEqual(forEmma.map(r => r.member_id).sort(), ["emma-member", "parent-member"]);

    const forJake = await resolveRequiredFamilyParticipants(["jake-member"], "wolves");
    assert.deepEqual(forJake.map(r => r.member_id).sort(), ["jake-member", "parent-member"]);
  });
});

test("H. campaign-scoped — a same-athlete-id row on a different campaign is never included", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push(
      { id: "athlete-member", role: "athlete", athlete_id: "athlete-a", campaign_slug: "wolves" },
      { id: "other-team-member", role: "parent", athlete_id: "athlete-a", campaign_slug: "falcons" },
    );
    const { resolveRequiredFamilyParticipants } = await loadMessages();
    const result = await resolveRequiredFamilyParticipants(["athlete-member"], "wolves");
    assert.deepEqual(result.map(r => r.member_id), ["athlete-member"]);
  });
});

test("F/G. a coach who is also a parent is still correctly discovered as a family participant by their member seed", async () => {
  // Family resolution operates on team_members rows directly (never on
  // TeamActor.kind), so a coach-as-parent account is found here exactly
  // like any other parent — Phase A's authorization change is orthogonal.
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push(
      { id: "emma-member", role: "athlete", athlete_id: "athlete-emma", campaign_slug: "wolves" },
      { id: "mike-member", role: "parent", athlete_id: "athlete-emma", campaign_slug: "wolves", account_id: "acct-mike" },
    );
    const { resolveRequiredFamilyParticipants } = await loadMessages();
    const result = await resolveRequiredFamilyParticipants(["emma-member"], "wolves");
    assert.deepEqual(result.map(r => r.member_id).sort(), ["emma-member", "mike-member"]);
  });
});

test("N. existing single-child/single-parent thread resolution is unchanged", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push(
      { id: "athlete-member", role: "athlete", athlete_id: "athlete-a", campaign_slug: "wolves" },
      { id: "parent-member", role: "parent", athlete_id: "athlete-a", campaign_slug: "wolves" },
    );
    const { resolveRequiredFamilyParticipants } = await loadMessages();
    const result = await resolveRequiredFamilyParticipants(["parent-member"], "wolves");
    assert.deepEqual(result.map(r => r.member_id).sort(), ["athlete-member", "parent-member"]);
  });
});
