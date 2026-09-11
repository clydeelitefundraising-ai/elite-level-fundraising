// Integration-shaped tests for Coach Fundraising Participation, using a
// small in-memory fake of the Supabase PostgREST layer (mocking
// globalThis.fetch) — same approach as parentAccessRequests.test.ts.
// Purpose-built to exactly the query shapes coachFundraising.ts actually
// issues, rather than a fully generic PostgREST emulator.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: { campaign_settings: Row[]; team_coaches: Row[]; campaign_coach_fundraisers: Row[]; donations: Row[] } = {
    campaign_settings: [],
    team_coaches: [],
    campaign_coach_fundraisers: [],
    donations: [],
  };
  let nextId = 1;
  const genId = () => `id-${nextId++}`;

  function parseFilters(qs: string): { table: string; params: URLSearchParams } {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }

  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr === "is.null") return row[field] === null || row[field] === undefined;
    if (expr === "not.is.null") return row[field] !== null && row[field] !== undefined;
    if (expr.startsWith("in.(") && expr.endsWith(")")) {
      const ids = expr.slice(4, -1).split(",");
      return ids.includes(String(row[field]));
    }
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order") continue;
      rows = rows.filter(r => matchesFilter(r, key, val));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function handle(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace("https://fake.supabase.co/rest/v1/", "");
    const { table, params } = parseFilters(path);
    const method = init?.method ?? "GET";
    const tableRows = db[table as keyof typeof db];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });

    if (method === "GET") {
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(init!.body as string);
      const row: Row = { id: genId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init!.body as string);
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      const updated: Row[] = [];
      for (const row of tableRows) {
        if (matchedIds.has(row.id)) {
          Object.assign(row, patch);
          updated.push({ ...row });
        }
      }
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }

  return { db, handle };
}

const { db, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { getCoachFundraisers, getActiveCoachFundraisers, validateCoachForCampaign, upsertCoachParticipant, getCoachById, getCoachTotals } =
  await import("./coachFundraising.ts");

function resetDb() {
  db.campaign_settings.length = 0;
  db.team_coaches.length = 0;
  db.campaign_coach_fundraisers.length = 0;
  db.donations.length = 0;
}

const SLUG = "monroe-valley";

function seedCampaign(allowCoachFundraising: boolean) {
  db.campaign_settings.push({ campaign_slug: SLUG, allow_coach_fundraising: allowCoachFundraising });
}

function seedCoach(id: string, role: "head_coach" | "assistant_coach" | "booster", name = "Coach " + id) {
  db.team_coaches.push({ id, campaign_slug: SLUG, name, role });
}

test("validateCoachForCampaign: booster cannot become a participant even with an active row", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("booster-1", "booster", "Stephanie Nielsen");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "booster-1", active: true, goal_cents: null });
  assert.equal(await validateCoachForCampaign("booster-1", SLUG), false);
});

test("upsertCoachParticipant: rejects a booster at the data layer too (defense in depth)", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("booster-1", "booster");
  const result = await upsertCoachParticipant(SLUG, "booster-1", { active: true, goal_cents: 50000 });
  assert.equal(result.ok, false);
  assert.equal(db.campaign_coach_fundraisers.length, 0);
});

test("validateCoachForCampaign: assistant coach can participate when selected and active", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("assist-1", "assistant_coach", "Rachel Moreno");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "assist-1", active: true, goal_cents: 75000 });
  assert.equal(await validateCoachForCampaign("assist-1", SLUG), true);
});

test("validateCoachForCampaign: head coach can participate when selected and active", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: 100000 });
  assert.equal(await validateCoachForCampaign("head-1", SLUG), true);
});

test("validateCoachForCampaign: allow_coach_fundraising=false blocks attribution even with an active row", async () => {
  resetDb();
  seedCampaign(false); // feature disabled at the campaign level
  seedCoach("head-1", "head_coach");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: null });
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("validateCoachForCampaign: never inferred solely from row existence — an inactive row blocks new attribution", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: false, goal_cents: null });
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("validateCoachForCampaign: no participation row at all is not a participant", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach");
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("upsertCoachParticipant: deactivating (active=false) does not delete the row or its history", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach");
  const first = await upsertCoachParticipant(SLUG, "head-1", { active: true, goal_cents: 100000 });
  assert.equal(first.ok, true);
  assert.equal(db.campaign_coach_fundraisers.length, 1);

  const second = await upsertCoachParticipant(SLUG, "head-1", { active: false, goal_cents: 100000 });
  assert.equal(second.ok, true);
  // Row still exists, just inactive — never deleted.
  assert.equal(db.campaign_coach_fundraisers.length, 1);
  assert.equal(db.campaign_coach_fundraisers[0].active, false);
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("getCoachFundraisers: lists every participation row regardless of active state (historical visibility)", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: false, goal_cents: 50000 });
  const all = await getCoachFundraisers(SLUG);
  assert.equal(all.length, 1);
  assert.equal(all[0].name, "Mike Owens");
});

test("getActiveCoachFundraisers: only returns active rows for a campaign with the flag on", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  seedCoach("assist-1", "assistant_coach", "Rachel Moreno");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: 100000 });
  db.campaign_coach_fundraisers.push({ id: "row-2", campaign_slug: SLUG, coach_id: "assist-1", active: false, goal_cents: 50000 });
  const active = await getActiveCoachFundraisers(SLUG);
  assert.equal(active.length, 1);
  assert.equal(active[0].coach_id, "head-1");
});

test("getCoachById: resolves an active participant's public-safe name", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: null });
  const coach = await getCoachById("head-1", SLUG);
  assert.equal(coach?.name, "Mike Owens");
});

test("getCoachById: returns null for a non-participant, deselected, or booster coach id — never fishable", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");   // never selected
  seedCoach("assist-1", "assistant_coach", "Rachel Moreno");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "assist-1", active: false, goal_cents: null }); // deselected
  seedCoach("booster-1", "booster", "Stephanie Nielsen");
  db.campaign_coach_fundraisers.push({ id: "row-2", campaign_slug: SLUG, coach_id: "booster-1", active: true, goal_cents: null });

  assert.equal(await getCoachById("head-1", SLUG), null);
  assert.equal(await getCoachById("assist-1", SLUG), null);
  assert.equal(await getCoachById("booster-1", SLUG), null);
  assert.equal(await getCoachById("nonexistent", SLUG), null);
});

test("getCoachTotals: id-first, grouped by coach_id, in cents", async () => {
  resetDb();
  db.donations.push({ campaign_slug: SLUG, coach_id: "head-1", amount_cents: 5000 });
  db.donations.push({ campaign_slug: SLUG, coach_id: "head-1", amount_cents: 2500 });
  db.donations.push({ campaign_slug: SLUG, coach_id: null, athlete_id: "ath-1", amount_cents: 1000 });
  const totals = await getCoachTotals(SLUG);
  assert.equal(totals["head-1"], 7500);
  assert.equal(Object.keys(totals).length, 1);
});
