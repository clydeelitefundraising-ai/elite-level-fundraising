// Family Relationships Phase A regression coverage for getActorForAccount()
// — the function that had the coach-as-parent authorization bug (a
// head_coach/assistant_coach who was also a parent on the same team used to
// silently resolve as a plain member, losing all coach authorization).
//
// A module resolution hook (testSupport/nextStubLoader.mjs) lets the real
// accountSession.ts be imported directly under `node --test` — it only
// redirects "next/headers" to a minimal stub and resolves the project's
// "@/*" alias; it changes nothing about accountSession.ts itself. Supabase
// REST calls are mocked via globalThis.fetch, same approach used elsewhere
// in this repo (parentAccessRequests.test.ts, bulkImportAthletes.test.ts).
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

register(new URL("./testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

type Row = Record<string, unknown>;

function makeFakeDb() {
  const teamCoaches:  Row[] = [];
  const teamMembers:  Row[] = [];

  async function fetchImpl(url: string): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const filters = new URLSearchParams(query);

    const source = table === "team_coaches" ? teamCoaches : table === "team_members" ? teamMembers : [];
    const accountId = filters.get("account_id")?.replace("eq.", "");
    const slug       = filters.get("campaign_slug")?.replace("eq.", "");

    const rows = source.filter(r => r.account_id === accountId && r.campaign_slug === slug);
    return new Response(JSON.stringify(rows), { status: 200 });
  }

  return { teamCoaches, teamMembers, fetchImpl };
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

async function loadAccountSession() {
  return import("./accountSession.ts");
}

const account = { id: "acct-1", name: "Mike", email: "mike@example.com", profile_photo_url: null };

test("getActorForAccount: Head Coach only — resolves coach/head_coach exactly as before", async () => {
  await withFakeDb(async ({ teamCoaches }) => {
    teamCoaches.push({ id: "c1", name: "Mike", role: "head_coach", campaign_slug: "wolves", account_id: "acct-1" });
    const { getActorForAccount } = await loadAccountSession();
    const actor = await getActorForAccount("wolves", account);
    assert.equal(actor?.kind, "coach");
    assert.equal(actor?.kind === "coach" && actor.session.role, "head_coach");
  });
});

test("getActorForAccount: Parent only — resolves member/parent exactly as before", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push({ id: "m1", name: "Sarah", role: "parent", campaign_slug: "wolves", account_id: "acct-1", athlete_id: "ath-1" });
    const { getActorForAccount } = await loadAccountSession();
    const actor = await getActorForAccount("wolves", account);
    assert.equal(actor?.kind, "member");
    assert.equal(actor?.kind === "member" && actor.session.role, "parent");
    assert.equal(actor?.kind === "member" && actor.session.athlete_id, "ath-1");
  });
});

test("getActorForAccount: Head Coach + Parent on the SAME campaign resolves Head Coach (the bug this phase fixes)", async () => {
  await withFakeDb(async ({ teamCoaches, teamMembers }) => {
    teamCoaches.push({ id: "c1", name: "Mike", role: "head_coach", campaign_slug: "wolves", account_id: "acct-1" });
    teamMembers.push({ id: "m1", name: "Mike", role: "parent", campaign_slug: "wolves", account_id: "acct-1", athlete_id: "ath-1" });
    const { getActorForAccount } = await loadAccountSession();
    const actor = await getActorForAccount("wolves", account);
    assert.equal(actor?.kind, "coach");
    assert.equal(actor?.kind === "coach" && actor.session.role, "head_coach");
  });
});

test("getActorForAccount: Assistant Coach + Parent on the SAME campaign resolves Assistant Coach", async () => {
  await withFakeDb(async ({ teamCoaches, teamMembers }) => {
    teamCoaches.push({ id: "c1", name: "Mike", role: "assistant_coach", campaign_slug: "wolves", account_id: "acct-1" });
    teamMembers.push({ id: "m1", name: "Mike", role: "parent", campaign_slug: "wolves", account_id: "acct-1", athlete_id: "ath-1" });
    const { getActorForAccount } = await loadAccountSession();
    const actor = await getActorForAccount("wolves", account);
    assert.equal(actor?.kind, "coach");
    assert.equal(actor?.kind === "coach" && actor.session.role, "assistant_coach");
  });
});

test("getActorForAccount: Booster-coach + Parent on the SAME campaign still resolves Parent (unchanged booster behavior)", async () => {
  await withFakeDb(async ({ teamCoaches, teamMembers }) => {
    teamCoaches.push({ id: "c1", name: "Mike", role: "booster", campaign_slug: "wolves", account_id: "acct-1" });
    teamMembers.push({ id: "m1", name: "Mike", role: "parent", campaign_slug: "wolves", account_id: "acct-1", athlete_id: "ath-1" });
    const { getActorForAccount } = await loadAccountSession();
    const actor = await getActorForAccount("wolves", account);
    assert.equal(actor?.kind, "member");
    assert.equal(actor?.kind === "member" && actor.session.role, "parent");
  });
});

test("getActorForAccount: Coach on Team A + Parent on Team B — each campaign resolves independently, no cross-team leakage", async () => {
  await withFakeDb(async ({ teamCoaches, teamMembers }) => {
    teamCoaches.push({ id: "c1", name: "Mike", role: "head_coach", campaign_slug: "team-a", account_id: "acct-1" });
    teamMembers.push({ id: "m1", name: "Mike", role: "parent", campaign_slug: "team-b", account_id: "acct-1", athlete_id: "ath-1" });
    const { getActorForAccount } = await loadAccountSession();

    const actorA = await getActorForAccount("team-a", account);
    assert.equal(actorA?.kind, "coach");
    assert.equal(actorA?.kind === "coach" && actorA.session.role, "head_coach");

    const actorB = await getActorForAccount("team-b", account);
    assert.equal(actorB?.kind, "member");
    assert.equal(actorB?.kind === "member" && actorB.session.role, "parent");
  });
});

test("getActorForAccount: neither a coach nor a member row for this campaign resolves null", async () => {
  await withFakeDb(async () => {
    const { getActorForAccount } = await loadAccountSession();
    const actor = await getActorForAccount("wolves", account);
    assert.equal(actor, null);
  });
});

test("getActorForAccount: Athlete-only member account is unaffected", async () => {
  await withFakeDb(async ({ teamMembers }) => {
    teamMembers.push({ id: "m1", name: "Emma", role: "athlete", campaign_slug: "wolves", account_id: "acct-1", athlete_id: "ath-1" });
    const { getActorForAccount } = await loadAccountSession();
    const actor = await getActorForAccount("wolves", account);
    assert.equal(actor?.kind, "member");
    assert.equal(actor?.kind === "member" && actor.session.role, "athlete");
  });
});
