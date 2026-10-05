// Phase F1a — route-level tests for PATCH /api/admin/campaigns/[slug]'s new
// fundraising_enabled support. Same next/server + next/headers stub
// technique and admin-cookie auth pattern already established by
// src/app/api/admin/athletes/import/route.test.ts, reusing the SHARED
// src/lib/testSupport stubs (not a new local copy).
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_PEPPER   = "test-pepper";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie } = await import("../../../../../lib/testSupport/nextHeadersStub.mjs");
const { getAdminToken } = await import("@/lib/adminAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    campaign_settings: [],
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
    if (method === "PATCH") {
      const patch = JSON.parse(String(init?.body ?? "{}"));
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.campaign_slug));
      for (const row of tableRows) if (matchedIds.has(row.campaign_slug)) Object.assign(row, patch);
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

function authenticate()   { __setTestCookie("elf_admin", getAdminToken() as string); }
function unauthenticate() { __setTestCookie("elf_admin", undefined); }

const SLUG = "wolves";

function seedCampaign(db: Record<string, Row[]>, overrides: Row = {}) {
  db.campaign_settings.push({
    campaign_slug: SLUG, school_name: "Wolves HS", archived: false,
    goal_cents: 100000, deadline: "2026-06-01", allow_coach_fundraising: false,
    fundraising_enabled: true,
    ...overrides,
  });
}

async function loadRoute() { return import("./route.ts"); }

function patchReq(body: unknown): Request {
  return new NextRequest(`http://test.local/api/admin/campaigns/${SLUG}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

test("PATCH /api/admin/campaigns/[slug]: accepts fundraising_enabled=false", async () => {
  await withFakeDb(async db => {
    seedCampaign(db);
    authenticate();
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchReq({ fundraising_enabled: false }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
    assert.equal(db.campaign_settings[0].fundraising_enabled, false);
  });
});

test("PATCH /api/admin/campaigns/[slug]: accepts fundraising_enabled=true", async () => {
  await withFakeDb(async db => {
    seedCampaign(db, { fundraising_enabled: false });
    authenticate();
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchReq({ fundraising_enabled: true }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
    assert.equal(db.campaign_settings[0].fundraising_enabled, true);
  });
});

test("PATCH /api/admin/campaigns/[slug]: an unauthenticated request is rejected and nothing is changed", async () => {
  await withFakeDb(async db => {
    seedCampaign(db, { fundraising_enabled: true });
    unauthenticate();
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchReq({ fundraising_enabled: false }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
    assert.equal(db.campaign_settings[0].fundraising_enabled, true, "no write may occur without admin auth");
  });
});

test("PATCH /api/admin/campaigns/[slug]: toggling fundraising_enabled never touches archived", async () => {
  await withFakeDb(async db => {
    seedCampaign(db, { archived: false, fundraising_enabled: true });
    authenticate();
    const { PATCH } = await loadRoute();
    await PATCH(patchReq({ fundraising_enabled: false }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(db.campaign_settings[0].archived, false, "archived must remain independent of fundraising_enabled");
  });
});

test("PATCH /api/admin/campaigns/[slug]: toggling fundraising_enabled never touches allow_coach_fundraising", async () => {
  await withFakeDb(async db => {
    seedCampaign(db, { allow_coach_fundraising: true, fundraising_enabled: true });
    authenticate();
    const { PATCH } = await loadRoute();
    await PATCH(patchReq({ fundraising_enabled: false }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(db.campaign_settings[0].allow_coach_fundraising, true, "allow_coach_fundraising must remain independent of fundraising_enabled");
  });
});

test("PATCH /api/admin/campaigns/[slug]: toggling archived never touches fundraising_enabled", async () => {
  await withFakeDb(async db => {
    seedCampaign(db, { archived: false, fundraising_enabled: true });
    authenticate();
    const { PATCH } = await loadRoute();
    await PATCH(patchReq({ archived: true }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(db.campaign_settings[0].fundraising_enabled, true, "fundraising_enabled must remain independent of archived");
  });
});

test("PATCH /api/admin/campaigns/[slug]: an unrelated field update (e.g. goal_cents) never changes fundraising_enabled", async () => {
  await withFakeDb(async db => {
    seedCampaign(db, { fundraising_enabled: true, goal_cents: 100000 });
    authenticate();
    const { PATCH } = await loadRoute();
    await PATCH(patchReq({ goal_cents: 250000 }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(db.campaign_settings[0].goal_cents, 250000);
    assert.equal(db.campaign_settings[0].fundraising_enabled, true, "an unrelated save must never implicitly touch fundraising_enabled");
  });
});

test("PATCH /api/admin/campaigns/[slug]: an unknown field is silently ignored, not written", async () => {
  await withFakeDb(async db => {
    seedCampaign(db);
    authenticate();
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchReq({ not_a_real_field: "x", fundraising_enabled: false }) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
    assert.equal(db.campaign_settings[0].not_a_real_field, undefined);
    assert.equal(db.campaign_settings[0].fundraising_enabled, false);
  });
});
