// Family Relationships Phase B — canonical family-resolution helper tests.
// Fetch-mocked against a small in-memory fake of the Supabase PostgREST
// layer, same approach as parentAccessRequests.test.ts/bulkImportAthletes.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const teamMembers:       Row[] = [];
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
    function roleIn(): string[] | null {
      return inList("role");
    }

    if (table === "team_members") {
      let rows = teamMembers;
      const accountId = eq("account_id");
      const campaignSlug = eq("campaign_slug");
      const athleteId = eq("athlete_id");
      const ids = inList("id");
      const roles = roleIn();
      if (accountId) rows = rows.filter(r => r.account_id === accountId);
      if (campaignSlug) rows = rows.filter(r => r.campaign_slug === campaignSlug);
      if (athleteId) rows = rows.filter(r => r.athlete_id === athleteId);
      if (ids) rows = rows.filter(r => ids.includes(r.id as string));
      if (roles) rows = rows.filter(r => roles.includes(r.role as string));
      const limit = params.get("limit");
      if (limit) rows = rows.slice(0, Number(limit));
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

async function loadModule() {
  return import("./familyRelationships.ts");
}

// ── getLinkedAthleteIdsForMember ──────────────────────────────────────────

test("A. legacy single-child parent still resolves their child", async () => {
  await withFakeDb(async () => {
    const { getLinkedAthleteIdsForMember } = await loadModule();
    const ids = await getLinkedAthleteIdsForMember("member-1", "athlete-emma");
    assert.deepEqual(ids, ["athlete-emma"]);
  });
});

test("B. a join-table-only second child resolves correctly", async () => {
  await withFakeDb(async ({ teamMemberAthletes }) => {
    teamMemberAthletes.push({ team_member_id: "member-1", athlete_id: "athlete-jake" });
    const { getLinkedAthleteIdsForMember } = await loadModule();
    const ids = await getLinkedAthleteIdsForMember("member-1", "athlete-emma");
    assert.deepEqual(ids.sort(), ["athlete-emma", "athlete-jake"]);
  });
});

test("C. legacy column and a join-table row for the SAME athlete dedupe to one id", async () => {
  await withFakeDb(async ({ teamMemberAthletes }) => {
    teamMemberAthletes.push({ team_member_id: "member-1", athlete_id: "athlete-emma" });
    const { getLinkedAthleteIdsForMember } = await loadModule();
    const ids = await getLinkedAthleteIdsForMember("member-1", "athlete-emma");
    assert.deepEqual(ids, ["athlete-emma"]);
  });
});

test("D. one parent linked to two children — both resolve", async () => {
  await withFakeDb(async ({ teamMemberAthletes }) => {
    teamMemberAthletes.push(
      { team_member_id: "member-1", athlete_id: "athlete-emma" },
      { team_member_id: "member-1", athlete_id: "athlete-jake" },
    );
    const { getLinkedAthleteIdsForMember } = await loadModule();
    const ids = await getLinkedAthleteIdsForMember("member-1", null);
    assert.deepEqual(ids.sort(), ["athlete-emma", "athlete-jake"]);
  });
});

// ── getFamilyAthleteIdsForAccount (account_id + campaign_slug keyed) ──────

test("account-based resolver: works for an ordinary parent (legacy column)", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push({ id: "member-1", role: "parent", athlete_id: "athlete-emma", account_id: "acct-sarah", campaign_slug: "wolves" });
    const { getFamilyAthleteIdsForAccount } = await loadModule();
    const ids = await getFamilyAthleteIdsForAccount("acct-sarah", "wolves");
    assert.deepEqual(ids, ["athlete-emma"]);
  });
});

test("F/G. coach (and assistant coach) with a parent relationship — family resolver finds their child by account_id, independent of authorization kind", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    // Phase A made this account resolve as kind:"coach" for authorization —
    // the family resolver must not require a "member" actor at all, only
    // account_id + campaign_slug, since a coach-kind actor has no
    // team_members.id of its own to look up by.
    teamMembers.push({ id: "member-mike", role: "parent", athlete_id: "athlete-emma", account_id: "acct-mike", campaign_slug: "wolves" });
    const { getFamilyAthleteIdsForAccount } = await loadModule();
    const ids = await getFamilyAthleteIdsForAccount("acct-mike", "wolves");
    assert.deepEqual(ids, ["athlete-emma"]);
  });
});

test("account-based resolver: a coach-only account (no team_members row at all) resolves to no family athletes", async () => {
  await withFakeDb(async () => {
    const { getFamilyAthleteIdsForAccount } = await loadModule();
    const ids = await getFamilyAthleteIdsForAccount("acct-coach-only", "wolves");
    assert.deepEqual(ids, []);
  });
});

test("H. cross-team isolation — a parent linked to Athlete A on Team 1 gains no access on Team 2", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push({ id: "member-1", role: "parent", athlete_id: "athlete-a", account_id: "acct-sarah", campaign_slug: "team-1" });
    const { getFamilyAthleteIdsForAccount } = await loadModule();
    const team1Ids = await getFamilyAthleteIdsForAccount("acct-sarah", "team-1");
    const team2Ids = await getFamilyAthleteIdsForAccount("acct-sarah", "team-2");
    assert.deepEqual(team1Ids, ["athlete-a"]);
    assert.deepEqual(team2Ids, []);
  });
});

test("I. a pending-only relationship (no live team_members/team_member_athletes row) does NOT count as approved family access", async () => {
  // This module never queries parent_access_requests at all — simulated
  // here simply by there being no team_members row yet for this account,
  // which is exactly the state of a still-pending request.
  await withFakeDb(async () => {
    const { getFamilyAthleteIdsForAccount } = await loadModule();
    const ids = await getFamilyAthleteIdsForAccount("acct-pending-parent", "wolves");
    assert.deepEqual(ids, []);
  });
});

// ── getFamilyMembersForAthlete (athlete -> guardians, for messaging/push) ──

test("E. two parents linked to one athlete via the legacy column — both discovered", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push(
      { id: "member-athlete", role: "athlete", athlete_id: "athlete-emma", account_id: "acct-emma", campaign_slug: "wolves" },
      { id: "member-mom", role: "parent", athlete_id: "athlete-emma", account_id: "acct-mom", campaign_slug: "wolves" },
      { id: "member-dad", role: "parent", athlete_id: "athlete-emma", account_id: "acct-dad", campaign_slug: "wolves" },
    );
    const { getFamilyMembersForAthlete } = await loadModule();
    const members = await getFamilyMembersForAthlete("athlete-emma", "wolves");
    assert.deepEqual(members.map(m => m.id).sort(), ["member-athlete", "member-dad", "member-mom"]);
  });
});

test("E (join-table guardian): a second parent linked ONLY via team_member_athletes is still discovered", async () => {
  await withFakeDb(async ({ teamMembers, teamMemberAthletes }) => {
    teamMembers.push(
      { id: "member-athlete", role: "athlete", athlete_id: "athlete-emma", account_id: "acct-emma", campaign_slug: "wolves" },
      { id: "member-mom", role: "parent", athlete_id: "athlete-emma", account_id: "acct-mom", campaign_slug: "wolves" },
      { id: "member-dad", role: "parent", athlete_id: null, account_id: "acct-dad", campaign_slug: "wolves" },
    );
    teamMemberAthletes.push({ team_member_id: "member-dad", athlete_id: "athlete-emma" });

    const { getFamilyMembersForAthlete } = await loadModule();
    const members = await getFamilyMembersForAthlete("athlete-emma", "wolves");
    assert.deepEqual(members.map(m => m.id).sort(), ["member-athlete", "member-dad", "member-mom"]);
  });
});

test("H (athlete-side). cross-team isolation — only same-campaign guardians are returned", async () => {
  await withFakeDb(async ({ teamMembers, teamMemberAthletes }) => {
    teamMembers.push(
      { id: "member-athlete", role: "athlete", athlete_id: "athlete-emma", account_id: "acct-emma", campaign_slug: "team-1" },
      // A member row that happens to link to the same athlete id but lives
      // on a different campaign must never be returned.
      { id: "member-other-team", role: "parent", athlete_id: null, account_id: "acct-stranger", campaign_slug: "team-2" },
    );
    teamMemberAthletes.push({ team_member_id: "member-other-team", athlete_id: "athlete-emma" });

    const { getFamilyMembersForAthlete } = await loadModule();
    const members = await getFamilyMembersForAthlete("athlete-emma", "team-1");
    assert.deepEqual(members.map(m => m.id), ["member-athlete"]);
  });
});

test("N. existing single-role/single-child behavior is unchanged end to end", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push({ id: "member-1", role: "parent", athlete_id: "athlete-emma", account_id: "acct-sarah", campaign_slug: "wolves" });
    const { getFamilyAthleteIdsForAccount, getLinkedAthleteIdsForMember } = await loadModule();
    assert.deepEqual(await getFamilyAthleteIdsForAccount("acct-sarah", "wolves"), ["athlete-emma"]);
    assert.deepEqual(await getLinkedAthleteIdsForMember("member-1", "athlete-emma"), ["athlete-emma"]);
  });
});
