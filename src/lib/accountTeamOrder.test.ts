// Custom Team Ordering — getAccountTeams() ordering + account_team_order
// reads/writes, against a fetch-mocked in-memory PostgREST layer (same
// technique as accountSession.test.ts). Covers the missing-table fallback
// that must hold before phase_t1_account_team_order.sql is run.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

register(new URL("./testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

type Row = Record<string, unknown>;
type Call = { method: string; table: string; query: string; body: Row | null };

function settings(slug: string, school = "Central High", sport = "Football"): Row {
  return { campaign_slug: slug, school_name: school, mascot: "Wolves", sport_name: sport, primary_color: "#123456", season: "2026", logo_url: null, branding_customized: false };
}

function makeWorld(opts: { orderTable?: "present" | "missing" | "error" } = {}) {
  const db: Record<string, Row[]> = { team_coaches: [], team_members: [], campaign_settings: [], account_team_order: [] };
  const calls: Call[] = [];
  const orderTable = opts.orderTable ?? "present";

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Row : null;
    calls.push({ method, table, query, body });

    if (table === "account_team_order") {
      if (orderTable === "missing") return new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table" }), { status: 404 });
      if (orderTable === "error")   return new Response("boom", { status: 500 });
    }
    const rows = db[table];
    if (!rows) return new Response("[]", { status: 200 });

    if (method === "GET") {
      let out = rows;
      for (const [key, val] of params.entries()) {
        if (key === "select" || key === "limit") continue;
        if (val.startsWith("eq.")) out = out.filter(r => String(r[key]) === val.slice(3));
        if (val.startsWith("in.(")) {
          const set = val.slice(4, -1).split(",");
          out = out.filter(r => set.includes(String(r[key])));
        }
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
  return { db, calls, fetchImpl };
}

async function withWorld<T>(opts: Parameters<typeof makeWorld>[0], run: (w: ReturnType<typeof makeWorld>) => Promise<T>): Promise<T> {
  const w = makeWorld(opts);
  const realFetch = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  try {
    return await run(w);
  } finally {
    globalThis.fetch = realFetch;
  }
}

const ACCT = "acct-1";

function seedThreeTeams(db: Record<string, Row[]>) {
  // Inserted in an order that differs from both join order and slug order.
  db.campaign_settings.push(settings("wolves"), settings("bears", "Central High", "Basketball"), settings("hawks", "North High"));
  db.team_coaches.push({ account_id: ACCT, campaign_slug: "wolves", role: "head_coach", created_at: "2025-01-01T00:00:00Z" });
  db.team_members.push({ account_id: ACCT, campaign_slug: "hawks", role: "parent", created_at: "2024-01-01T00:00:00Z" });
  db.team_members.push({ account_id: ACCT, campaign_slug: "bears", role: "athlete", created_at: "2026-01-01T00:00:00Z" });
}

const slugs = (teams: { campaign_slug: string }[]) => teams.map(t => t.campaign_slug);

// ── getAccountTeams ordering ──────────────────────────────────────────────

test("getAccountTeams: no saved order → oldest membership first", async () => {
  await withWorld({}, async ({ db }) => {
    seedThreeTeams(db);
    const { getAccountTeams } = await import("./accountSession.ts");
    assert.deepEqual(slugs(await getAccountTeams(ACCT)), ["hawks", "wolves", "bears"]);
  });
});

test("getAccountTeams: saved order applied; stale slugs ignored; new team at the bottom", async () => {
  await withWorld({}, async ({ db }) => {
    seedThreeTeams(db);
    db.account_team_order.push({ account_id: ACCT, team_slugs: ["bears", "left-team", "wolves"] });
    const { getAccountTeams } = await import("./accountSession.ts");
    assert.deepEqual(slugs(await getAccountTeams(ACCT)), ["bears", "wolves", "hawks"]);
  });
});

test("getAccountTeams: each account's order is independent", async () => {
  await withWorld({}, async ({ db }) => {
    seedThreeTeams(db);
    db.team_members.push({ account_id: "acct-2", campaign_slug: "wolves", role: "parent", created_at: "2025-01-01T00:00:00Z" });
    db.team_members.push({ account_id: "acct-2", campaign_slug: "hawks",  role: "booster", created_at: "2025-02-01T00:00:00Z" });
    db.account_team_order.push({ account_id: ACCT, team_slugs: ["bears", "hawks", "wolves"] });
    const { getAccountTeams } = await import("./accountSession.ts");
    assert.deepEqual(slugs(await getAccountTeams(ACCT)), ["bears", "hawks", "wolves"]);
    assert.deepEqual(slugs(await getAccountTeams("acct-2")), ["wolves", "hawks"]);
  });
});

test("getAccountTeams: missing account_team_order table falls back to default order (pre-migration)", async () => {
  await withWorld({ orderTable: "missing" }, async ({ db }) => {
    seedThreeTeams(db);
    const { getAccountTeams } = await import("./accountSession.ts");
    assert.deepEqual(slugs(await getAccountTeams(ACCT)), ["hawks", "wolves", "bears"]);
  });
});

test("getAccountTeams: any account_team_order read error falls back to default order", async () => {
  await withWorld({ orderTable: "error" }, async ({ db }) => {
    seedThreeTeams(db);
    const { getAccountTeams } = await import("./accountSession.ts");
    assert.deepEqual(slugs(await getAccountTeams(ACCT)), ["hawks", "wolves", "bears"]);
  });
});

test("getAccountTeams: roles and role precedence unchanged; coach+parent on one team appears once", async () => {
  await withWorld({}, async ({ db }) => {
    seedThreeTeams(db);
    // Head coach on wolves who is also a parent there.
    db.team_members.push({ account_id: ACCT, campaign_slug: "wolves", role: "parent", created_at: "2023-01-01T00:00:00Z" });
    const { getAccountTeams } = await import("./accountSession.ts");
    const teams = await getAccountTeams(ACCT);
    assert.deepEqual(slugs(teams), ["wolves", "hawks", "bears"]); // wolves' earliest row is 2023
    assert.deepEqual(teams.map(t => [t.role, t.role_kind]), [["head_coach", "coach"], ["parent", "member"], ["athlete", "member"]]);
  });
});

test("getAccountTeams: no memberships → empty list, saved order irrelevant", async () => {
  await withWorld({}, async ({ db }) => {
    db.account_team_order.push({ account_id: ACCT, team_slugs: ["wolves"] });
    const { getAccountTeams } = await import("./accountSession.ts");
    assert.deepEqual(await getAccountTeams(ACCT), []);
  });
});

test("getAccountTeams: reads only — never writes account_team_order or membership tables", async () => {
  await withWorld({}, async ({ db, calls }) => {
    seedThreeTeams(db);
    db.account_team_order.push({ account_id: ACCT, team_slugs: ["gone", "bears"] });
    const { getAccountTeams } = await import("./accountSession.ts");
    await getAccountTeams(ACCT);
    assert.deepEqual(calls.filter(c => c.method !== "GET"), []);
    assert.deepEqual(db.account_team_order[0].team_slugs, ["gone", "bears"]);
  });
});

// ── account_team_order store ──────────────────────────────────────────────

test("saveTeamOrder: upserts one row per account keyed on account_id", async () => {
  await withWorld({}, async ({ db, calls }) => {
    const { saveTeamOrder, getSavedTeamOrder } = await import("./accountTeamOrder.ts");
    assert.deepEqual(await saveTeamOrder(ACCT, ["a", "b"]), { ok: true });
    assert.deepEqual(await saveTeamOrder(ACCT, ["b", "a"]), { ok: true });
    assert.equal(db.account_team_order.length, 1);
    assert.deepEqual(await getSavedTeamOrder(ACCT), ["b", "a"]);
    const post = calls.find(c => c.method === "POST")!;
    assert.match(post.query, /on_conflict=account_id/);
  });
});

test("saveTeamOrder: missing table → unavailable; other failures → error", async () => {
  const { saveTeamOrder } = await import("./accountTeamOrder.ts");
  await withWorld({ orderTable: "missing" }, async () => {
    assert.deepEqual(await saveTeamOrder(ACCT, ["a"]), { ok: false, reason: "unavailable" });
  });
  await withWorld({ orderTable: "error" }, async () => {
    assert.deepEqual(await saveTeamOrder(ACCT, ["a"]), { ok: false, reason: "error" });
  });
});

test("getSavedTeamOrder: no row → null; fetch throwing → null", async () => {
  const { getSavedTeamOrder } = await import("./accountTeamOrder.ts");
  await withWorld({}, async () => {
    assert.equal(await getSavedTeamOrder(ACCT), null);
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
  try {
    assert.equal(await getSavedTeamOrder(ACCT), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});
