// Phase 2.2A — /api/platform-admin/community-partners GET (list) / POST
// (create). Session resolution goes through the REAL getAccountSession()/
// getPlatformAdminSession() cookie path against a fetch-mocked in-memory
// Supabase layer — same technique as
// src/app/api/platform-admin/fundraising-inquiries/route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { NextRequest } = await import("../../../../lib/testSupport/nextServerStub.mjs");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    elf_accounts:        [],
    platform_admins:     [],
    community_partners:  [],
  };
  let nextId = 1;
  const genId = () => `cp-${nextId++}`;

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
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const now = new Date().toISOString();
      const row: Row = { id: genId(), created_at: now, updated_at: now, ...body };
      (db[table] ??= []).push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
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

async function loadRoute() {
  return import("./route.ts");
}

function postPartner(body: unknown): Request {
  return new NextRequest("http://test.local/api/platform-admin/community-partners", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

// ── Authorization ─────────────────────────────────────────────────────────

test("GET: Platform Admin can list partners", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { GET } = await loadRoute();
    const res = await GET();
    assert.equal(res.status, 200);
  });
});

test("GET: a non-admin authenticated account is rejected with 401", async () => {
  await withFakeDb(async db => {
    const account = seedNonAdminAccount(db);
    signIn(account);
    const { GET } = await loadRoute();
    const res = await GET();
    assert.equal(res.status, 401);
  });
});

test("GET: an anonymous request is rejected with 401", async () => {
  await withFakeDb(async () => {
    clearCookies();
    const { GET } = await loadRoute();
    const res = await GET();
    assert.equal(res.status, 401);
  });
});

test("POST: a non-admin authenticated account is rejected with 401, no partner created", async () => {
  await withFakeDb(async db => {
    const account = seedNonAdminAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postPartner({ business_name: "Acme Co" }) as never);
    assert.equal(res.status, 401);
    assert.equal(db.community_partners.length, 0);
  });
});

test("POST: an anonymous request is rejected with 401, no partner created", async () => {
  await withFakeDb(async db => {
    clearCookies();
    const { POST } = await loadRoute();
    const res = await POST(postPartner({ business_name: "Acme Co" }) as never);
    assert.equal(res.status, 401);
    assert.equal(db.community_partners.length, 0);
  });
});

// ── Validation ────────────────────────────────────────────────────────────

test("POST: missing business_name is rejected with 400", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { POST } = await loadRoute();
    const res = await POST(postPartner({ website_url: "https://example.com" }) as never);
    assert.equal(res.status, 400);
  });
});

test("POST: a non-https website_url is rejected with 400", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { POST } = await loadRoute();
    const res = await POST(postPartner({ business_name: "Acme Co", website_url: "http://example.com" }) as never);
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.ok(data.errors?.website_url);
  });
});

test("POST: a blank website_url is accepted (field is optional)", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { POST } = await loadRoute();
    const res = await POST(postPartner({ business_name: "Acme Co", website_url: "" }) as never);
    assert.equal(res.status, 200);
  });
});

// ── Success + defaults ────────────────────────────────────────────────────

test("POST: a valid partner is created, always inactive/not-featured/order-0 regardless of any other input", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { POST } = await loadRoute();
    const res = await POST(postPartner({
      business_name: "Acme Co", website_url: "https://acme.example.com",
      short_description: "Great partner", is_active: true, is_featured: true, display_order: 99,
    }) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.business_name, "Acme Co");
    assert.equal(data.is_active, false, "new partners must default to inactive regardless of client input");
    assert.equal(data.is_featured, false);
    assert.equal(data.display_order, 0);
    assert.equal(db.community_partners.length, 1);
  });
});

// ── Audit attribution (Phase 2.2A relocation security requirement) ───────

test("POST: the audit log entry attributes the action to the real signed-in Platform Admin's identity, never a generic actor", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { POST } = await loadRoute();
    await POST(postPartner({ business_name: "Acme Co" }) as never);

    const logged = db.audit_logs?.[0];
    assert.ok(logged, "expected an audit_logs row to have been written");
    assert.equal(logged.action, "community_partner.created");
    assert.equal(logged.actor_type, "platform_admin");
    // actor_id is the platform_admins row id (toAuditActor/logAuditEvent's
    // own contract — see auditLog.ts), not the elf_accounts id — seeded as
    // "pa-1" above via seedPlatformAdmin.
    assert.equal(logged.actor_id, "pa-1", "must attribute to this specific platform admin's real identity, not a generic one");
    assert.equal(logged.actor_email, "admin@elitelevelfundraising.com");
    assert.notEqual(logged.admin_identifier, "admin", "must never fall back to the legacy shared-tool identifier");
  });
});

test("POST: malformed JSON body returns 400", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { POST } = await loadRoute();
    const req = new NextRequest("http://test.local/api/platform-admin/community-partners", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    "{not valid json",
    });
    const res = await POST(req as never);
    assert.equal(res.status, 400);
  });
});
