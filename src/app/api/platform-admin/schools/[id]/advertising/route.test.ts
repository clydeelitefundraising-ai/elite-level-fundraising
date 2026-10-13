// Phase 2.2B — /api/platform-admin/schools/[id]/advertising GET / PATCH.
// Same real-cookie-session technique as
// src/app/api/platform-admin/community-partners/[id]/route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { NextRequest } = await import("../../../../../../lib/testSupport/nextServerStub.mjs");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    elf_accounts:    [],
    platform_admins: [],
    organizations:   [],
    audit_logs:      [],
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
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const now = new Date().toISOString();
      const row: Row = { id: `row-${tableRows.length + 1}`, created_at: now, ...body };
      (db[table] ??= []).push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
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

const SCHOOL_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID  = "22222222-2222-2222-2222-222222222222";

function seedSchool(db: Record<string, Row[]>, overrides: Partial<Row> = {}): Row {
  const row: Row = {
    id: SCHOOL_ID, slug: "riverside-high-school", school_name: "Riverside High School",
    show_community_partners: false,
    ...overrides,
  };
  db.organizations.push(row);
  return row;
}

async function loadRoute() {
  return import("./route.ts");
}

function patchAdvertising(id: string, body: unknown): Request {
  return new NextRequest(`http://test.local/api/platform-admin/schools/${id}/advertising`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ── Authorization ─────────────────────────────────────────────────────────

test("GET: an anonymous request is rejected with 401", async () => {
  await withFakeDb(async db => {
    seedSchool(db);
    clearCookies();
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://test.local/x") as never, ctx(SCHOOL_ID) as never);
    assert.equal(res.status, 401);
  });
});

test("GET: a non-admin authenticated account is rejected with 401", async () => {
  await withFakeDb(async db => {
    seedSchool(db);
    const account = seedNonAdminAccount(db);
    signIn(account);
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://test.local/x") as never, ctx(SCHOOL_ID) as never);
    assert.equal(res.status, 401);
  });
});

test("PATCH: an anonymous request is rejected with 401, setting untouched", async () => {
  await withFakeDb(async db => {
    const school = seedSchool(db, { show_community_partners: false });
    clearCookies();
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: true }) as never, ctx(SCHOOL_ID) as never);
    assert.equal(res.status, 401);
    assert.equal(school.show_community_partners, false);
  });
});

test("PATCH: a non-admin authenticated account is rejected with 401, setting untouched", async () => {
  await withFakeDb(async db => {
    const school = seedSchool(db, { show_community_partners: false });
    const account = seedNonAdminAccount(db);
    signIn(account);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: true }) as never, ctx(SCHOOL_ID) as never);
    assert.equal(res.status, 401);
    assert.equal(school.show_community_partners, false);
  });
});

// ── Invalid id ────────────────────────────────────────────────────────────

test("GET: a malformed (non-UUID) id returns 400", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://test.local/x") as never, ctx("not-a-uuid") as never);
    assert.equal(res.status, 400);
  });
});

test("PATCH: a malformed (non-UUID) id returns 400", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising("not-a-uuid", { show_community_partners: true }) as never, ctx("not-a-uuid") as never);
    assert.equal(res.status, 400);
  });
});

// ── Not found ─────────────────────────────────────────────────────────────

test("GET: a well-formed id with no matching organization returns 404", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://test.local/x") as never, ctx(OTHER_ID) as never);
    assert.equal(res.status, 404);
  });
});

test("PATCH: a well-formed id with no matching organization returns 404, no audit entry written", async () => {
  await withFakeDb(async db => {
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(OTHER_ID, { show_community_partners: true }) as never, ctx(OTHER_ID) as never);
    assert.equal(res.status, 404);
    assert.equal(db.audit_logs.length, 0);
  });
});

// ── Validation ────────────────────────────────────────────────────────────

test("PATCH: a non-boolean show_community_partners is rejected with 400, setting untouched", async () => {
  await withFakeDb(async db => {
    const school = seedSchool(db, { show_community_partners: false });
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: "yes" }) as never, ctx(SCHOOL_ID) as never);
    assert.equal(res.status, 400);
    assert.equal(school.show_community_partners, false);
  });
});

test("PATCH: a missing show_community_partners field is rejected with 400", async () => {
  await withFakeDb(async db => {
    seedSchool(db);
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(SCHOOL_ID, {}) as never, ctx(SCHOOL_ID) as never);
    assert.equal(res.status, 400);
  });
});

test("PATCH: malformed JSON body returns 400", async () => {
  await withFakeDb(async db => {
    seedSchool(db);
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(
      new NextRequest(`http://test.local/x`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{not json" }) as never,
      ctx(SCHOOL_ID) as never,
    );
    assert.equal(res.status, 400);
  });
});

// ── Default OFF ───────────────────────────────────────────────────────────

test("GET: a newly seeded school with no explicit value defaults to show_community_partners=false", async () => {
  await withFakeDb(async db => {
    seedSchool(db, { show_community_partners: false });
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { GET } = await loadRoute();
    const res = await GET(new NextRequest("http://test.local/x") as never, ctx(SCHOOL_ID) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.show_community_partners, false);
  });
});

// ── Successful ON/OFF updates ────────────────────────────────────────────

test("PATCH: Platform Admin can turn advertising ON for a school", async () => {
  await withFakeDb(async db => {
    seedSchool(db, { show_community_partners: false });
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: true }) as never, ctx(SCHOOL_ID) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.show_community_partners, true);
  });
});

test("PATCH: Platform Admin can turn advertising OFF for a school", async () => {
  await withFakeDb(async db => {
    seedSchool(db, { show_community_partners: true });
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: false }) as never, ctx(SCHOOL_ID) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.show_community_partners, false);
  });
});

test("PATCH: unrelated organization fields are never modified by this endpoint", async () => {
  await withFakeDb(async db => {
    const school = seedSchool(db, { show_community_partners: false, address: "123 Main St", primary_color: "#1B4FA8" });
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: true }) as never, ctx(SCHOOL_ID) as never);
    assert.equal(school.address, "123 Main St");
    assert.equal(school.primary_color, "#1B4FA8");
  });
});

// ── Never report success for a failed/no-op write ────────────────────────

test("PATCH: a row deleted between the existence check and the write (race) returns 404, never a false success", async () => {
  await withFakeDb(async db => {
    seedSchool(db, { show_community_partners: false });
    const admin = seedPlatformAdmin(db);
    signIn(admin);

    // Simulate a concurrent deletion: the route's internal GET (existence
    // check) sees the row, but by the time its PATCH fires the row is
    // gone — exercising the exact "DB write matched zero rows" path
    // setSchoolAdvertisingSetting/the route must never mistake for success.
    const realFetch = globalThis.fetch;
    let sawGet = false;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const res = await realFetch(url, init);
      if (!sawGet && (init?.method ?? "GET") === "GET" && url.includes("organizations")) {
        sawGet = true;
        db.organizations.length = 0; // row vanishes right after the existence check reads it
      }
      return res;
    }) as typeof fetch;

    const { PATCH } = await loadRoute();
    const res = await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: true }) as never, ctx(SCHOOL_ID) as never);
    const body = await res.json();

    assert.equal(res.status, 404, "must never return 200/success when the underlying write matched zero rows");
    assert.notEqual(body.show_community_partners, true, "response must never fabricate the requested value as if it were saved");
    assert.equal(db.audit_logs.length, 0, "no audit entry for a write that never actually happened");
  });
});

// ── Audit attribution ────────────────────────────────────────────────────

test("PATCH: the audit log entry attributes the action to the real signed-in Platform Admin's identity, with old/new values", async () => {
  await withFakeDb(async db => {
    seedSchool(db, { show_community_partners: false, school_name: "Riverside High School" });
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { PATCH } = await loadRoute();
    await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: true }) as never, ctx(SCHOOL_ID) as never);

    const logged = db.audit_logs[0];
    assert.ok(logged, "expected an audit_logs row to have been written");
    assert.equal(logged.action, "school.community_partners_toggled");
    assert.equal(logged.entity_type, "organization");
    assert.equal(logged.entity_id, SCHOOL_ID);
    assert.equal(logged.actor_type, "platform_admin");
    assert.equal(logged.actor_id, "pa-1", "must attribute to this specific platform admin's real identity, not a generic one");
    assert.equal(logged.actor_email, "admin@elitelevelfundraising.com");
    assert.notEqual(logged.admin_identifier, "admin", "must never fall back to the legacy shared-tool identifier");
    assert.deepEqual(logged.previous_value, { show_community_partners: false });
    assert.deepEqual(logged.new_value, { show_community_partners: true });
  });
});

// ── Shared school state across multiple teams ────────────────────────────

test("PATCH from one team's Control Center is immediately visible via GET as another team at the same school would see it", async () => {
  await withFakeDb(async db => {
    // One organizations row, as if two campaign_settings rows (two
    // different teams/sports) both had organization_id = SCHOOL_ID — this
    // route only ever reads/writes the one shared row, so no per-team
    // duplication or drift is possible by construction.
    seedSchool(db, { show_community_partners: false });
    const admin = seedPlatformAdmin(db);
    signIn(admin);
    const { GET, PATCH } = await loadRoute();

    // "Team A" control center loads the setting.
    const beforeRes = await GET(new NextRequest("http://test.local/x") as never, ctx(SCHOOL_ID) as never);
    assert.equal((await beforeRes.json()).show_community_partners, false);

    // "Team A" control center flips it on.
    await PATCH(patchAdvertising(SCHOOL_ID, { show_community_partners: true }) as never, ctx(SCHOOL_ID) as never);

    // "Team B" control center (a separate request, same school) now sees it on.
    const afterRes = await GET(new NextRequest("http://test.local/x") as never, ctx(SCHOOL_ID) as never);
    assert.equal((await afterRes.json()).show_community_partners, true);
  });
});
