// Phase O2 — /api/team-onboarding/create route tests. Same technique as
// every other route test in this repo: real getAccountSession() cookie
// path (real makeAccountCookie/verifyAccountCookie) against a fetch-mocked
// in-memory Supabase layer, plus a mocked Upstash REST surface (the real
// rate-limit client also talks over plain fetch, so the same mock covers
// it — no second mocking system).
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.UPSTASH_REDIS_REST_URL    = "https://fake-upstash.example.com";
process.env.UPSTASH_REDIS_REST_TOKEN  = "fake-upstash-token";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest }       = await import("../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie }   = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");

type Row = Record<string, unknown>;

function makeFakeWorld(opts: { failInsertTable?: string } = {}) {
  const db: Record<string, Row[]> = {
    elf_accounts:      [],
    organizations:     [],
    campaign_settings: [],
    team_coaches:      [],
    team_join_codes:   [],
    audit_logs:        [],
  };
  let nextId = 1;
  const genId = (prefix: string) => `${prefix}-${nextId++}`;
  const redisCounters: Record<string, number> = {};

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === decodeURIComponent(expr.slice(3));
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order" || key === "on_conflict") continue;
      rows = rows.filter(r => matches(r, key, val));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    // ── Fake Upstash (rate limit) ────────────────────────────────────────────
    // The real @upstash/redis REST client auto-pipelines commands issued
    // close together in time: it POSTs a JSON array-of-command-arrays
    // (e.g. [["incr", key]]) to "<base>/pipeline" and expects an array of
    // { result } objects back (one per command, same order) — NOT a single
    // command / single { result } to the bare base URL, even for what the
    // calling code (consumeRateLimit) writes as separate sequential awaits.
    if (url.startsWith(process.env.UPSTASH_REDIS_REST_URL!)) {
      function runOne([cmd, key]: [string, string]): { result: unknown } {
        if (cmd === "incr") {
          redisCounters[key] = (redisCounters[key] ?? 0) + 1;
          return { result: redisCounters[key] };
        }
        if (cmd === "expire") return { result: 1 };
        if (cmd === "ttl")    return { result: 3600 };
        if (cmd === "get")    return { result: redisCounters[key] ?? null };
        return { result: null };
      }

      const parsed = JSON.parse(String(init?.body ?? "[]"));
      const isPipeline = url.endsWith("/pipeline") || url.endsWith("/multi-exec");
      if (isPipeline) {
        const results = (parsed as [string, ...unknown[]][]).map(cmd => runOne(cmd as [string, string]));
        return new Response(JSON.stringify(results), { status: 200 });
      }
      return new Response(JSON.stringify(runOne(parsed as [string, string])), { status: 200 });
    }

    // ── Fake Supabase REST ──────────────────────────────────────────────────
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const method = init?.method ?? "GET";
    const tableRows = db[table] ?? (db[table] = []);

    if (method === "GET") {
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));

      if (opts.failInsertTable === table) {
        return new Response(JSON.stringify({ code: "XXUNK", message: "simulated insert failure" }), { status: 500 });
      }

      if (table === "campaign_settings" && params.get("on_conflict") === "campaign_slug") {
        const dup = tableRows.find(r => r.campaign_slug === body.campaign_slug);
        if (dup) return new Response(JSON.stringify([]), { status: 201 }); // ignore-duplicates no-op
      }
      if (table === "organizations") {
        const dupSlug = tableRows.find(r => r.slug === body.slug);
        if (dupSlug) return new Response(JSON.stringify({ code: "23505", message: "duplicate slug" }), { status: 409 });
      }

      const row: Row = { id: genId(table), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }

    if (method === "DELETE") {
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id ?? r.campaign_slug));
      db[table] = tableRows.filter(r => !matchedIds.has(r.id ?? r.campaign_slug));
      return new Response(JSON.stringify(matched), { status: 200 });
    }

    return new Response(JSON.stringify([]), { status: 200 });
  }

  return { db, fetchImpl };
}

async function withFakeWorld<T>(run: (ctx: ReturnType<typeof makeFakeWorld>) => Promise<T>, opts?: { failInsertTable?: string }): Promise<T> {
  const ctx = makeFakeWorld(opts);
  const realFetch = globalThis.fetch;
  globalThis.fetch = ctx.fetchImpl as typeof fetch;
  try {
    return await run(ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function clearCookies() {
  __setTestCookie("elf_session", undefined);
}

function seedAccount(db: Record<string, Row[]>, overrides: Partial<Row> = {}): { id: string; salt: string } {
  const id = (overrides.id as string) ?? "acct-1";
  const salt = "s-acct";
  db.elf_accounts.push({ id, email: "coach@example.com", name: "Coach Mike", password_hash: "x", salt, profile_photo_url: null, ...overrides });
  return { id, salt };
}

function signIn(account: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("elf_session", makeAccountCookie(account.id, account.salt));
}

async function loadRoute() {
  return import("./route.ts");
}

function postRequest(body: Record<string, unknown>): Request {
  return new NextRequest("http://test.local/api/team-onboarding/create", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
}

const VALID_BODY = { schoolName: "Riverside High School", sportName: "Track", season: "2026" };

// ── AUTH ─────────────────────────────────────────────────────────────────

test("AUTH: anonymous request is rejected with 401", async () => {
  await withFakeWorld(async ({ db }) => {
    clearCookies();
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    assert.equal(res.status, 401);
    assert.equal(db.campaign_settings.length, 0);
  });
});

test("AUTH: an invalid/forged session cookie is rejected with 401", async () => {
  await withFakeWorld(async () => {
    clearCookies();
    __setTestCookie("elf_session", "acct-1:not-a-real-signature");
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    assert.equal(res.status, 401);
  });
});

test("AUTH: a valid elf_session is allowed", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    assert.equal(res.status, 200);
  });
});

test("AUTH: a client-supplied accountId in the body is ignored — the coach is linked to the SESSION account", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, accountId: "someone-elses-account" }) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    const coach = db.team_coaches.find(c => c.campaign_slug === data.campaign_slug);
    assert.equal(coach?.account_id, account.id);
  });
});

test("AUTH: a client-supplied role in the body is ignored — the creator always becomes head_coach", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, role: "assistant_coach" }) as never);
    const data = await res.json();
    const coach = db.team_coaches.find(c => c.campaign_slug === data.campaign_slug);
    assert.equal(coach?.role, "head_coach");
  });
});

// ── VALIDATION ───────────────────────────────────────────────────────────

test("VALIDATION: blank school name is rejected with 400", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, schoolName: "   " }) as never);
    assert.equal(res.status, 400);
  });
});

test("VALIDATION: blank sport is rejected with 400", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, sportName: "" }) as never);
    assert.equal(res.status, 400);
  });
});

test("VALIDATION: blank season is rejected with 400", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, season: "" }) as never);
    assert.equal(res.status, 400);
  });
});

test("VALIDATION: an oversized school name is truncated, not rejected (matches the established clean()/MAX_FIELD convention)", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, schoolName: "A".repeat(500) }) as never);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.school_name.length <= 200, true);
  });
});

// ── SEASON (canonical four-digit-year correction) ───────────────────────

const AMBIGUOUS_SEASONS = ["26", "26-27", "2026-27", "Fall 2026", "Spring 2027", "abcd", "0000", "9999"];

for (const bad of AMBIGUOUS_SEASONS) {
  test(`SEASON: "${bad}" is rejected with 400, never silently coerced`, async () => {
    await withFakeWorld(async ({ db }) => {
      const account = seedAccount(db);
      signIn(account);
      const { POST } = await loadRoute();
      const res = await POST(postRequest({ ...VALID_BODY, season: bad }) as never);
      assert.equal(res.status, 400);
      assert.equal(db.campaign_settings.length, 0);
    });
  });
}

test("SEASON: a surrounding-whitespace year ('  2027  ') is accepted and normalized to '2027'", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, season: "  2027  " }) as never);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.season, "2027");
  });
});

test("SEASON: the canonical (normalized) season is what is written to campaign_settings", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, season: " 2029 " }) as never);
    const data = await res.json();
    const campaign = db.campaign_settings.find(c => c.campaign_slug === data.campaign_slug);
    assert.equal(campaign?.season, "2029");
  });
});

test("SEASON: the canonical (normalized) season feeds slug generation, not the raw input", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ schoolName: "Riverside", sportName: "Track", season: "  2029  " }) as never);
    const data = await res.json();
    assert.equal(data.campaign_slug, "riverside-track-2029");
  });
});

// ── SLUG ─────────────────────────────────────────────────────────────────

test("SLUG: deterministic slug matches generateCampaignSlug's own algorithm", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    const data = await res.json();
    assert.equal(data.campaign_slug, "riverside-track-2026");
  });
});

test("SLUG: a duplicate slug is rejected with 409, existing campaign never overwritten, no new coach/join-code created", async () => {
  await withFakeWorld(async ({ db }) => {
    db.campaign_settings.push({ campaign_slug: "riverside-track-2026", school_name: "Riverside High School", sport_name: "Track", season: "2026", marker: "ORIGINAL" });
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    assert.equal(res.status, 409);
    assert.equal(db.campaign_settings.length, 1);
    assert.equal(db.campaign_settings[0].marker, "ORIGINAL");
    assert.equal(db.team_coaches.length, 0);
    assert.equal(db.team_join_codes.length, 0);
  });
});

test("SLUG: a duplicate-slug conflict never grants the new creator access to the existing team", async () => {
  await withFakeWorld(async ({ db }) => {
    db.campaign_settings.push({ campaign_slug: "riverside-track-2026", school_name: "Riverside High School", sport_name: "Track", season: "2026" });
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    await POST(postRequest(VALID_BODY) as never);
    const coachForThisSlug = db.team_coaches.find(c => c.campaign_slug === "riverside-track-2026" && c.account_id === account.id);
    assert.equal(coachForThisSlug, undefined);
  });
});

// ── ORGANIZATION ─────────────────────────────────────────────────────────

test("ORGANIZATION: an existing exact school_name match is reused, no new organization created", async () => {
  await withFakeWorld(async ({ db }) => {
    db.organizations.push({ id: "org-existing", slug: "riverside-high-school", school_name: "Riverside High School" });
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(db.organizations.length, 1);
    const campaign = db.campaign_settings.find(c => c.campaign_slug === data.campaign_slug);
    assert.equal(campaign?.organization_id, "org-existing");
  });
});

test("ORGANIZATION: no existing match creates the minimum organization record", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(db.organizations.length, 1);
    assert.equal(db.organizations[0].school_name, "Riverside High School");
    const campaign = db.campaign_settings.find(c => c.campaign_slug === data.campaign_slug);
    assert.equal(campaign?.organization_id, db.organizations[0].id);
  });
});

test("ORGANIZATION: a different-case school name is NOT fuzzily merged into an existing organization", async () => {
  await withFakeWorld(async ({ db }) => {
    db.organizations.push({ id: "org-existing", slug: "riverside-high-school", school_name: "Riverside High School" });
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ ...VALID_BODY, schoolName: "riverside high school" }) as never);
    assert.equal(res.status, 200);
    // Exact (case-sensitive) match only — a different-case name creates its
    // own second organization rather than reusing the existing one.
    assert.equal(db.organizations.length, 2);
  });
});

// ── PROVISIONING ─────────────────────────────────────────────────────────

test("PROVISIONING: full success creates campaign_settings, Head Coach, join code — fundraising stays off", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db, { id: "acct-prov", name: "Coach Pat", email: "pat@example.com" });
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    const data = await res.json();
    assert.equal(res.status, 200);

    const campaign = db.campaign_settings.find(c => c.campaign_slug === data.campaign_slug);
    assert.ok(campaign);
    // fundraising_enabled is never written by this code path at all — in
    // real Postgres this means the column's own DEFAULT false applies; in
    // this fake DB, proving the key is simply absent from the inserted row
    // is the equivalent assertion.
    assert.equal("fundraising_enabled" in campaign!, false);
    assert.equal(campaign?.allow_coach_fundraising, false);

    const coach = db.team_coaches.find(c => c.campaign_slug === data.campaign_slug);
    assert.ok(coach);
    assert.equal(coach?.role, "head_coach");
    assert.equal(coach?.account_id, "acct-prov");
    assert.equal(coach?.name, "Coach Pat");
    assert.equal(coach?.email, "pat@example.com");

    const joinCode = db.team_join_codes.find(j => j.campaign_slug === data.campaign_slug);
    assert.ok(joinCode);
    assert.equal(typeof joinCode?.code, "string");

    // No duplicate elf_accounts row — the account already existed.
    assert.equal(db.elf_accounts.length, 1);
  });
});

test("PROVISIONING: the new team is discoverable by the same account_id lookup getAccountTeams uses", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    const data = await res.json();

    // Mirrors accountSession.ts's getAccountTeams query shape exactly:
    // team_coaches filtered by account_id alone, no other join/cache.
    const discoverable = db.team_coaches.filter(c => c.account_id === account.id);
    assert.equal(discoverable.some(c => c.campaign_slug === data.campaign_slug), true);
  });
});

// ── FAILURE SAFETY ───────────────────────────────────────────────────────

test("FAILURE SAFETY: campaign_settings insert failure creates nothing downstream", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    assert.equal(res.status, 500);
    assert.equal(db.campaign_settings.length, 0);
    assert.equal(db.team_coaches.length, 0);
    assert.equal(db.team_join_codes.length, 0);
  }, { failInsertTable: "campaign_settings" });
});

test("FAILURE SAFETY: team_coaches insert failure rolls back the campaign_settings row it created", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    assert.equal(res.status, 500);
    assert.equal(db.campaign_settings.length, 0);
    assert.equal(db.team_coaches.length, 0);
    assert.equal(db.team_join_codes.length, 0);
  }, { failInsertTable: "team_coaches" });
});

test("FAILURE SAFETY: team_join_codes insert failure rolls back both team_coaches and campaign_settings", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest(VALID_BODY) as never);
    assert.equal(res.status, 500);
    assert.equal(db.campaign_settings.length, 0);
    assert.equal(db.team_coaches.length, 0);
  }, { failInsertTable: "team_join_codes" });
});

test("FAILURE SAFETY: rollback never deletes a PRE-EXISTING organization, even when later steps fail", async () => {
  await withFakeWorld(async ({ db }) => {
    db.organizations.push({ id: "org-existing", slug: "riverside-high-school", school_name: "Riverside High School" });
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    await POST(postRequest(VALID_BODY) as never);
    assert.equal(db.organizations.length, 1);
    assert.equal(db.organizations[0].id, "org-existing");
  }, { failInsertTable: "team_coaches" });
});

test("FAILURE SAFETY: rollback never touches an unrelated, pre-existing campaign/team", async () => {
  await withFakeWorld(async ({ db }) => {
    db.campaign_settings.push({ campaign_slug: "unrelated-team-2025", school_name: "Unrelated School", sport_name: "Soccer", season: "2025" });
    db.team_coaches.push({ id: "unrelated-coach", campaign_slug: "unrelated-team-2025", role: "head_coach", account_id: "unrelated-acct" });
    const account = seedAccount(db);
    signIn(account);
    const { POST } = await loadRoute();
    await POST(postRequest(VALID_BODY) as never);
    assert.equal(db.campaign_settings.some(c => c.campaign_slug === "unrelated-team-2025"), true);
    assert.equal(db.team_coaches.some(c => c.id === "unrelated-coach"), true);
  }, { failInsertTable: "team_coaches" });
});

// ── RATE LIMIT ───────────────────────────────────────────────────────────

test("RATE LIMIT: requests under the threshold are allowed", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db, { id: "acct-rl-1" });
    signIn(account);
    const { POST } = await loadRoute();
    const res = await POST(postRequest({ schoolName: "School One", sportName: "Track", season: "2026" }) as never);
    assert.equal(res.status, 200);
  });
});

test("RATE LIMIT: exceeding the threshold is rejected with 429", async () => {
  await withFakeWorld(async ({ db }) => {
    const account = seedAccount(db, { id: "acct-rl-2" });
    signIn(account);
    const { POST } = await loadRoute();
    const sports = ["Track", "Soccer", "Swim", "Golf", "Tennis", "Wrestling"];
    let lastRes;
    for (const sport of sports) {
      lastRes = await POST(postRequest({ schoolName: "Rate Limit School", sportName: sport, season: "2026" }) as never);
    }
    assert.equal(lastRes!.status, 429);
  });
});

test("RATE LIMIT: one account's usage never affects a different account", async () => {
  await withFakeWorld(async ({ db }) => {
    const accountA = seedAccount(db, { id: "acct-rl-a", email: "a@example.com" });
    signIn(accountA);
    const { POST } = await loadRoute();
    for (const sport of ["Track", "Soccer", "Swim", "Golf", "Tennis"]) {
      await POST(postRequest({ schoolName: "Shared School Name", sportName: sport, season: "2026" }) as never);
    }

    const accountB = seedAccount(db, { id: "acct-rl-b", email: "b@example.com" });
    signIn(accountB);
    const res = await POST(postRequest({ schoolName: "Shared School Name", sportName: "Baseball", season: "2026" }) as never);
    assert.equal(res.status, 200);
  });
});
