// Phase F1d — /api/platform-admin/fundraising-inquiries/[id] PATCH (status
// transitions). Same technique as the list route's own test file: real
// getAccountSession()/getPlatformAdminSession() cookie path against a
// fetch-mocked in-memory Supabase layer.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest }       = await import("../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie }   = await import("../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    elf_accounts:          [],
    platform_admins:       [],
    fundraising_inquiries: [],
    audit_logs:            [],
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
    const tableRows = db[table] ?? (db[table] = []);

    if (method === "GET") {
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init!.body as string);
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      const updated: Row[] = [];
      for (const row of tableRows) {
        if (matchedIds.has(row.id)) { Object.assign(row, patch); updated.push({ ...row }); }
      }
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(init!.body as string);
      tableRows.push(body);
      return new Response(JSON.stringify([body]), { status: 201 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
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
  const id = "regular-acct-1";
  const salt = "s-regular";
  db.elf_accounts.push({ id, email: "coach@example.com", name: "Regular Coach", salt, profile_photo_url: null });
  return { id, salt };
}

function signIn(account: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("elf_session", makeAccountCookie(account.id, account.salt));
}

function seedInquiry(db: Record<string, Row[]>, overrides: Partial<Row> = {}) {
  const row = {
    id: "inq-1", campaign_slug: "wolves", requested_by_account_id: "coach-1", requested_by_role: "head_coach",
    status: "new", created_at: "2026-01-01T00:00:00Z", decided_by_account_id: null, decided_at: null,
    ...overrides,
  };
  db.fundraising_inquiries.push(row);
  return row;
}

async function loadRoute() {
  return import("./route.ts");
}

function patchRequest(status: string): Request {
  return new NextRequest("http://test.local/api/platform-admin/fundraising-inquiries/inq-1", {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ status }),
  });
}

const CTX = { params: Promise.resolve({ id: "inq-1" }) };

// ── Admin authorization ──────────────────────────────────────────────────

test("Platform Admin can mark an inquiry contacted", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db);
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("contacted") as never, CTX as never);
    assert.equal(res.status, 200);
  });
});

test("a non-admin authenticated account is rejected with 401", async () => {
  await withFakeDb(async db => {
    const account = seedNonAdminAccount(db);
    seedInquiry(db);
    signIn(account);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("contacted") as never, CTX as never);
    assert.equal(res.status, 401);
  });
});

test("an anonymous request is rejected with 401", async () => {
  await withFakeDb(async db => {
    seedInquiry(db);
    clearCookies();

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("contacted") as never, CTX as never);
    assert.equal(res.status, 401);
  });
});

// ── Status transitions ───────────────────────────────────────────────────

test("new -> contacted is allowed", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "new" });
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("contacted") as never, CTX as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.inquiry.status, "contacted");
  });
});

test("new -> resolved is allowed", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "new" });
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("resolved") as never, CTX as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.inquiry.status, "resolved");
  });
});

test("contacted -> resolved is allowed", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "contacted" });
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("resolved") as never, CTX as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.inquiry.status, "resolved");
  });
});

test("resolved -> contacted is rejected with 409, status unchanged", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "resolved", decided_at: "2026-01-02T00:00:00Z", decided_by_account_id: "admin-acct-1" });
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("contacted") as never, CTX as never);
    assert.equal(res.status, 409);
    assert.equal(db.fundraising_inquiries[0].status, "resolved");
  });
});

test("resolved -> new (raw status in body) is rejected with 400 (not a valid PATCH target at all)", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "resolved" });
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("new") as never, CTX as never);
    assert.equal(res.status, 400);
  });
});

// ── decided_at / decided_by_account_id semantics ────────────────────────────

test("marking Contacted leaves decided_at and decided_by_account_id null", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "new" });
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("contacted") as never, CTX as never);
    const data = await res.json();
    assert.equal(data.inquiry.decided_at, null);
    assert.equal(data.inquiry.decided_by_account_id, null);
  });
});

test("marking Resolved sets decided_at and decided_by_account_id from the authenticated Platform Admin", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "new" });
    signIn(admin);

    const before = Date.now();
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("resolved") as never, CTX as never);
    const data = await res.json();

    assert.ok(data.inquiry.decided_at);
    assert.ok(new Date(data.inquiry.decided_at).getTime() >= before);
    assert.equal(data.inquiry.decided_by_account_id, admin.id);
  });
});

// ── Malformed input / not found ─────────────────────────────────────────────

test("an unknown status value is rejected with 400", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    seedInquiry(db, { status: "new" });
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchRequest("archived") as never, CTX as never);
    assert.equal(res.status, 400);
  });
});

test("a nonexistent inquiry id is rejected with 404", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);

    const { PATCH } = await loadRoute();
    const res = await PATCH(
      patchRequest("contacted") as never,
      { params: Promise.resolve({ id: "does-not-exist" }) } as never,
    );
    assert.equal(res.status, 404);
  });
});
