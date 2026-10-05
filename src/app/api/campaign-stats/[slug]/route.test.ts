// Phase F1c — /api/campaign-stats/[slug] archived/fundraising_enabled data
// minimization. Same technique as other route tests: nextStubLoader.mjs
// stubs next/server, a fetch mock fakes the Supabase REST layer. Tests
// assert both on the response SHAPE (no fundraising-sensitive fields for an
// inactive campaign) and on which REST tables were actually queried (proof
// the donations/athletes/sponsors/fund-uses fetches were skipped).
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

type Row = Record<string, unknown>;

const SLUG = "wolves";

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    campaign_settings: [],
    donations:         [],
    athletes:          [],
    sponsors:          [],
    fund_uses:         [],
    campaign_coach_fundraisers: [],
  };
  const queriedTables: string[] = [];

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
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function fetchImpl(url: string): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    queriedTables.push(table);
    const params = new URLSearchParams(query ?? "");
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
  }

  return { db, queriedTables, fetchImpl };
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

function seedCampaign(db: Record<string, Row[]>, overrides: Partial<Row> = {}) {
  db.campaign_settings.push({
    campaign_slug: SLUG,
    school_name:   "Wolves HS",
    sport_name:    "Track",
    mascot:        "Wolves",
    season:        "Spring 2026",
    goal_cents:    500000,
    deadline:      "2099-01-01",
    ...overrides,
  });
}

function seedDonation(db: Record<string, Row[]>) {
  db.donations.push({
    id: "d1", campaign_slug: SLUG, amount_cents: 2500, donor_name: "Pat Donor",
    athlete_id: null, athlete_name: null, donation_message: null, created_at: new Date().toISOString(),
  });
}

async function loadRoute() {
  return import("./route.ts");
}

async function getStats(slug: string) {
  const { GET } = await loadRoute();
  return GET(new Request(`http://test.local/api/campaign-stats/${slug}`) as never, { params: Promise.resolve({ slug }) });
}

const SENSITIVE_FIELDS = [
  "goal", "displayGoal", "daysLeft", "athletes", "sponsors", "fund_uses", "coaches",
  "primary_color", "secondary_color", "theme_primary_color", "theme_secondary_color",
  "theme_accent_color", "theme_button_color", "location", "logo_url", "description",
  "layout_variant", "show_leaderboard", "show_program_identity", "show_share_section",
  "show_fund_uses", "show_recent_donations", "show_sponsors", "show_donation_card",
];

// ── Inactive combinations: minimal payload, no unnecessary queries ─────────

test("archived=true + fundraising_enabled=true -> minimal ended-state payload, no donation/athlete/sponsor queries", async () => {
  await withFakeDb(async ({ db, queriedTables }) => {
    seedCampaign(db, { archived: true, fundraising_enabled: true });
    seedDonation(db); // present in the DB but must never be fetched/returned
    const res = await getStats(SLUG);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.archived, true);
    assert.equal(data.school_name, "Wolves HS");
    assert.equal(data.sport_name, "Track");
    assert.equal(data.season, "Spring 2026");
    assert.equal(data.raised, 0);
    assert.equal(data.donors, 0);
    assert.deepEqual(data.recentDonations, []);
    for (const field of SENSITIVE_FIELDS) {
      assert.equal(field in data, false, `unexpected field present: ${field}`);
    }

    assert.equal(queriedTables.includes("donations"), false, "donations table was queried");
    assert.equal(queriedTables.includes("athletes"), false, "athletes table was queried");
    assert.equal(queriedTables.includes("sponsors"), false, "sponsors table was queried");
    assert.equal(queriedTables.includes("fund_uses"), false, "fund_uses table was queried");
    assert.equal(queriedTables.includes("campaign_settings"), true, "campaign_settings should still be queried once");
  });
});

test("archived=true + fundraising_enabled=false -> archived precedence, minimal payload", async () => {
  await withFakeDb(async ({ db, queriedTables }) => {
    seedCampaign(db, { archived: true, fundraising_enabled: false });
    const res = await getStats(SLUG);
    const data = await res.json();

    assert.equal(data.archived, true);
    assert.equal(data.fundraising_enabled, false);
    assert.equal(queriedTables.includes("donations"), false);
  });
});

test("archived=false + fundraising_enabled=false -> minimal not-started payload, no unnecessary fundraising data", async () => {
  await withFakeDb(async ({ db, queriedTables }) => {
    seedCampaign(db, { archived: false, fundraising_enabled: false });
    seedDonation(db);
    const res = await getStats(SLUG);
    const data = await res.json();

    assert.equal(data.archived, false);
    assert.equal(data.fundraising_enabled, false);
    assert.equal(data.raised, 0);
    assert.equal(data.donors, 0);
    for (const field of SENSITIVE_FIELDS) {
      assert.equal(field in data, false, `unexpected field present: ${field}`);
    }
    assert.equal(queriedTables.includes("donations"), false);
    assert.equal(queriedTables.includes("athletes"), false);
    assert.equal(queriedTables.includes("sponsors"), false);
  });
});

// ── Active campaign: existing full payload unchanged ────────────────────────

test("archived=false + fundraising_enabled=true -> existing full stats payload, unchanged", async () => {
  await withFakeDb(async ({ db, queriedTables }) => {
    seedCampaign(db, { archived: false, fundraising_enabled: true });
    seedDonation(db);
    const res = await getStats(SLUG);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.raised, 25);
    assert.equal(data.donors, 1);
    assert.equal(data.archived, false);
    assert.equal(data.fundraising_enabled, true);
    assert.equal(typeof data.goal, "number");
    assert.ok(Array.isArray(data.recentDonations));
    assert.equal(data.recentDonations.length, 1);
    assert.equal(queriedTables.includes("donations"), true);
  });
});

// ── Backwards compatibility ──────────────────────────────────────────────

test("missing/null fundraising_enabled on a valid row -> existing live compatibility behavior (full payload)", async () => {
  await withFakeDb(async ({ db, queriedTables }) => {
    seedCampaign(db, { archived: false }); // no fundraising_enabled key at all
    seedDonation(db);
    const res = await getStats(SLUG);
    const data = await res.json();

    assert.equal(data.fundraising_enabled, true);
    assert.equal(data.raised, 25);
    assert.equal(queriedTables.includes("donations"), true);
  });
});

// ── Missing campaign: existing behavior preserved ───────────────────────────

test("a nonexistent campaign still falls through to the existing full-fetch path (no settings row to gate on)", async () => {
  await withFakeDb(async ({ queriedTables }) => {
    const res = await getStats("does-not-exist");
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.raised, 0);
    assert.equal(queriedTables.includes("donations"), true);
  });
});
