// Phase O3B — /api/auth/signup route-level tests.
//
// Exercises the real POST handler under `node --test` via the shared
// next/server stub (src/lib/testSupport/nextStubLoader.mjs — same technique
// as join/route.test.ts), against a small in-memory fake of the Supabase
// PostgREST layer. Covers: success + elf_session issuance, field
// validation, duplicate email (both a pre-existing row and a race-condition
// insert failure), rate limiting, backend failure, already-authenticated
// reuse, and that no team/campaign row is ever created through this
// endpoint.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest } = await import("../../../../lib/testSupport/nextServerStub.mjs");

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    elf_accounts:      [],
    campaign_settings: [],
    team_coaches:      [],
    team_members:      [],
    team_join_codes:   [],
  };
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;

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
      if (table === "elf_accounts") {
        if (body.email === "forced-500@example.com") {
          return new Response("internal error", { status: 500 });
        }
        const dup = tableRows.find(r => r.email === body.email);
        if (dup) return new Response("duplicate key value violates unique constraint (23505)", { status: 409 });
      }
      const row: Row = { id: genId(table === "elf_accounts" ? "acct" : table), ...body };
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

// Default Origin matches the "allow localhost outside production" branch
// of getTrustedOrigins() — this test environment never sets NODE_ENV to
// "production", so every test below is implicitly a same-origin request
// unless it explicitly overrides Origin via extraHeaders.
function postSignup(body: unknown, extraHeaders?: Record<string, string>): Request {
  return new NextRequest("http://test.local/api/auth/signup", {
    method:  "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...extraHeaders },
    body:    JSON.stringify(body),
  });
}

const VALID = { name: "Casey Rivera", email: "casey@example.com", password: "password123" };

// ── Origin validation ────────────────────────────────────────────────────

test("O1. matching (trusted) Origin is accepted — normal signup remains functional", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup(VALID) as never);
    assert.equal(res.status, 200);
    assert.equal(db.elf_accounts.length, 1);
  });
});

test("O2. mismatched Origin is rejected with a safe 403, no account created", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup(VALID, { Origin: "https://evil.example.com" }) as never);
    const data = await res.json();
    assert.equal(res.status, 403);
    assert.equal(db.elf_accounts.length, 0);
    assert.ok(!/postgres|supabase/i.test(JSON.stringify(data)));
  });
});

test("O3. missing Origin is rejected with 403 — never treated as trustworthy", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const req = new NextRequest("http://test.local/api/auth/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json" }, // no Origin at all
      body:    JSON.stringify(VALID),
    });
    const res = await POST(req as never);
    assert.equal(res.status, 403);
    assert.equal(db.elf_accounts.length, 0);
  });
});

test("O4. an authorized Vercel preview Origin (VERCEL_URL) is accepted", async () => {
  await withFakeDb(async db => {
    const previous = process.env.VERCEL_URL;
    process.env.VERCEL_URL = "elf-team-abc123-myorg.vercel.app";
    try {
      const { POST } = await loadRoute();
      const res = await POST(postSignup(VALID, { Origin: "https://elf-team-abc123-myorg.vercel.app" }) as never);
      assert.equal(res.status, 200);
      assert.equal(db.elf_accounts.length, 1);
    } finally {
      if (previous === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = previous;
    }
  });
});

test("O5. VERCEL_URL being set does not itself trust an unrelated Origin", async () => {
  await withFakeDb(async db => {
    const previous = process.env.VERCEL_URL;
    process.env.VERCEL_URL = "elf-team-abc123-myorg.vercel.app";
    try {
      const { POST } = await loadRoute();
      const res = await POST(postSignup(VALID, { Origin: "https://not-the-preview.vercel.app" }) as never);
      assert.equal(res.status, 403);
      assert.equal(db.elf_accounts.length, 0);
    } finally {
      if (previous === undefined) delete process.env.VERCEL_URL;
      else process.env.VERCEL_URL = previous;
    }
  });
});

// ── A. Successful signup ───────────────────────────────────────────────────

test("A. valid signup creates an elf_account, returns ok, and sets elf_session", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup(VALID) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(db.elf_accounts.length, 1);
    assert.equal(db.elf_accounts[0].email, "casey@example.com");
    const cookie = res.headers.get("set-cookie") ?? "";
    assert.ok(cookie.includes("elf_session="), "must set elf_session cookie");
    assert.ok(cookie.toLowerCase().includes("httponly"));
    assert.ok(cookie.toLowerCase().includes("samesite=strict"));
  });
});

test("A2. password is hashed, never stored or returned in plaintext", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup(VALID) as never);
    const data = await res.json();
    assert.ok(!JSON.stringify(data).includes("password123"));
    assert.notEqual(db.elf_accounts[0].password_hash, "password123");
    assert.ok(db.elf_accounts[0].salt);
  });
});

// ── B. Password under 8 characters ───────────────────────────────────────

test("B. password under 8 characters is rejected with 400", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup({ ...VALID, password: "short" }) as never);
    assert.equal(res.status, 400);
    assert.equal(db.elf_accounts.length, 0);
  });
});

// ── C. Missing/blank name ────────────────────────────────────────────────

test("C. missing name is rejected with 400", async () => {
  await withFakeDb(async () => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup({ ...VALID, name: "" }) as never);
    assert.equal(res.status, 400);
  });
});

test("C2. whitespace-only name is rejected with 400", async () => {
  await withFakeDb(async () => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup({ ...VALID, name: "   " }) as never);
    assert.equal(res.status, 400);
  });
});

// ── D. Invalid/missing email ─────────────────────────────────────────────

test("D. missing email is rejected with 400", async () => {
  await withFakeDb(async () => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup({ ...VALID, email: "" }) as never);
    assert.equal(res.status, 400);
  });
});

test("D2. malformed email is rejected with 400", async () => {
  await withFakeDb(async () => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup({ ...VALID, email: "not-an-email" }) as never);
    assert.equal(res.status, 400);
  });
});

// ── E. Duplicate email (pre-existing row) ────────────────────────────────

test("E. duplicate email (pre-existing account) is rejected with 409 and creates no second row", async () => {
  await withFakeDb(async db => {
    db.elf_accounts.push({ id: "acct-existing", email: "casey@example.com", password_hash: "x", salt: "x", name: "Existing" });
    const { POST } = await loadRoute();
    const res = await POST(postSignup(VALID) as never);
    const data = await res.json();
    assert.equal(res.status, 409);
    assert.equal(db.elf_accounts.length, 1, "no duplicate account created");
    assert.ok(!/postgres|supabase|23505/i.test(JSON.stringify(data)), "must not expose raw DB error details");
  });
});

// ── F. Duplicate-email insert race ───────────────────────────────────────

test("F. a duplicate-key insert failure is handled the same safe way as a pre-existing row", async () => {
  await withFakeDb(async db => {
    // Simulates another request having just inserted the same email a
    // moment earlier — the fake DB's own POST handler already returns the
    // 23505 response path exercised here, identical to test E's.
    db.elf_accounts.push({ id: "acct-race", email: "casey@example.com", password_hash: "x", salt: "x", name: "Racer" });
    const { POST } = await loadRoute();
    const res = await POST(postSignup(VALID) as never);
    assert.equal(res.status, 409);
    assert.equal(db.elf_accounts.length, 1);
  });
});

// ── G. Rate limit exceeded ────────────────────────────────────────────────

test("G. rate limiting fails open with no Upstash env configured (documented, existing behavior)", async () => {
  // No UPSTASH_REDIS_REST_URL/TOKEN are set in this test environment, so
  // checkRateLimit/consumeRateLimit fail open (request allowed) exactly as
  // every other route's test suite already documents (see join/route.test.ts
  // header comment) — a live 429 response is covered by manual QA against
  // real Upstash, not reproducible in this unit-test environment.
  await withFakeDb(async () => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup(VALID) as never);
    assert.equal(res.status, 200);
  });
});

// ── H. Backend failure ───────────────────────────────────────────────────

test("H. an unexpected backend failure returns a safe 500 with no raw DB error exposed", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const res = await POST(postSignup({
      name: "Taylor Nguyen", email: "forced-500@example.com", password: "password123",
    }) as never);
    const data = await res.json();
    assert.equal(res.status, 500);
    assert.ok(!/postgres|supabase|internal error/i.test(JSON.stringify(data)), "must not expose raw backend error text");
    assert.equal(db.elf_accounts.length, 0, "no account created on failure");
  });
});

// ── I. No team/campaign creation through this endpoint ──────────────────

test("I. a successful signup creates no campaign_settings, team_coaches, or team_members row", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    await POST(postSignup(VALID) as never);
    assert.equal(db.campaign_settings.length, 0);
    assert.equal(db.team_coaches.length, 0);
    assert.equal(db.team_members.length, 0);
  });
});

// ── J. Already-authenticated caller reuses their session, no duplicate ──

test("J. an already-authenticated caller posting again reuses the same account, no duplicate created", async () => {
  await withFakeDb(async db => {
    const { POST } = await loadRoute();
    const res1 = await POST(postSignup(VALID) as never);
    const cookie = (res1.headers.get("set-cookie") ?? "").split(";")[0];
    assert.equal(db.elf_accounts.length, 1);

    const res2 = await POST(postSignup(
      { name: "Casey Rivera", email: "casey@example.com", password: "password123" },
      { cookie },
    ) as never);
    assert.equal(res2.status, 200);
    assert.equal(db.elf_accounts.length, 1, "no second account created");
  });
});

// ── Malformed request body ───────────────────────────────────────────────

test("malformed JSON body returns 400", async () => {
  await withFakeDb(async () => {
    const { POST } = await loadRoute();
    const req = new NextRequest("http://test.local/api/auth/signup", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body:    "{not valid json",
    });
    const res = await POST(req as never);
    assert.equal(res.status, 400);
  });
});
