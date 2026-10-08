// Phase 2.2A — /api/platform-admin/community-partners/[id] GET / PATCH.
// Same real-cookie-session technique as the sibling route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { NextRequest } = await import("../../../../../lib/testSupport/nextServerStub.mjs");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    elf_accounts:       [],
    platform_admins:    [],
    community_partners: [],
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
      const body = JSON.parse(String(init?.body ?? "{}"));
      const idExpr = params.get("id") ?? "";
      const target = tableRows.find(r => matches(r, "id", idExpr));
      if (!target) return new Response(JSON.stringify([]), { status: 200 });
      Object.assign(target, body);
      return new Response(JSON.stringify([{ ...target }]), { status: 200 });
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

function clearCookies() {
  __setTestCookie("elf_session", undefined);
}

function seedPlatformAdmin(db: Record<string, Row[]>): { id: string; salt: string } {
  const id = "admin-acct-1";
  const salt = "s-admin";
  db.elf_accounts.push({ id, email: "admin@elitelevelfundraising.com", name: "ELF Admin", salt, profile_photo_url: null });
  db.platform_admins.push({ id: "pa-1", account_id: id, role: "platform_admin" });
  return { id, salt };
}

function seedNonAdminAccount(db: Record<string, Row[]>): { id: string; salt: string } {
  const id = "coach-acct-1";
  const salt = "s-coach";
  db.elf_accounts.push({ id, email: "coach@example.com", name: "Regular Coach", salt, profile_photo_url: null });
  return { id, salt };
}

function signIn(account: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("elf_session", makeAccountCookie(account.id, account.salt));
}

function seedPartner(db: Record<string, Row[]>, overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: "cp-1", business_name: "Acme Co", short_description: null, website_url: null,
    logo_url: null, is_active: false, is_featured: false, display_order: 0,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
  db.community_partners.push(row);
  return row;
}

async function loadRoute() {
  return import("./route.ts");
}

function patchPartner(id: string, body: unknown): Request {
  return new NextRequest(`http://test.local/api/platform-admin/community-partners/${id}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Authorization ─────────────────────────────────────────────────────────

test("GET: a non-admin authenticated account is rejected with 401", async () => {
  await withFakeDb(async db => {
    seedPartner(db);
    const account = seedNonAdminAccount(db);
    signIn(account);
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://test.local/x") as never, ctx("cp-1") as never);
    assert.equal(res.status, 401);
  });
});

test("PATCH: an anonymous request is rejected with 401, record untouched", async () => {
  await withFakeDb(async db => {
    const partner = seedPartner(db);
    clearCookies();
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchPartner("cp-1", { is_active: true }) as never, ctx("cp-1") as never);
    assert.equal(res.status, 401);
    assert.equal(partner.is_active, false);
  });
});

// ── Not found ─────────────────────────────────────────────────────────────

test("GET: a nonexistent id returns 404", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://test.local/x") as never, ctx("does-not-exist") as never);
    assert.equal(res.status, 404);
  });
});

test("PATCH: a nonexistent id returns 404", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchPartner("does-not-exist", { is_active: true }) as never, ctx("does-not-exist") as never);
    assert.equal(res.status, 404);
  });
});

// ── Active/inactive + featured transitions ──────────────────────────────

test("PATCH: Platform Admin can activate an inactive partner", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedPartner(db, { is_active: false });
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchPartner("cp-1", { is_active: true }) as never, ctx("cp-1") as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.is_active, true);
  });
});

test("PATCH: Platform Admin can deactivate an active partner (soft retirement, record preserved)", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedPartner(db, { is_active: true });
    signIn(admin);
    const { PATCH, GET } = await loadRoute();
    const res = await PATCH(patchPartner("cp-1", { is_active: false }) as never, ctx("cp-1") as never);
    assert.equal(res.status, 200);
    assert.equal(db.community_partners.length, 1, "deactivation must never delete the row");
    const getRes = await GET(new NextRequest("http://test.local/x") as never, ctx("cp-1") as never);
    const getData = await getRes.json();
    assert.equal(getData.is_active, false);
  });
});

test("PATCH: Platform Admin can toggle is_featured independently of is_active", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedPartner(db, { is_active: true, is_featured: false });
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchPartner("cp-1", { is_featured: true }) as never, ctx("cp-1") as never);
    const data = await res.json();
    assert.equal(data.is_featured, true);
    assert.equal(data.is_active, true, "unrelated field must be untouched by a partial PATCH");
  });
});

// ── Validation ────────────────────────────────────────────────────────────

test("PATCH: a non-https website_url is rejected with 400, record unchanged", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    const partner = seedPartner(db, { website_url: null });
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchPartner("cp-1", { website_url: "ftp://example.com" }) as never, ctx("cp-1") as never);
    assert.equal(res.status, 400);
    assert.equal(partner.website_url, null);
  });
});

test("PATCH: an empty body with no recognized fields returns 400", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedPartner(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchPartner("cp-1", { unknown_field: "x" }) as never, ctx("cp-1") as never);
    assert.equal(res.status, 400);
  });
});
