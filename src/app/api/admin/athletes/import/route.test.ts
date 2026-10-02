// HTTP-layer tests for POST /api/admin/athletes/import — closing the
// route-handler test gap identified in the Roster Import Phase 1 safety
// audit. bulkImportAthletes.test.ts already covers the per-row write
// service in depth; this file exercises the route's OWN code: the auth
// gate, campaign validation, and — most importantly — that the route never
// trusts client-supplied status/duplicate-classification/metadata fields,
// and that "Import Anyway" only fires on a literal boolean true.
//
// Same module resolution hook as parse/route.test.ts; see its header
// comment for how real route.ts files get imported under `node --test`.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ADMIN_PASSWORD = "test-password";
process.env.ADMIN_PEPPER   = "test-pepper";

register(new URL("./testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("./testSupport/nextHeadersStub.mjs");
const { getAdminToken } = await import("@/lib/adminAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    campaign_settings: [{ campaign_slug: "wolves" }],
    athletes:          [],
  };
  let nextId = 1;

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const method = init?.method ?? "GET";
    db[table] = db[table] ?? [];

    if (method === "GET") {
      const slugMatch = (query ?? "").match(/campaign_slug=eq\.([^&]+)/);
      const slug = slugMatch ? decodeURIComponent(slugMatch[1]) : null;
      const rows = db[table].filter(r => !slug || r.campaign_slug === slug);
      return new Response(JSON.stringify(rows), { status: 200 });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const row: Row = { id: `ath-${nextId++}`, created_at: new Date().toISOString(), ...body };
      db[table].push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }

    return new Response("not implemented", { status: 500 });
  }

  return { db, fetchImpl };
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

async function loadRoute() {
  return import("./route.ts");
}

function authenticate() { __setTestCookie("elf_admin", getAdminToken() as string); }
function unauthenticate() { __setTestCookie("elf_admin", undefined); }

function postJson(body: unknown): Request {
  return new Request("http://test.local/api/admin/athletes/import", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

test("POST /import: unauthenticated request is rejected with 401", async () => {
  await withFakeDb(async ({ db }) => {
    unauthenticate();
    const { POST } = await loadRoute();
    const res = await POST(postJson({
      campaign_slug: "wolves",
      rows: [{ rowNumber: 1, name: "Mason Brooks", class_year: "Freshman" }],
    }) as never);
    assert.equal(res.status, 401);
    assert.equal(db.athletes.length, 0);
  });
});

test("POST /import: a nonexistent campaign is rejected", async () => {
  await withFakeDb(async () => {
    authenticate();
    const { POST } = await loadRoute();
    const res = await POST(postJson({
      campaign_slug: "does-not-exist",
      rows: [{ rowNumber: 1, name: "Mason Brooks", class_year: "Freshman" }],
    }) as never);
    assert.equal(res.status, 404);
  });
});

test("POST /import: valid approved rows are accepted and created", async () => {
  await withFakeDb(async ({ db }) => {
    authenticate();
    const { POST } = await loadRoute();
    const res = await POST(postJson({
      campaign_slug: "wolves",
      rows: [
        { rowNumber: 1, name: "Mason Brooks", class_year: "Freshman", event: "Sprints" },
        { rowNumber: 2, name: "Abby Cooper", class_year: "Junior", event: "" },
      ],
    }) as never);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 2);
    assert.equal(db.athletes.length, 2);
  });
});

test("POST /import: client-spoofed status/existingMatch/duplicateRowNumber/issues never influence the outcome", async () => {
  await withFakeDb(async ({ db }) => {
    authenticate();
    const { POST } = await loadRoute();
    // A malicious or buggy client claims this row is already "ready" and
    // fabricates existingMatch/duplicateRowNumber/issues metadata — none of
    // it should matter; the server decides purely from name/class_year.
    const res = await POST(postJson({
      campaign_slug: "wolves",
      rows: [{
        rowNumber:          1,
        name:               "Mason Brooks",
        class_year:         "Freshman",
        status:             "invalid",
        existingMatch:      { id: "fake-id", name: "Someone Else", class_year: "Senior", event: null, linked: true, hasFundraisingHistory: true },
        duplicateRowNumber: 99,
        issues:             ["fabricated issue"],
      }],
    }) as never);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.created, 1, "the row must be created on its real name/class_year, ignoring every spoofed field");
    assert.equal(db.athletes[0].name, "Mason Brooks");
  });
});

test("POST /import: overrideCollision as the string \"true\" is NOT treated as a real override", async () => {
  await withFakeDb(async ({ db }) => {
    db.athletes.push({ id: "existing-1", campaign_slug: "wolves", name: "Mason Brooks", class_year: "Freshman" });
    authenticate();
    const { POST } = await loadRoute();
    const res = await POST(postJson({
      campaign_slug: "wolves",
      rows: [{ rowNumber: 1, name: "Mason Brooks", class_year: "Freshman", overrideCollision: "true" }],
    }) as never);
    const body = await res.json();
    assert.equal(body.created, 0);
    assert.equal(body.skipped, 1, "a string \"true\" must not satisfy the strict === true check");
    assert.equal(db.athletes.length, 1);
  });
});

test("POST /import: overrideCollision as literal boolean true IS honored", async () => {
  await withFakeDb(async ({ db }) => {
    db.athletes.push({ id: "existing-1", campaign_slug: "wolves", name: "Mason Brooks", class_year: "Freshman" });
    authenticate();
    const { POST } = await loadRoute();
    const res = await POST(postJson({
      campaign_slug: "wolves",
      rows: [{ rowNumber: 1, name: "Mason Brooks", class_year: "Freshman", overrideCollision: true }],
    }) as never);
    const body = await res.json();
    assert.equal(body.created, 1);
    assert.equal(db.athletes.length, 2);
  });
});

test("POST /import: a duplicate created in the database after Parse (before Confirm) is still caught at import time", async () => {
  await withFakeDb(async ({ db }) => {
    authenticate();
    const { POST } = await loadRoute();
    // Simulate the row arriving flagged "ready" from an earlier Parse call,
    // but another admin has since created the same athlete directly.
    db.athletes.push({ id: "existing-1", campaign_slug: "wolves", name: "Mason Brooks", class_year: "Freshman" });
    const res = await POST(postJson({
      campaign_slug: "wolves",
      rows: [{ rowNumber: 1, name: "Mason Brooks", class_year: "Freshman", status: "ready" }],
    }) as never);
    const body = await res.json();
    assert.equal(body.created, 0);
    assert.equal(body.skipped, 1);
    assert.equal(db.athletes.length, 1, "must not create a second record for the now-existing athlete");
  });
});

test("POST /import: a client-supplied per-row campaign slug cannot redirect a row into another campaign", async () => {
  await withFakeDb(async ({ db }) => {
    authenticate();
    const { POST } = await loadRoute();
    const res = await POST(postJson({
      campaign_slug: "wolves",
      rows: [{ rowNumber: 1, name: "Mason Brooks", class_year: "Freshman", campaign_slug: "falcons" }],
    }) as never);
    const body = await res.json();
    assert.equal(body.created, 1);
    assert.equal(db.athletes[0].campaign_slug, "wolves", "the request-level campaign_slug is authoritative; a per-row value must be ignored");
  });
});
