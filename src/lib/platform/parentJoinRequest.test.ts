// Family Relationships Phase C2 — parentJoinRequest.ts unit/service tests.
// normalizeParentAthleteIds() is pure and tested directly; submitParentAthleteRequests()
// is tested against the same small in-memory fake of the Supabase PostgREST
// layer used by parentAccessRequests.test.ts (duplicated per that file's own
// "deliberately self-contained" convention), since it drives the real,
// unmodified createPendingRequest().
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;
type Table = Row[];

function makeFakeDb() {
  const db: Record<string, Table> = {
    athletes: [], parent_access_requests: [], team_members: [], team_member_athletes: [],
  };
  let nextId = 1;
  const genId = () => `id-${nextId++}`;

  function parseQuery(qs: string) {
    const [table, query] = qs.split("?");
    const filters: [string, string][] = [];
    let select: string | null = null;
    let limit: number | null = null;
    for (const pair of (query ?? "").split("&")) {
      if (!pair) continue;
      const [rawKey, rawVal] = pair.split("=");
      const key = decodeURIComponent(rawKey);
      const val = decodeURIComponent(rawVal ?? "");
      if (key === "select") { select = val; continue; }
      if (key === "limit") { limit = Number(val); continue; }
      const m = val.match(/^eq\.(.*)$/);
      if (m) filters.push([key, m[1]]);
    }
    return { table, filters, select, limit };
  }
  function matches(row: Row, filters: [string, string][]) {
    return filters.every(([f, v]) => String(row[f]) === v);
  }
  function project(row: Row, select: string | null): Row {
    if (!select || select === "*") return { ...row };
    const out: Row = {};
    for (const field of select.split(",")) out[field] = row[field];
    return out;
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const { table, filters, select, limit } = parseQuery(path);
    const method = init?.method ?? "GET";
    db[table] = db[table] ?? [];

    if (method === "GET") {
      let rows = db[table].filter(r => matches(r, filters));
      if (limit != null) rows = rows.slice(0, limit);
      return new Response(JSON.stringify(rows.map(r => project(r, select))), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (table === "parent_access_requests" && body.status !== "declined") {
        const dup = db.parent_access_requests.find(r =>
          r.account_id === body.account_id && r.athlete_id === body.athlete_id && r.status === "pending",
        );
        if (dup) return new Response(JSON.stringify({ code: "23505", message: "duplicate" }), { status: 409 });
      }
      const now = new Date().toISOString();
      const row: Row = {
        id: genId(), status: "pending", created_at: now, updated_at: now,
        decided_by_account_id: null, decided_at: null, decline_reason: null,
        resulting_member_id: null, athlete_id: null, account_id: null, ...body,
      };
      db[table].push(row);
      return new Response(JSON.stringify([project(row, select)]), { status: 201 });
    }
    return new Response("not implemented", { status: 500 });
  }

  return { db, fetchImpl };
}

function seedAthlete(db: Record<string, Table>, id: string, campaignSlug: string, name: string) {
  db.athletes.push({ id, campaign_slug: campaignSlug, name });
}

async function withFakeDb<T>(run: (db: Record<string, Table>) => Promise<T>): Promise<T> {
  const { db, fetchImpl } = makeFakeDb();
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  try {
    return await run(db);
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function loadModule() {
  return import("./parentJoinRequest.ts");
}

// ── normalizeParentAthleteIds ───────────────────────────────────────────────

test("normalize: legacy athlete_id with no athleteIds field still works", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  const result = normalizeParentAthleteIds({ athlete_id: "athlete-1" });
  assert.deepEqual(result, { ok: true, athleteIds: ["athlete-1"] });
});

test("normalize: athleteIds with 1 athlete works", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  assert.deepEqual(normalizeParentAthleteIds({ athleteIds: ["a1"] }), { ok: true, athleteIds: ["a1"] });
});

test("normalize: athleteIds with multiple athletes preserved in order, deduped", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  const result = normalizeParentAthleteIds({ athleteIds: ["a1", "a2", "a1"] });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.athleteIds, ["a1", "a2"]);
});

test("normalize: empty athleteIds array is rejected", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  const result = normalizeParentAthleteIds({ athleteIds: [] });
  assert.equal(result.ok, false);
});

test("normalize: whitespace/empty-string entries are stripped, empty result rejected", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  const result = normalizeParentAthleteIds({ athleteIds: ["  ", ""] });
  assert.equal(result.ok, false);
});

test("normalize: more than 10 unique athletes is rejected", async () => {
  const { MAX_PARENT_JOIN_ATHLETES, normalizeParentAthleteIds } = await loadModule();
  const ids = Array.from({ length: MAX_PARENT_JOIN_ATHLETES + 1 }, (_, i) => `a${i}`);
  const result = normalizeParentAthleteIds({ athleteIds: ids });
  assert.equal(result.ok, false);
});

test("normalize: exactly 10 athletes is allowed (boundary)", async () => {
  const { MAX_PARENT_JOIN_ATHLETES, normalizeParentAthleteIds } = await loadModule();
  const ids = Array.from({ length: MAX_PARENT_JOIN_ATHLETES }, (_, i) => `a${i}`);
  const result = normalizeParentAthleteIds({ athleteIds: ids });
  assert.equal(result.ok, true);
});

test("normalize: a non-string entry anywhere in athleteIds is rejected", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  const result = normalizeParentAthleteIds({ athleteIds: ["a1", 42 as unknown as string] });
  assert.equal(result.ok, false);
});

test("normalize: malformed non-array athleteIds is rejected EVEN WITH a valid athlete_id present", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  const result = normalizeParentAthleteIds({ athleteIds: "malicious-not-array", athlete_id: "a1" });
  assert.equal(result.ok, false, "must never silently fall back to athlete_id when athleteIds is present but malformed");
});

test("normalize: when athleteIds is present and valid, it wins over athlete_id", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  const result = normalizeParentAthleteIds({ athleteIds: ["a1", "a2"], athlete_id: "a1" });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.athleteIds, ["a1", "a2"]);
});

test("normalize: neither field present is rejected", async () => {
  const { normalizeParentAthleteIds } = await loadModule();
  assert.equal(normalizeParentAthleteIds({}).ok, false);
});

// ── submitParentAthleteRequests ─────────────────────────────────────────────

test("submit: processes multiple athletes sequentially, all independent and created", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "a1", "wolves", "Emma");
    seedAthlete(db, "a2", "wolves", "Jake");
    const { submitParentAthleteRequests } = await loadModule();
    const results = await submitParentAthleteRequests(["a1", "a2"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.deepEqual(results.map(r => r.status), ["created", "created"]);
    assert.equal(db.parent_access_requests.length, 2);
  });
});

test("submit: one athlete failing (not found) does not block or roll back its siblings", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "a1", "wolves", "Emma");
    const { submitParentAthleteRequests } = await loadModule();
    const results = await submitParentAthleteRequests(["a1", "does-not-exist"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.equal(results[0].status, "created");
    assert.equal(results[1].status, "failed");
    assert.equal(db.parent_access_requests.length, 1, "the valid sibling's request must still exist");
  });
});

test("submit: a failed athlete's reason never exposes a raw internal error", async () => {
  await withFakeDb(async () => {
    const { submitParentAthleteRequests } = await loadModule();
    const results = await submitParentAthleteRequests(["ghost"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.equal(results[0].status, "failed");
    if (results[0].status === "failed") {
      assert.ok(!/23505|RestError|postgrest/i.test(results[0].reason));
    }
  });
});

test("submit: already-pending athlete reports already_pending, not a duplicate create", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "a1", "wolves", "Emma");
    const { submitParentAthleteRequests } = await loadModule();
    await submitParentAthleteRequests(["a1"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    const second = await submitParentAthleteRequests(["a1"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.equal(second[0].status, "already_pending");
    assert.equal(db.parent_access_requests.length, 1);
  });
});

test("submit: already-approved relationship reports already_member with the existing memberId", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "a1", "wolves", "Emma");
    db.team_members.push({ id: "member-1", campaign_slug: "wolves", role: "parent", account_id: "acct-1", athlete_id: "a1", name: "Sarah" });
    const { submitParentAthleteRequests } = await loadModule();
    const results = await submitParentAthleteRequests(["a1"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.equal(results[0].status, "already_member");
    if (results[0].status === "already_member") assert.equal(results[0].memberId, "member-1");
  });
});

test("submit: a previously declined request allows a brand new pending request", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "a1", "wolves", "Emma");
    db.parent_access_requests.push({
      id: "old", campaign_slug: "wolves", account_id: "acct-1", athlete_id: "a1", status: "declined",
      parent_name: "Sarah", decided_by_account_id: "coach-1", decided_at: new Date().toISOString(),
      decline_reason: null, resulting_member_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const { submitParentAthleteRequests } = await loadModule();
    const results = await submitParentAthleteRequests(["a1"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.equal(results[0].status, "created");
    assert.equal(db.parent_access_requests.filter(r => r.athlete_id === "a1").length, 2);
  });
});

test("submit: mixed valid + cross-campaign ids never reveals the other campaign", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "a1", "wolves", "Emma");
    seedAthlete(db, "a-other", "hawks", "Other Kid");
    const { submitParentAthleteRequests } = await loadModule();
    const results = await submitParentAthleteRequests(["a1", "a-other"], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.equal(results[0].status, "created");
    assert.equal(results[1].status, "failed");
    assert.ok(!JSON.stringify(results).toLowerCase().includes("hawks"));
  });
});

test("submit: empty athleteIds array returns an empty results array (no-op)", async () => {
  await withFakeDb(async () => {
    const { submitParentAthleteRequests } = await loadModule();
    const results = await submitParentAthleteRequests([], { campaignSlug: "wolves", accountId: "acct-1", parentName: "Sarah" });
    assert.deepEqual(results, []);
  });
});
