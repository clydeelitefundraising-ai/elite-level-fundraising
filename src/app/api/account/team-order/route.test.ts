// PUT /api/account/team-order — real route handler, real account cookie
// (makeAccountCookie/verifyAccountCookie), fetch-mocked PostgREST. Same
// technique as the other account-session route tests.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");

type Row = Record<string, unknown>;

function makeWorld(opts: { orderTable?: "present" | "missing" | "error" } = {}) {
  const db: Record<string, Row[]> = {
    elf_accounts:       [{ id: "acct-1", name: "Sam Lee", email: "sam@example.com", salt: "salt-1", profile_photo_url: null },
                         { id: "acct-2", name: "Pat Kim", email: "pat@example.com", salt: "salt-2", profile_photo_url: null }],
    team_coaches:       [{ account_id: "acct-1", campaign_slug: "wolves", role: "head_coach", created_at: "2025-01-01T00:00:00Z" }],
    team_members:       [{ account_id: "acct-1", campaign_slug: "hawks",  role: "parent",     created_at: "2024-01-01T00:00:00Z" },
                         { account_id: "acct-2", campaign_slug: "eagles", role: "athlete",    created_at: "2024-01-01T00:00:00Z" }],
    campaign_settings:  ["wolves", "hawks", "eagles"].map(slug => ({ campaign_slug: slug, school_name: "Central", mascot: "", sport_name: "Football", primary_color: "#111111", season: "2026", logo_url: null, branding_customized: false })),
    account_team_order: [],
  };
  const writes: { table: string; method: string; body: Row | null }[] = [];
  const orderTable = opts.orderTable ?? "present";

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query = ""] = path.split("?");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Row : null;
    if (method !== "GET") writes.push({ table, method, body });

    if (table === "account_team_order" && orderTable === "missing") return new Response("{}", { status: 404 });
    if (table === "account_team_order" && orderTable === "error" && method !== "GET") return new Response("boom", { status: 500 });

    const rows = db[table] ?? [];
    if (method === "GET") {
      let out = rows;
      for (const [key, val] of new URLSearchParams(query).entries()) {
        if (key === "select" || key === "limit") continue;
        if (val.startsWith("eq.")) out = out.filter(r => String(r[key]) === val.slice(3));
        if (val.startsWith("in.(")) out = out.filter(r => val.slice(4, -1).split(",").includes(String(r[key])));
      }
      return new Response(JSON.stringify(out), { status: 200 });
    }
    if (method === "POST" && table === "account_team_order") {
      const i = rows.findIndex(r => r.account_id === body!.account_id);
      if (i >= 0) rows[i] = { ...rows[i], ...body };
      else rows.push({ ...body });
      return new Response(null, { status: 201 });
    }
    return new Response("not implemented", { status: 500 });
  }
  return { db, writes, fetchImpl };
}

async function withWorld<T>(opts: Parameters<typeof makeWorld>[0], run: (w: ReturnType<typeof makeWorld>) => Promise<T>): Promise<T> {
  const w = makeWorld(opts);
  const realFetch = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  try {
    return await run(w);
  } finally {
    globalThis.fetch = realFetch;
    __setTestCookie("elf_session", undefined);
  }
}

function signIn(id = "acct-1", salt = "salt-1") {
  __setTestCookie("elf_session", makeAccountCookie(id, salt));
}

function put(body: unknown) {
  return new Request("https://app.example.com/api/account/team-order", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function loadRoute() {
  return import("./route.ts");
}

test("signed out → 401, nothing written", async () => {
  await withWorld({}, async ({ writes }) => {
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: ["wolves"] }) as never);
    assert.equal(res.status, 401);
    assert.equal(writes.length, 0);
  });
});

test("forged cookie for another account → 401", async () => {
  await withWorld({}, async ({ writes }) => {
    __setTestCookie("elf_session", makeAccountCookie("acct-2", "salt-1")); // wrong salt
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: ["eagles"] }) as never);
    assert.equal(res.status, 401);
    assert.equal(writes.length, 0);
  });
});

test("valid order is saved for the signed-in account only", async () => {
  await withWorld({}, async ({ db, writes }) => {
    signIn();
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: ["wolves", "hawks"] }) as never);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, team_slugs: ["wolves", "hawks"] });
    assert.deepEqual(db.account_team_order, [{ account_id: "acct-1", team_slugs: ["wolves", "hawks"], updated_at: db.account_team_order[0].updated_at }]);
    // Only the order table is ever written — never membership/roles.
    assert.deepEqual(writes.map(w => w.table), ["account_team_order"]);
  });
});

test("duplicate slugs are removed before saving", async () => {
  await withWorld({}, async ({ db }) => {
    signIn();
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: ["hawks", "wolves", "hawks", "wolves"] }) as never);
    assert.equal(res.status, 200);
    assert.deepEqual(db.account_team_order[0].team_slugs, ["hawks", "wolves"]);
  });
});

test("a slug the account doesn't belong to → 403, nothing saved", async () => {
  await withWorld({}, async ({ writes }) => {
    signIn();
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: ["wolves", "eagles"] }) as never); // eagles is acct-2's team
    assert.equal(res.status, 403);
    assert.equal(writes.length, 0);
  });
});

test("malformed bodies → 400, nothing saved", async () => {
  await withWorld({}, async ({ writes }) => {
    signIn();
    const { PUT } = await loadRoute();
    for (const body of ["not json", {}, { team_slugs: "wolves" }, { team_slugs: ["wolves", 7] }, { team_slugs: Array(201).fill("wolves") }]) {
      const res = await PUT(put(body) as never);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    }
    assert.equal(writes.length, 0);
  });
});

test("empty list is allowed (resets to the default order)", async () => {
  await withWorld({}, async ({ db }) => {
    signIn();
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: [] }) as never);
    assert.equal(res.status, 200);
    assert.deepEqual(db.account_team_order[0].team_slugs, []);
  });
});

test("before the migration (table missing) → 503 so the UI shows an error", async () => {
  await withWorld({ orderTable: "missing" }, async () => {
    signIn();
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: ["wolves", "hawks"] }) as never);
    assert.equal(res.status, 503);
  });
});

test("database write failure → 500", async () => {
  await withWorld({ orderTable: "error" }, async () => {
    signIn();
    const { PUT } = await loadRoute();
    const res = await PUT(put({ team_slugs: ["wolves", "hawks"] }) as never);
    assert.equal(res.status, 500);
  });
});
