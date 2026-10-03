// Family Relationships Phase D — /api/team/[slug]/family/requests route
// tests. Exercises the real POST handler under `node --test` via the
// shared next/server + next/headers stubs (src/lib/testSupport/
// nextStubLoader.mjs — same technique as join/route.test.ts and
// contacts/route.test.ts), against a small in-memory fake of the Supabase
// PostgREST layer. Identity is resolved through the REAL getAccountSession()
// / getTeamActor() cookie path (real makeAccountCookie/verifyAccountCookie),
// never faked at the function level — this is the one place a mistake
// (e.g. deriving account_id from the wrong session shape) would actually
// surface.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie } = await import("../../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    elf_accounts:            [],
    team_coaches:            [],
    team_members:            [],
    team_member_athletes:    [],
    athletes:                [],
    parent_access_requests:  [],
    campaign_settings:       [],
    notifications:           [],
  };
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr.startsWith("neq.")) return String(row[field]) !== expr.slice(4);
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
      if (table === "parent_access_requests" && body.status !== "declined") {
        const dup = tableRows.find(r =>
          r.account_id === body.account_id && r.athlete_id === body.athlete_id && r.status === "pending",
        );
        if (dup) return new Response(JSON.stringify({ code: "23505", message: "duplicate" }), { status: 409 });
      }
      const now = new Date().toISOString();
      const row: Row = {
        id: genId(table), status: "pending", created_at: now, updated_at: now,
        decided_by_account_id: null, decided_at: null, decline_reason: null,
        resulting_member_id: null, athlete_id: null, account_id: null,
        ...body,
      };
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
  __setTestCookie("team_member", undefined);
  __setTestCookie("team_coach", undefined);
}

function seedAccount(db: Record<string, Row[]>, overrides: Partial<Row> = {}): { id: string; salt: string } {
  const id = overrides.id as string ?? "acct-1";
  const salt = "s-acct";
  db.elf_accounts.push({ id, email: "parent@example.com", password_hash: "x", salt, name: "Sarah Wagner", profile_photo_url: null, ...overrides });
  return { id, salt };
}

function signInWithAccount(account: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("elf_session", makeAccountCookie(account.id, account.salt));
}

function seedAthlete(db: Record<string, Row[]>, id: string, name: string, slug: string) {
  db.athletes.push({ id, campaign_slug: slug, name });
}

async function loadRoute() {
  return import("./route.ts");
}

// The test stub's after() runs its callback fire-and-forget (void fn()),
// matching real Next.js after() semantics (never awaited by the caller) —
// so a test asserting on its effects must yield back to the event loop long
// enough for that callback's own internal awaits (each a same-tick-resolving
// fake fetch, no real I/O) to finish first.
function flushAfter(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

const SLUG = "wolves";

function postRequest(athleteId: unknown): Request {
  return new NextRequest(`http://test.local/api/team/${SLUG}/family/requests`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ athleteId }),
  });
}

// ── 1 & 5. Authenticated member can request; identity comes from session ──

test("1 & 5. an authenticated member can request an athlete; the created request's account_id matches the SESSION account, never a client-supplied value", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, "created");
    assert.equal(db.parent_access_requests.length, 1);
    assert.equal(db.parent_access_requests[0].account_id, account.id);
  });
});

// ── 2. Authenticated coach can request ─────────────────────────────────────

test("2. an authenticated coach (no team_members row at all) can request an athlete", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_coaches.push({ id: "c1", campaign_slug: SLUG, role: "head_coach", account_id: account.id, name: "Coach Mike", salt: "s1" });
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, "created");
  });
});

// ── 3. Coach with zero existing family relationships requests first athlete ─

test("3. a coach with zero existing family relationships can establish their first one", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_coaches.push({ id: "c1", campaign_slug: SLUG, role: "assistant_coach", account_id: account.id, name: "Coach Jane", salt: "s1" });
    seedAthlete(db, "athlete-jake", "Jake Wagner", SLUG);
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-jake") as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
    assert.equal(db.parent_access_requests[0].account_id, account.id);
  });
});

// ── 4. Unauthenticated request rejected ────────────────────────────────────

test("4. an unauthenticated request is rejected", async () => {
  await withFakeDb(async db => {
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    clearCookies();

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
    assert.equal(db.parent_access_requests.length, 0);
  });
});

// ── 6. Cross-campaign athlete rejected ─────────────────────────────────────

test("6. an athlete belonging to a DIFFERENT campaign is rejected, never creates a request", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    seedAthlete(db, "athlete-other", "Other Team Kid", "hawks");
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-other") as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 404);
    assert.equal(db.parent_access_requests.length, 0);
  });
});

// ── 7. already_pending preserved ───────────────────────────────────────────

test("7. re-requesting an already-pending athlete reports already_pending, no duplicate row", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    signInWithAccount(account);

    const { POST } = await loadRoute();
    await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    const res2 = await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data2 = await res2.json();
    assert.equal(data2.status, "already_pending");
    assert.equal(db.parent_access_requests.length, 1);
  });
});

// ── 8. already_member preserved ────────────────────────────────────────────

test("8. an already-approved relationship reports already_member, no new request", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    db.team_members.push({ id: "member-1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: "athlete-emma", name: "Sarah", salt: "s1" });
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.status, "already_member");
    assert.equal(data.memberId, "member-1");
    assert.equal(db.parent_access_requests.length, 0);
  });
});

// ── 9. Previously-declined athlete can be requested again ─────────────────

test("9. a previously-declined athlete can be requested again", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    db.parent_access_requests.push({
      id: "req-old", campaign_slug: SLUG, account_id: account.id, athlete_id: "athlete-emma", status: "declined",
      parent_name: "Sarah", decided_by_account_id: "coach-1", decided_at: new Date().toISOString(),
      decline_reason: null, resulting_member_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.status, "created");
    assert.equal(db.parent_access_requests.filter(r => r.athlete_id === "athlete-emma").length, 2);
  });
});

// ── 10 & 11. Head Coach notification on create, not on already_pending ────

test("10. a newly-created request notifies the Head Coach (in-app notification + push)", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    db.team_coaches.push({ id: "coach-1", campaign_slug: SLUG, role: "head_coach", account_id: "coach-acct-1", name: "Coach Mike", salt: "s2" });
    db.campaign_settings.push({ campaign_slug: SLUG, team_id: "team-1" });
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    signInWithAccount(account);

    const { POST } = await loadRoute();
    await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    await flushAfter();

    assert.equal(db.notifications.length, 1, "exactly one Head Coach notification for the new request");
    assert.equal(db.notifications[0].team_id, "team-1");
  });
});

test("11. re-requesting an already-pending athlete does NOT create a duplicate notification", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    db.campaign_settings.push({ campaign_slug: SLUG, team_id: "team-1" });
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    signInWithAccount(account);

    const { POST } = await loadRoute();
    await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    await flushAfter();
    await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    await flushAfter();

    assert.equal(db.notifications.length, 1, "no second notification for an already_pending re-request");
  });
});

test("already_member does NOT create a notification either", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    db.team_members.push({ id: "member-1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: "athlete-emma", name: "Sarah", salt: "s1" });
    db.campaign_settings.push({ campaign_slug: SLUG, team_id: "team-1" });
    signInWithAccount(account);

    const { POST } = await loadRoute();
    await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });

    assert.equal(db.notifications.length, 0);
  });
});

// ── Malformed input ─────────────────────────────────────────────────────────

test("missing athleteId is rejected with 400", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest(undefined) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
  });
});

test("non-string athleteId is rejected with 400", async () => {
  await withFakeDb(async db => {
    const account = seedAccount(db);
    db.team_members.push({ id: "m1", campaign_slug: SLUG, role: "parent", account_id: account.id, athlete_id: null, name: "Sarah", salt: "s1" });
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest(["athlete-emma"]) as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 400);
  });
});

test("an authenticated account with no standing at all on this campaign is rejected", async () => {
  await withFakeDb(async db => {
    // Account exists, but has neither a team_members nor team_coaches row
    // on this campaign — getTeamActor() must resolve "public" for it here.
    const account = seedAccount(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner", SLUG);
    signInWithAccount(account);

    const { POST } = await loadRoute();
    const res = await POST(postRequest("athlete-emma") as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 401);
    assert.equal(db.parent_access_requests.length, 0);
  });
});
