// Family Relationships Phase C2 — /api/auth/join route-level tests.
//
// Exercises the real POST handler (legacy single athlete_id, new
// athleteIds[] multi-select, normalization/precedence, and per-athlete
// result mapping) under `node --test` via the shared next/server stub
// (src/lib/testSupport/nextStubLoader.mjs — same technique as
// contacts/route.test.ts), against a small in-memory fake of the Supabase
// PostgREST layer. No prior test file existed for this route; this one is
// scoped to exactly the request/response contract Phase C2 changed —
// rate limiting (checkRateLimit fails open with no Upstash env vars
// configured, which is already this test environment's existing behavior)
// and the notification/push side effects (best-effort, already wrapped in
// their own try/catch in the route) are intentionally not re-implemented
// here; see the Phase C2 report's manual QA plan for those.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../lib/testSupport/nextServerStub.mjs");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    team_join_codes:        [],
    elf_accounts:           [],
    athletes:               [],
    parent_access_requests: [],
    team_members:           [],
    team_member_athletes:   [],
    campaign_settings:      [],
    notifications:          [],
  };
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr.startsWith("neq.")) return String(row[field]) !== expr.slice(4);
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
      if (table === "team_members" && body.account_id != null) {
        const dup = tableRows.find(r => r.account_id === body.account_id && r.campaign_slug === body.campaign_slug);
        if (dup) return new Response(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint \"team_members_account_campaign_uniq\"" }), { status: 409 });
      }
      if (table === "elf_accounts") {
        const dup = tableRows.find(r => r.email === body.email);
        if (dup) return new Response("duplicate key value violates unique constraint (23505)", { status: 409 });
      }
      const now = new Date().toISOString();
      const row: Row = {
        id: genId(table === "elf_accounts" ? "acct" : table), status: "pending",
        created_at: now, updated_at: now,
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

async function loadRoute() {
  return import("./route.ts");
}

const SLUG = "wolves";
const CODE = "WOLVES1";

function seedTeam(db: Record<string, Row[]>) {
  db.team_join_codes.push({ id: "code-1", code: CODE, campaign_slug: SLUG, revoked: false, expires_at: null });
}
function seedAthlete(db: Record<string, Row[]>, id: string, name: string, slug = SLUG) {
  db.athletes.push({ id, campaign_slug: slug, name });
}

function postJoin(body: unknown): Request {
  return new NextRequest("http://test.local/api/auth/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function newParentBody(extra: Record<string, unknown>) {
  return {
    code: CODE, role: "parent", name: "Sarah Wagner",
    email: "sarah@example.com", password: "password123",
    ...extra,
  };
}

// ── 1. Legacy singular athlete_id still works for parent ──────────────────

test("1. legacy athlete_id (no athleteIds) still creates a single pending request", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athlete_id: "athlete-emma" })) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.results.length, 1);
    assert.equal(data.results[0].status, "created");
    assert.equal(data.pending, true);
  });
});

// ── 2/3. athleteIds with 2 and 3 athletes ──────────────────────────────────

test("2. athleteIds with 2 athletes creates 2 independent requests", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    seedAthlete(db, "athlete-jake", "Jake Wagner");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma", "athlete-jake"] })) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.results.length, 2);
    assert.ok(data.results.every((r: Row) => r.status === "created"));
    assert.equal(db.parent_access_requests.length, 2);
  });
});

test("3. athleteIds with 3 athletes creates 3 independent requests, one account", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "a1", "A One");
    seedAthlete(db, "a2", "A Two");
    seedAthlete(db, "a3", "A Three");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["a1", "a2", "a3"] })) as never);
    const data = await res.json();
    assert.equal(data.results.length, 3);
    const accountIds = new Set(db.parent_access_requests.map(r => r.account_id));
    assert.equal(accountIds.size, 1, "all requests must share one account");
  });
});

// ── 4. Dedupe within one submission ────────────────────────────────────────

test("4. duplicate ids in the same submission are deduped before processing", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma", "athlete-emma"] })) as never);
    const data = await res.json();
    assert.equal(data.results.length, 1);
    assert.equal(db.parent_access_requests.length, 1);
  });
});

// ── 5. Empty athleteIds rejected ───────────────────────────────────────────

test("5. empty athleteIds array is rejected with 400, nothing created", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: [] })) as never);
    assert.equal(res.status, 400);
    assert.equal(db.elf_accounts.length, 0, "no account should be created for a rejected submission");
  });
});

// ── 6. >10 athletes rejected before any creation ───────────────────────────

test("6. more than 10 athleteIds is rejected before any athlete is processed", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    const ids = Array.from({ length: 11 }, (_, i) => `athlete-${i}`);
    for (const id of ids) seedAthlete(db, id, id);
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ids })) as never);
    assert.equal(res.status, 400);
    assert.equal(db.parent_access_requests.length, 0);
    assert.equal(db.elf_accounts.length, 0);
  });
});

// ── 7. Non-string entries rejected ─────────────────────────────────────────

test("7. a non-string entry in athleteIds is rejected", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma", 123] })) as never);
    assert.equal(res.status, 400);
  });
});

// ── 8. Malformed non-array athleteIds rejected even with a valid athlete_id ─

test("8. malformed (non-array) athleteIds is rejected outright, never falling back to a valid athlete_id", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({
      athleteIds: "malicious-not-array",
      athlete_id: "athlete-emma",
    })) as never);
    assert.equal(res.status, 400);
    assert.equal(db.parent_access_requests.length, 0, "must never silently fall back to the legacy field");
  });
});

// ── 9. Both fields supplied — valid athleteIds wins ────────────────────────

test("9. when both athleteIds and athlete_id are supplied, a valid athleteIds takes precedence", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    seedAthlete(db, "athlete-jake", "Jake Wagner");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({
      athleteIds: ["athlete-emma", "athlete-jake"],
      athlete_id: "athlete-emma",
    })) as never);
    const data = await res.json();
    assert.equal(data.results.length, 2, "athleteIds (2 athletes) must win over the singular athlete_id");
  });
});

// ── 10. Cross-campaign athlete fails safely ────────────────────────────────

test("10. a cross-campaign athlete id fails safely, without revealing which other campaign it belongs to", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-other", "Other Team Kid", "hawks");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["athlete-other"] })) as never);
    const data = await res.json();
    assert.equal(res.status, 200, "the submission itself still succeeds — the failure is per-athlete");
    assert.equal(data.results[0].status, "failed");
    assert.ok(!JSON.stringify(data).toLowerCase().includes("hawks"), "must never leak the other campaign's slug");
  });
});

// ── 11. Mixed valid + cross-campaign ───────────────────────────────────────

test("11. mixed valid + cross-campaign ids: the valid one succeeds, the invalid one reports failure, independently", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    seedAthlete(db, "athlete-other", "Other Team Kid", "hawks");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma", "athlete-other"] })) as never);
    const data = await res.json();
    const byId = Object.fromEntries(data.results.map((r: Row) => [r.athleteId, r.status]));
    assert.equal(byId["athlete-emma"], "created");
    assert.equal(byId["athlete-other"], "failed");
    assert.equal(db.parent_access_requests.length, 1, "only the valid athlete produced a request");
  });
});

// ── 12. Nonexistent athlete id controlled failure ──────────────────────────

test("12. a nonexistent athlete id produces a controlled failure result, not a thrown error", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["does-not-exist"] })) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.results[0].status, "failed");
  });
});

// ── 13/14. already-pending / already-approved statuses ─────────────────────

test("13. re-submitting an already-pending athlete reports already_pending, no duplicate row", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    const { POST } = await loadRoute();
    const res1 = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma"] })) as never);
    const cookie = res1.headers.get("set-cookie") ?? "";
    const sessionCookie = cookie.split(";")[0];

    const res2 = await POST(new NextRequest("http://test.local/api/auth/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ code: CODE, role: "parent", name: "Sarah Wagner", athleteIds: ["athlete-emma"] }),
    }) as never);
    const data2 = await res2.json();
    assert.equal(data2.results[0].status, "already_pending");
    assert.equal(db.parent_access_requests.length, 1, "no duplicate pending row");
  });
});

test("14. an already-approved relationship reports already_member, no new request", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    db.team_members.push({ id: "member-1", campaign_slug: SLUG, role: "parent", account_id: "acct-existing", athlete_id: "athlete-emma", name: "Sarah Wagner", salt: "s1" });
    db.elf_accounts.push({ id: "acct-existing", email: "existing@example.com", password_hash: "x", salt: "x", name: "Sarah Wagner" });

    const { POST } = await loadRoute();
    // Simulate an authenticated existing account via the elf_session cookie
    // mechanism is involved-to-set-up here; simplest equivalent path for
    // this fake-DB test is a brand-new account requesting the same athlete
    // after a legacy team_members row already exists for a DIFFERENT
    // account — not representative of already_member. Instead, exercise
    // already_member via the same account across two calls using the
    // session cookie from the first response, as test 13 does.
    const res1 = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma"] })) as never);
    const cookie = (res1.headers.get("set-cookie") ?? "").split(";")[0];
    const data1 = await res1.json();
    assert.equal(data1.results[0].status, "created");

    // Head-Coach-equivalent approval: directly flip the request + create
    // the membership the way approveRequest() would, to reach the
    // already_member branch without re-implementing approval logic here.
    const reqRow = db.parent_access_requests[0];
    reqRow.status = "approved";
    const newMemberId = "member-2";
    db.team_members.push({ id: newMemberId, campaign_slug: SLUG, role: "parent", account_id: reqRow.account_id, athlete_id: "athlete-emma", name: "Sarah Wagner", salt: "s2" });

    const res2 = await POST(new NextRequest("http://test.local/api/auth/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code: CODE, role: "parent", name: "Sarah Wagner", athleteIds: ["athlete-emma"] }),
    }) as never);
    const data2 = await res2.json();
    assert.equal(data2.results[0].status, "already_member");
    assert.equal(db.parent_access_requests.length, 1, "no new request for an already-live relationship");
  });
});

// ── 15. Previously-declined allows a new pending request ───────────────────

test("15. a previously-declined request allows a brand new pending request", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    db.parent_access_requests.push({
      id: "req-old", campaign_slug: SLUG, account_id: "acct-x", parent_name: "Sarah",
      athlete_id: "athlete-emma", status: "declined",
      decided_by_account_id: "coach-1", decided_at: new Date().toISOString(),
      decline_reason: null, resulting_member_id: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const { POST } = await loadRoute();
    // Different account than the declined request's — a fresh submission.
    const res = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma"] })) as never);
    const data = await res.json();
    assert.equal(data.results[0].status, "created");
    assert.equal(db.parent_access_requests.filter(r => r.athlete_id === "athlete-emma").length, 2);
  });
});

// ── 16. Repeated identical multi-submission does not duplicate ────────────

test("16. repeating the exact same multi-athlete submission twice creates no duplicate rows", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    seedAthlete(db, "athlete-jake", "Jake Wagner");
    const { POST } = await loadRoute();
    const res1 = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma", "athlete-jake"] })) as never);
    const cookie = (res1.headers.get("set-cookie") ?? "").split(";")[0];
    await POST(new NextRequest("http://test.local/api/auth/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code: CODE, role: "parent", name: "Sarah Wagner", athleteIds: ["athlete-emma", "athlete-jake"] }),
    }) as never);
    assert.equal(db.parent_access_requests.length, 2, "still exactly one request per athlete");
  });
});

// ── 17. New account created exactly once ───────────────────────────────────

test("17. a brand-new parent gets exactly one account for a multi-athlete submission", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    seedAthlete(db, "athlete-jake", "Jake Wagner");
    const { POST } = await loadRoute();
    await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma", "athlete-jake"] })) as never);
    assert.equal(db.elf_accounts.length, 1);
  });
});

// ── 18. Athlete role unchanged (single athlete_id, immediate access) ──────

test("18. athlete role is unaffected — single athlete_id still grants immediate access, no results[] field", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    const { POST } = await loadRoute();
    const res = await POST(postJoin({
      code: CODE, role: "athlete", athlete_id: "athlete-emma",
      email: "emma@example.com", password: "password123", name: "ignored",
    }) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.campaign_slug, SLUG);
    assert.equal(data.results, undefined);
    assert.equal(data.pending, undefined);
    assert.equal(db.team_members.length, 1);
    assert.equal(db.team_members[0].role, "athlete");
  });
});

// ── 19. Max cap enforced server-side regardless of client ──────────────────

test("19. the 10-athlete cap is enforced server-side even if a client sends more", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    const ids = Array.from({ length: 12 }, (_, i) => `athlete-${i}`);
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ids })) as never);
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.match(data.error, /up to 10/);
  });
});

// ── 20. Whitespace/empty-string entries are normalized away ───────────────

test("20. whitespace-only and empty-string entries are stripped before processing", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    const { POST } = await loadRoute();
    const res = await POST(postJoin(newParentBody({ athleteIds: ["  athlete-emma  ", "", "   "] })) as never);
    const data = await res.json();
    assert.equal(data.results.length, 1);
    assert.equal(data.results[0].athleteId, "athlete-emma");
  });
});

// ── 21. Malformed JSON body ─────────────────────────────────────────────────

test("21. a malformed JSON body is rejected with 400, not a 500", async () => {
  await withFakeDb(async () => {
    const { POST } = await loadRoute();
    const req = new NextRequest("http://test.local/api/auth/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });
    const res = await POST(req as never);
    assert.equal(res.status, 400);
  });
});

// ── 22. Existing authenticated account is reused, not duplicated ──────────

test("22. an existing authenticated account submitting a second child reuses the same account", async () => {
  await withFakeDb(async db => {
    seedTeam(db);
    seedAthlete(db, "athlete-emma", "Emma Wagner");
    seedAthlete(db, "athlete-jake", "Jake Wagner");
    const { POST } = await loadRoute();
    const res1 = await POST(postJoin(newParentBody({ athleteIds: ["athlete-emma"] })) as never);
    const cookie = (res1.headers.get("set-cookie") ?? "").split(";")[0];
    assert.equal(db.elf_accounts.length, 1);

    const res2 = await POST(new NextRequest("http://test.local/api/auth/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ code: CODE, role: "parent", name: "Sarah Wagner", athleteIds: ["athlete-jake"] }),
    }) as never);
    assert.equal(res2.status, 200);
    assert.equal(db.elf_accounts.length, 1, "no second account created");
    assert.equal(db.parent_access_requests.length, 2);
    const accountIds = new Set(db.parent_access_requests.map(r => r.account_id));
    assert.equal(accountIds.size, 1);
  });
});
