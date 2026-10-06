// Phase F1d — /api/platform-admin/fundraising-inquiries GET (the queue
// list). Session resolution goes through the REAL getAccountSession() /
// getPlatformAdminSession() cookie path (real makeAccountCookie, real
// verify functions) against a fetch-mocked in-memory Supabase layer —
// nothing about authentication itself is stubbed, only the network. Same
// technique as src/app/api/team/[slug]/family/requests/route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    elf_accounts:          [],
    platform_admins:       [],
    team_coaches:          [],
    campaign_settings:     [],
    fundraising_inquiries: [],
  };

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr.startsWith("in.(") && expr.endsWith(")")) {
      const ids = expr.slice(4, -1).split(",").map(decodeURIComponent);
      return ids.includes(String(row[field]));
    }
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order") continue;
      rows = rows.filter(r => matches(r, key, val));
    }
    const order = params.get("order");
    if (order === "created_at.desc") {
      rows = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function fetchImpl(url: string): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });
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

function seedPlatformAdmin(db: Record<string, Row[]>, overrides: Partial<Row> = {}): { id: string; salt: string } {
  const id = (overrides.id as string) ?? "admin-acct-1";
  const salt = "s-admin";
  db.elf_accounts.push({ id, email: "admin@elitelevelfundraising.com", name: "ELF Admin", salt, profile_photo_url: null, ...overrides });
  db.platform_admins.push({ id: `pa-${id}`, account_id: id, role: "platform_admin" });
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

async function loadRoute() {
  return import("./route.ts");
}

// ── Admin authorization ──────────────────────────────────────────────────

test("Platform Admin can list inquiries", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);

    const { GET } = await loadRoute();
    const res = await GET();
    assert.equal(res.status, 200);
  });
});

test("a non-admin authenticated account is rejected with 401", async () => {
  await withFakeDb(async db => {
    const account = seedNonAdminAccount(db);
    signIn(account);

    const { GET } = await loadRoute();
    const res = await GET();
    assert.equal(res.status, 401);
  });
});

test("an anonymous (unauthenticated) request is rejected with 401", async () => {
  await withFakeDb(async () => {
    clearCookies();
    const { GET } = await loadRoute();
    const res = await GET();
    assert.equal(res.status, 401);
  });
});

// ── Identity resolution ──────────────────────────────────────────────────

test("a team_coaches-backed requester resolves to the coach's real name", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    db.campaign_settings.push({ campaign_slug: "wolves", school_name: "Wolves HS", sport_name: "Track", season: "Spring 2026" });
    db.team_coaches.push({ id: "coach-1", campaign_slug: "wolves", name: "Coach Mike", role: "head_coach" });
    db.fundraising_inquiries.push({
      id: "inq-1", campaign_slug: "wolves", requested_by_account_id: "coach-1", requested_by_role: "head_coach",
      status: "new", created_at: "2026-01-01T00:00:00Z", decided_by_account_id: null, decided_at: null,
    });
    signIn(admin);

    const { GET } = await loadRoute();
    const res = await GET();
    const data = await res.json();
    assert.equal(data.inquiries[0].requester_name, "Coach Mike");
  });
});

test("an elf_accounts-backed requester (defensive fallback path) resolves to the account's real name", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    db.campaign_settings.push({ campaign_slug: "hawks", school_name: "Hawks HS", sport_name: "Swim", season: "Fall 2026" });
    // No team_coaches row for this id — only resolvable via elf_accounts,
    // the defensive fallback path (no known submission path writes this
    // today, but the schema doesn't forbid it).
    db.elf_accounts.push({ id: "acct-99", email: "jane@example.com", name: "Coach Jane", salt: "s", profile_photo_url: null });
    db.fundraising_inquiries.push({
      id: "inq-2", campaign_slug: "hawks", requested_by_account_id: "acct-99", requested_by_role: "assistant_coach",
      status: "new", created_at: "2026-01-02T00:00:00Z", decided_by_account_id: null, decided_at: null,
    });
    signIn(admin);

    const { GET } = await loadRoute();
    const res = await GET();
    const data = await res.json();
    assert.equal(data.inquiries[0].requester_name, "Coach Jane");
  });
});

test("an unresolvable requester id yields a null requester_name (UI falls back to 'Coach'), never a raw id leak elsewhere", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    db.campaign_settings.push({ campaign_slug: "bears", school_name: "Bears HS", sport_name: "Soccer", season: "Spring 2026" });
    db.fundraising_inquiries.push({
      id: "inq-3", campaign_slug: "bears", requested_by_account_id: "ghost-id-does-not-exist", requested_by_role: "head_coach",
      status: "new", created_at: "2026-01-03T00:00:00Z", decided_by_account_id: null, decided_at: null,
    });
    signIn(admin);

    const { GET } = await loadRoute();
    const res = await GET();
    const data = await res.json();
    assert.equal(data.inquiries[0].requester_name, null);
    assert.equal(JSON.stringify(data).includes("ghost-id-does-not-exist"), false);
  });
});

// ── List ordering / rendering ────────────────────────────────────────────

test("inquiries are ordered newest first", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    db.campaign_settings.push({ campaign_slug: "wolves", school_name: "Wolves HS", sport_name: "Track", season: "Spring 2026" });
    db.team_coaches.push({ id: "coach-1", campaign_slug: "wolves", name: "Coach Mike", role: "head_coach" });
    db.fundraising_inquiries.push(
      { id: "old", campaign_slug: "wolves", requested_by_account_id: "coach-1", requested_by_role: "head_coach", status: "resolved", created_at: "2026-01-01T00:00:00Z", decided_by_account_id: null, decided_at: "2026-01-02T00:00:00Z" },
      { id: "new", campaign_slug: "wolves", requested_by_account_id: "coach-1", requested_by_role: "head_coach", status: "new", created_at: "2026-02-01T00:00:00Z", decided_by_account_id: null, decided_at: null },
    );
    signIn(admin);

    const { GET } = await loadRoute();
    const res = await GET();
    const data = await res.json();
    assert.deepEqual(data.inquiries.map((i: { id: string }) => i.id), ["new", "old"]);
  });
});

test("status and campaign context render correctly in the response shape", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    db.campaign_settings.push({ campaign_slug: "wolves", school_name: "Wolves HS", sport_name: "Track", season: "Spring 2026" });
    db.team_coaches.push({ id: "coach-1", campaign_slug: "wolves", name: "Coach Mike", role: "head_coach" });
    db.fundraising_inquiries.push({
      id: "inq-1", campaign_slug: "wolves", requested_by_account_id: "coach-1", requested_by_role: "head_coach",
      status: "contacted", created_at: "2026-01-01T00:00:00Z", decided_by_account_id: null, decided_at: null,
    });
    signIn(admin);

    const { GET } = await loadRoute();
    const res = await GET();
    const data = await res.json();
    const row = data.inquiries[0];
    assert.equal(row.status, "contacted");
    assert.equal(row.school_name, "Wolves HS");
    assert.equal(row.sport_name, "Track");
    assert.equal(row.season, "Spring 2026");
    assert.equal(row.requested_by_role, "head_coach");
  });
});
