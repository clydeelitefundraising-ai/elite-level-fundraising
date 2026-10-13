// Phase 2.2A — /api/platform-admin/community-partners/logo POST. Only the
// auth gate and pre-sharp validation paths are exercised here (missing
// file, unsupported MIME, oversized file) — real image processing success
// would require a genuine image buffer and a real Supabase Storage
// endpoint, neither of which this unit-test environment has; that path is
// covered by manual QA instead (see the delivery report).
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
  const db: Record<string, Row[]> = { elf_accounts: [], platform_admins: [] };

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
    const params = new URLSearchParams(query ?? "");
    const tableRows = db[table] ?? [];
    return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
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

function signIn(account: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("elf_session", makeAccountCookie(account.id, account.salt));
}

async function loadRoute() {
  return import("./route.ts");
}

function uploadReq(formData: FormData): Request {
  return new NextRequest("http://test.local/api/platform-admin/community-partners/logo", {
    method: "POST",
    body:   formData,
  });
}

test("an anonymous request is rejected with 401 before any file is read", async () => {
  await withFakeDb(async () => {
    clearCookies();
    const { POST } = await loadRoute();
    const fd = new FormData();
    const res = await POST(uploadReq(fd) as never);
    assert.equal(res.status, 401);
  });
});

test("a missing logo field returns 400", async () => {
  await withFakeDb(async db => {
    signIn(seedPlatformAdmin(db));
    const { POST } = await loadRoute();
    const fd = new FormData();
    const res = await POST(uploadReq(fd) as never);
    assert.equal(res.status, 400);
  });
});

test("an unsupported MIME type is rejected with 415", async () => {
  await withFakeDb(async db => {
    signIn(seedPlatformAdmin(db));
    const { POST } = await loadRoute();
    const fd = new FormData();
    fd.append("logo", new File(["not an image"], "doc.pdf", { type: "application/pdf" }));
    const res = await POST(uploadReq(fd) as never);
    assert.equal(res.status, 415);
  });
});

// Security hardening (final review): unlike the legacy admin/logo-upload
// route this is modeled on, SVG is deliberately NOT accepted here — a
// stored SVG served from this public bucket could embed a <script> that
// executes when the URL is opened directly. Every accepted format is
// re-encoded through sharp (never a raw passthrough); there's no
// equivalent safe transform for SVG, so it's excluded rather than trusted.
test("image/svg+xml is rejected with 415 — stored XSS hardening, not just an unsupported-format gap", async () => {
  await withFakeDb(async db => {
    signIn(seedPlatformAdmin(db));
    const { POST } = await loadRoute();
    const fd = new FormData();
    fd.append("logo", new File(["<svg onload='alert(1)'></svg>"], "logo.svg", { type: "image/svg+xml" }));
    const res = await POST(uploadReq(fd) as never);
    assert.equal(res.status, 415);
  });
});

test("an oversized file is rejected with 413", async () => {
  await withFakeDb(async db => {
    signIn(seedPlatformAdmin(db));
    const { POST } = await loadRoute();
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const fd = new FormData();
    fd.append("logo", new File([big], "huge.png", { type: "image/png" }));
    const res = await POST(uploadReq(fd) as never);
    assert.equal(res.status, 413);
  });
});
