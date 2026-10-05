// Phase F1c — /api/checkout server-side archived/fundraising_enabled gate.
// Same technique as other route tests in this repo (nextStubLoader.mjs for
// next/server), against a fetch-mocked in-memory Supabase layer. The
// Stripe call itself (a raw fetch to api.stripe.com, no SDK) is intercepted
// by the same fetch mock — tests assert on whether that URL was ever hit,
// which is the only way to prove "no Stripe Checkout Session was created"
// for this route's implementation.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.STRIPE_SECRET_KEY         = "sk_test_fake";

register(new URL("../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../lib/testSupport/nextServerStub.mjs");

type Row = Record<string, unknown>;

const SLUG = "wolves";

function makeFakeWorld() {
  const db: Record<string, Row[]> = {
    campaign_settings: [],
  };
  const stripeCalls: { url: string; body: string }[] = [];

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

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    if (url.startsWith("https://api.stripe.com")) {
      stripeCalls.push({ url, body: String(init?.body ?? "") });
      return new Response(
        JSON.stringify({ id: "cs_test_fake", url: "https://checkout.stripe.com/pay/cs_test_fake" }),
        { status: 200 },
      );
    }

    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
  }

  return { db, stripeCalls, fetchImpl };
}

async function withFakeWorld<T>(run: (ctx: ReturnType<typeof makeFakeWorld>) => Promise<T>): Promise<T> {
  const ctx = makeFakeWorld();
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
    goal_cents:    500000,
    deadline:      "2099-01-01",
    ...overrides,
  });
}

async function loadRoute() {
  return import("./route.ts");
}

function checkoutRequest(body: Record<string, unknown>): Request {
  return new NextRequest("http://test.local/api/checkout", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.1" },
    body:    JSON.stringify(body),
  });
}

const VALID_BODY = { amountCents: 2500, donorName: "Pat Donor", campaignSlug: SLUG };

// ── Archived/disabled combinations are all rejected before Stripe ──────────

test("archived=true + fundraising_enabled=true -> rejected, Stripe NOT called", async () => {
  await withFakeWorld(async ({ db, stripeCalls }) => {
    seedCampaign(db, { archived: true, fundraising_enabled: true });
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest(VALID_BODY) as never);
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.error, "This fundraiser is not currently accepting donations.");
    assert.equal(stripeCalls.length, 0);
  });
});

test("archived=true + fundraising_enabled=false -> rejected, Stripe NOT called", async () => {
  await withFakeWorld(async ({ db, stripeCalls }) => {
    seedCampaign(db, { archived: true, fundraising_enabled: false });
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest(VALID_BODY) as never);
    assert.equal(res.status, 403);
    assert.equal(stripeCalls.length, 0);
  });
});

test("archived=false + fundraising_enabled=false -> rejected, Stripe NOT called", async () => {
  await withFakeWorld(async ({ db, stripeCalls }) => {
    seedCampaign(db, { archived: false, fundraising_enabled: false });
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest(VALID_BODY) as never);
    assert.equal(res.status, 403);
    assert.equal(stripeCalls.length, 0);
  });
});

// ── Active campaign: existing behavior preserved exactly ───────────────────

test("archived=false + fundraising_enabled=true -> existing successful checkout path, Stripe IS called", async () => {
  await withFakeWorld(async ({ db, stripeCalls }) => {
    seedCampaign(db, { archived: false, fundraising_enabled: true });
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest(VALID_BODY) as never);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.url, "https://checkout.stripe.com/pay/cs_test_fake");
    assert.equal(stripeCalls.length, 1);
  });
});

// ── Backwards-compatible fallback ───────────────────────────────────────────

test("fundraising_enabled missing/null on a valid settings row -> treated as enabled (backwards compatible)", async () => {
  await withFakeWorld(async ({ db, stripeCalls }) => {
    // No fundraising_enabled key at all — simulates an older/unmigrated row.
    seedCampaign(db, { archived: false });
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest(VALID_BODY) as never);
    assert.equal(res.status, 200);
    assert.equal(stripeCalls.length, 1);
  });
});

test("fundraising_enabled explicitly null -> treated as enabled (backwards compatible)", async () => {
  await withFakeWorld(async ({ db, stripeCalls }) => {
    seedCampaign(db, { archived: false, fundraising_enabled: null });
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest(VALID_BODY) as never);
    assert.equal(res.status, 200);
    assert.equal(stripeCalls.length, 1);
  });
});

// ── Missing/invalid campaign: rejected before Stripe, distinct from an
//    inactive-but-real fundraiser ───────────────────────────────────────────

test("a nonexistent campaignSlug (no campaign_settings row) is rejected with 404, Stripe NOT called", async () => {
  await withFakeWorld(async ({ stripeCalls }) => {
    // No campaign_settings row at all for this slug.
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest({ ...VALID_BODY, campaignSlug: "does-not-exist" }) as never);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.error, "Campaign not found.");
    assert.equal(stripeCalls.length, 0);
  });
});

// ── Pre-existing validation still works unchanged ───────────────────────────

test("missing campaignSlug is still rejected the pre-existing way (400), before any state gate", async () => {
  await withFakeWorld(async ({ stripeCalls }) => {
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest({ amountCents: 2500 }) as never);
    assert.equal(res.status, 400);
    assert.equal(stripeCalls.length, 0);
  });
});

test("an amount below the minimum is still rejected the pre-existing way (400), before any state gate", async () => {
  await withFakeWorld(async ({ db, stripeCalls }) => {
    seedCampaign(db, { archived: false, fundraising_enabled: true });
    const { POST } = await loadRoute();
    const res = await POST(checkoutRequest({ amountCents: 50, campaignSlug: SLUG }) as never);
    assert.equal(res.status, 400);
    assert.equal(stripeCalls.length, 0);
  });
});
