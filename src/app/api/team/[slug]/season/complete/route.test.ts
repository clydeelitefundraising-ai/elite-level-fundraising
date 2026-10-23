// Complete Season Phase 5A — POST /api/team/[slug]/season/complete.
// The real getTeamActor() resolves signed cookies against the attendance
// tests' fake PostgREST world; team_season_preview(), team_season_complete()
// and Stripe are faked here. The database function itself (locks, replays,
// stale fingerprints, blockers, the transition) is tested against real
// PostgreSQL in supabase/tests/phase_s4_season_complete_access/.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { SLUG, ROLES, makeWorld, clearCookies } = await import("../../attendance/testSupport/attendanceWorld.mjs");
const { NextRequest } = await import("../../../../../../lib/testSupport/nextServerStub.mjs");
const route = await import("./route.ts");
const { confirmationMatches, normalizeConfirmation, parseCompletionRequest, classifyCompletionError, isSeasonCompletionEnabled, allowUnverifiedCheckouts } =
  await import("../../../../../../lib/seasonComplete.ts");

const FP = "0123456789abcdef0123456789abcdef";
const KEY = "11111111-2222-4333-8444-555555555555";
const PREVIEW = {
  from: { slug: SLUG, season_label: "2027 Season", school_name: "Wolves HS", sport_name: "Track", program_id: "p", has_organization: true,
          archived: false, completed: false, successor_slug: null, fundraising_enabled: true },
  proposed: { slug: "wolves-2028", slug_source: "derived", slug_available: true, season_label: "2028 Season", label_source: "derived",
              confirmation_phrase: "COMPLETE 2027 SEASON" },
  actor: { kind: "head_coach" },
  roster: { total: 3, graduating: 1, returning: 2, freshman_to_sophomore: 0, sophomore_to_junior: 0, junior_to_senior: 1, unchanged_middle_school: 0,
            flagged: [] },
  members: { athletes_carried: 0, parents_carried: 1, boosters_carried: 0, athletes_graduated: 0, parents_graduates_only: 0,
             unlinked_not_carried: 0, parent_links_carried: 1, must_rejoin: [] },
  coaches: { head_carried: 1, assistant_carried: 1, booster_carried: 0, actor_carried: true, must_rejoin: [] },
  calendar: { cutoff_local_date: "2026-10-19", future_events_to_copy: 0, subscription_moves: false },
  copied: { fund_uses: 0, store_products: 0, team_contact_goal: false, team_goal_cents: 0, default_athlete_goal_cents: null },
  left_in_history: { announcements: 0, message_threads: 0, attendance_sessions: 0, donations: 0, team_sponsors: 0, todo_tasks: 0, clearance_resources: 0 },
  open_items: { pending_athlete_requests: 0, pending_parent_requests: 0, pending_staff_invitations: 0, pending_fundraising_inquiries: 0,
                donations_last_24h: 0, recent_attendance_drafts: 0 },
  blockers: [] as string[], warnings: [] as string[], fingerprint: FP,
};
const RESULT = {
  transition_id: "t-1", from_slug: SLUG, to_slug: "wolves-2028", to_season_label: "2028 Season", program_id: "p", join_code: "ABC123",
  completed_at: "2026-10-23T10:00:00Z", summary: { athletes_carried: 2, athletes_graduated: 1 }, replayed: false,
};

type Rpc = { status: number; body: unknown } | "throw";
// stripeKey: by default a test-mode key is set and Stripe reports no open
// checkouts (payments verified); null = Stripe unconfigured.
type Opts = { preview?: Rpc; complete?: Rpc | Rpc[]; stripe?: Rpc; flags?: { preview?: string; execute?: string }; stripeKey?: string | null;
              env?: Record<string, string | undefined> };
type Calls = { preview: Record<string, unknown>[]; complete: Record<string, unknown>[]; stripe: string[] };

async function withWorld(opts: Opts, run: (calls: Calls) => Promise<void>) {
  const w = makeWorld();
  const calls: Calls = { preview: [], complete: [], stripe: [] };
  const realFetch = globalThis.fetch;
  const saved = { p: process.env.COMPLETE_SEASON_PREVIEW, e: process.env.COMPLETE_SEASON_EXECUTE, s: process.env.STRIPE_SECRET_KEY };
  const set = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  const flags = opts.flags ?? { preview: "true", execute: "true" };
  set("COMPLETE_SEASON_PREVIEW", flags.preview);
  set("COMPLETE_SEASON_EXECUTE", flags.execute);
  set("STRIPE_SECRET_KEY", opts.stripeKey === undefined ? "sk_test_default" : (opts.stripeKey ?? undefined));
  const savedExtra = Object.fromEntries(Object.keys(opts.env ?? {}).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(opts.env ?? {})) set(k, v);
  const completes = Array.isArray(opts.complete) ? [...opts.complete] : null;
  const reply = (r: Rpc) => { if (r === "throw") throw new Error("network"); return new Response(JSON.stringify(r.body), { status: r.status }); };
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith("https://api.stripe.com/")) { calls.stripe.push(u); return reply(opts.stripe ?? { status: 200, body: { data: [], has_more: false } }); }
    if (u.endsWith("/rest/v1/rpc/team_season_preview")) { calls.preview.push(JSON.parse(String(init?.body))); return reply(opts.preview ?? { status: 200, body: PREVIEW }); }
    if (u.endsWith("/rest/v1/rpc/team_season_complete_checked")) {
      calls.complete.push(JSON.parse(String(init?.body)));
      return reply(completes ? (completes.shift() ?? { status: 500, body: {} }) : ((opts.complete as Rpc | undefined) ?? { status: 200, body: RESULT }));
    }
    // Modules captured the fake Supabase URL at import; the world resolves
    // paths against the current one (a test may switch to a QA-shaped env).
    return w.fetchImpl(u.replace("https://fake.supabase.co", process.env.NEXT_PUBLIC_SUPABASE_URL!), init);
  }) as typeof fetch;
  try { await run(calls); } finally {
    globalThis.fetch = realFetch;
    set("COMPLETE_SEASON_PREVIEW", saved.p); set("COMPLETE_SEASON_EXECUTE", saved.e); set("STRIPE_SECRET_KEY", saved.s);
    for (const [k, v] of Object.entries(savedExtra)) set(k, v);
    clearCookies();
  }
}

const GOOD = { fingerprint: FP, idempotencyKey: KEY, confirmTeamSlug: SLUG, confirmation: "complete 2027 season" };
const post = (body: unknown, slug = SLUG) => route.POST(
  new NextRequest(`http://test.local/api/team/${slug}/season/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never,
  { params: Promise.resolve({ slug }) });
const body = async (res: Response) => JSON.parse(await res.text());
const dbError = (message: string, code = "P0001") => ({ status: 400, body: { code, message, details: null, hint: null } });

// ── Pure helpers ───────────────────────────────────────────────────────

test("helpers: flags, confirmation normalization, request validation", () => {
  assert.equal(isSeasonCompletionEnabled({}), false);
  assert.equal(isSeasonCompletionEnabled({ COMPLETE_SEASON_PREVIEW: "true" }), false, "preview alone never enables completion");
  assert.equal(isSeasonCompletionEnabled({ COMPLETE_SEASON_EXECUTE: "true" }), false);
  assert.equal(isSeasonCompletionEnabled({ COMPLETE_SEASON_PREVIEW: "true", COMPLETE_SEASON_EXECUTE: "TRUE" }), false);
  assert.equal(isSeasonCompletionEnabled({ COMPLETE_SEASON_PREVIEW: "true", COMPLETE_SEASON_EXECUTE: "true" }), true);
  assert.equal(normalizeConfirmation("  complete   2027  season "), "COMPLETE 2027 SEASON");
  const exp = { teamSlug: "lions-track-2027", phrase: "COMPLETE 2027 SEASON" };
  assert.ok(confirmationMatches({ teamSlug: " Lions-Track-2027 ", phrase: "complete 2027 season" }, exp));
  assert.ok(!confirmationMatches({ teamSlug: "lions-track-2028", phrase: "COMPLETE 2027 SEASON" }, exp), "wrong team");
  assert.ok(!confirmationMatches({ teamSlug: "lions-track-2027", phrase: "COMPLETE 2026 SEASON" }, exp), "wrong season");
  assert.ok(!confirmationMatches({ teamSlug: "lions-track-2027", phrase: "" }, exp));
  assert.ok(!confirmationMatches({ teamSlug: "x", phrase: "" }, { teamSlug: "x", phrase: "" }), "an empty expected phrase never matches");
  assert.ok(parseCompletionRequest(GOOD).ok);
  for (const bad of [{ ...GOOD, fingerprint: "xyz" }, { ...GOOD, idempotencyKey: "not-a-uuid" }, { ...GOOD, toSlug: "Bad Slug!" },
                     { ...GOOD, toSeasonLabel: "x".repeat(41) }, { ...GOOD, confirmation: "x".repeat(101) }, null, "string"]) {
    assert.equal(parseCompletionRequest(bad).ok, false, JSON.stringify(bad));
  }
});

test("database errors map to fixed codes and never echo the database's text", () => {
  const cases: [string, string, string?][] = [
    ["season_preview_stale", "stale"], ["season_roster_changed_during_transition", "stale"], ["season_plan_mismatch", "stale"],
    ["season_already_completed", "already_completed"], ["season_confirmation_mismatch", "confirmation"],
    ["season_idempotency_conflict", "duplicate_conflict"], ["season_actor_not_authorized", "forbidden"],
    ["season_actor_account_required", "account_required"], ["season_team_not_found", "not_found"],
    ["season_pending_athlete_requests", "blocked", "season_pending_athlete_requests"],
  ];
  for (const [message, failure, blocker] of cases) {
    const c = classifyCompletionError(JSON.stringify({ code: "P0001", message }));
    assert.equal(c.failure, failure, message);
    if (blocker) assert.equal(c.blocker, blocker);
  }
  assert.equal(classifyCompletionError(JSON.stringify({ code: "55P03", message: "canceling statement due to lock timeout" })).failure, "busy");
  assert.equal(classifyCompletionError(JSON.stringify({ code: "42501", message: "permission denied for function team_season_complete" })).failure, "not_permitted");
  assert.equal(classifyCompletionError("not json").failure, "error");
});

// ── Feature flags and authorization ────────────────────────────────────

test("flags: 404 unless BOTH the preview and execute flags are exactly \"true\"; nothing is called", async () => {
  for (const flags of [{}, { preview: "true" }, { execute: "true" }, { preview: "true", execute: "1" }, { preview: "false", execute: "true" }]) {
    await withWorld({ flags }, async calls => {
      ROLES.head();
      const res = await post(GOOD);
      assert.equal(res.status, 404, JSON.stringify(flags));
      assert.equal(calls.preview.length + calls.complete.length, 0);
    });
  }
});

test("Assistant Coach, boosters, athlete, parent: 403 before anything is asked", async () => {
  for (const role of ["assistant", "boosterCoach", "boosterMember", "athlete", "parent"] as const) {
    await withWorld({}, async calls => {
      ROLES[role]();
      const res = await post(GOOD);
      assert.equal(res.status, 403, role);
      assert.equal(calls.preview.length + calls.complete.length, 0, role);
    });
  }
});

test("signed out, another team's Head Coach, a forged cookie: refused, nothing called", async () => {
  for (const role of ["nobody", "otherTeamHead", "forged"] as const) {
    await withWorld({}, async calls => {
      ROLES[role]();
      const res = await post(GOOD);
      assert.ok(res.status === 401 || res.status === 403, `${role}: ${res.status}`);
      assert.equal(calls.complete.length, 0, role);
    });
  }
});

// ── Success ────────────────────────────────────────────────────────────

test("Head Coach: completes; the database gets the session's actor, the typed phrase and the confirmation id; a receipt with both links", async () => {
  await withWorld({}, async calls => {
    ROLES.head();
    const res = await post({ ...GOOD, coach_id: "evil", p_actor: { platform_admin_id: "evil" }, actor: "evil" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const b = await body(res);
    assert.deepEqual(calls.complete, [{
      p_from_slug: SLUG, p_actor: { coach_id: "coach-head" }, p_to_slug: null, p_to_season_label: null,
      p_expected_fingerprint: FP, p_idempotency_key: KEY, p_confirmation: "complete 2027 season",
    }], "identity comes only from the session; the database re-checks the phrase");
    assert.equal(b.receipt.toSlug, "wolves-2028");
    assert.equal(b.receipt.newSeasonUrl, "/team/wolves-2028/home");
    assert.equal(b.receipt.archivedSeasonUrl, `/team/${SLUG}/home`);
    assert.equal(b.receipt.replayed, false);
    assert.equal(b.receipt.joinCode, undefined, "the new join code isn't echoed in the receipt");
  });
});

test("platform admin: completes as the session's platform admin", async () => {
  await withWorld({}, async calls => {
    ROLES.admin();
    const res = await post(GOOD);
    assert.equal(res.status, 200);
    assert.deepEqual(calls.complete[0].p_actor, { platform_admin_id: "pa-1" });
  });
});

test("the next season's name/address the coach previewed are sent to both the preview and the transition", async () => {
  await withWorld({}, async calls => {
    ROLES.head();
    const res = await post({ ...GOOD, toSlug: "wolves-varsity-2028", toSeasonLabel: "2027-28 Season" });
    assert.equal(res.status, 200);
    assert.equal(calls.preview[0].p_to_slug, "wolves-varsity-2028");
    assert.equal(calls.complete[0].p_to_slug, "wolves-varsity-2028");
    assert.equal(calls.complete[0].p_to_season_label, "2027-28 Season");
  });
});

// ── Server-side revalidation (nothing is executed) ─────────────────────

test("invalid request bodies: 400, the transition is never called", async () => {
  for (const bad of [{ ...GOOD, fingerprint: "" }, { ...GOOD, idempotencyKey: "x" }, { ...GOOD, toSlug: "BAD!" }]) {
    await withWorld({}, async calls => {
      ROLES.head();
      const res = await post(bad);
      assert.equal(res.status, 400);
      assert.equal(calls.complete.length, 0);
    });
  }
});

test("stale preview: the season changed since the coach loaded it → 409 stale, nothing executed", async () => {
  await withWorld({ preview: { status: 200, body: { ...PREVIEW, fingerprint: "f".repeat(32) } } }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 409);
    assert.equal((await body(res)).code, "stale");
    assert.equal(calls.complete.length, 0);
  });
});

test("blockers in the fresh preview → 409 with the blockers, nothing executed", async () => {
  const blockers = ["season_pending_athlete_requests", "season_pending_staff_invitations"];
  await withWorld({ preview: { status: 200, body: { ...PREVIEW, blockers } } }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    const b = await body(res);
    assert.equal(res.status, 409);
    assert.deepEqual(b.blockers, blockers);
    assert.equal(calls.complete.length, 0);
  });
});

test("typed confirmation must name THIS team and THIS season → otherwise 400, nothing executed", async () => {
  for (const bad of [{ ...GOOD, confirmTeamSlug: "hawks" }, { ...GOOD, confirmTeamSlug: "" }, { ...GOOD, confirmation: "COMPLETE 2026 SEASON" }, { ...GOOD, confirmation: "" }]) {
    await withWorld({}, async calls => {
      ROLES.head();
      const res = await post(bad);
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal((await body(res)).code, "confirmation");
      assert.equal(calls.complete.length, 0);
    });
  }
});

test("payments: an open Stripe checkout for this team blocks completion; another team's doesn't", async () => {
  const open = { status: 200, body: { data: [{ metadata: { campaign_slug: SLUG } }], has_more: false } };
  await withWorld({ stripeKey: "sk_test_x", stripe: open }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 409);
    assert.equal((await body(res)).code, "open_checkouts");
    assert.equal(calls.complete.length, 0);
  });
  const otherTeam = { status: 200, body: { data: [{ metadata: { campaign_slug: "hawks" } }], has_more: false } };
  await withWorld({ stripeKey: "sk_test_x", stripe: otherTeam }, async calls => {
    ROLES.head();
    assert.equal((await post(GOOD)).status, 200, "another team's checkout doesn't block");
    assert.equal(calls.complete.length, 1);
  });
});

// ── Phase 5B: payments fail closed ─────────────────────────────────────
// A valid QA deployment's configuration (synthetic values only).
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const QA_ENV: Record<string, string | undefined> = {
  ELF_DEPLOYMENT: "qa",
  ELF_QA_SUPABASE_REF: "mzsvbxosoidwhntpjdkf",
  NEXT_PUBLIC_SUPABASE_URL: "https://mzsvbxosoidwhntpjdkf.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ iss: "supabase", ref: "mzsvbxosoidwhntpjdkf", role: "service_role" })}.c2ln`,
  NEXT_PUBLIC_APP_URL: "https://elf-team-qa-clydeelitefundraising-5717s-projects.vercel.app",
  ADMIN_PEPPER: "s4", ADMIN_PASSWORD: "s5", CALENDAR_SYNC_PEPPER: "s6", CRON_SECRET: "s7",
};

test("payments unverified fail closed: Stripe unconfigured → 503, nothing executed", async () => {
  await withWorld({ stripeKey: null }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 503);
    assert.equal((await body(res)).code, "payments_unverified");
    assert.equal(calls.complete.length, 0);
  });
});

test("payments unverified fail closed: Stripe configured but failing (error, outage, bad answer) → 503, even with the QA override set", async () => {
  for (const stripe of [{ status: 500, body: {} }, "throw" as const, { status: 200, body: { unexpected: true } }]) {
    await withWorld({ stripe, env: { ...QA_ENV, ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: "true" } }, async calls => {
      ROLES.head();
      const res = await post(GOOD);
      assert.equal(res.status, 503, JSON.stringify(stripe));
      assert.equal(calls.complete.length, 0);
    });
  }
});

test("QA-only override: proceeds ONLY in a valid QA deployment with Stripe unconfigured; the receipt says payments were unverified", async () => {
  await withWorld({ stripeKey: null, env: { ...QA_ENV, ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: "true" } }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 200);
    const text = JSON.stringify(await body(res));
    assert.equal(JSON.parse(text).receipt.paymentsUnverified, true);
    assert.ok(!/join_?code|ABC123/i.test(text), "no join code in the receipt");
    assert.equal(calls.complete.length, 1);
  });
  // Production-shaped configuration (no QA signals) with the override set: refused.
  await withWorld({ stripeKey: null, env: { ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: "true" } }, async calls => {
    ROLES.head();
    assert.equal((await post(GOOD)).status, 503, "not a QA deployment");
    assert.equal(calls.complete.length, 0);
  });
  // QA deployment, override set to anything but "true": refused.
  await withWorld({ stripeKey: null, env: { ...QA_ENV, ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: "1" } }, async calls => {
    ROLES.head();
    assert.equal((await post(GOOD)).status, 503);
    assert.equal(calls.complete.length, 0);
  });
  // QA signals present but the QA configuration is invalid (production Supabase URL): refused.
  await withWorld({ stripeKey: null, env: { ...QA_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://nggabucgcoaffpppchsp.supabase.co", ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: "true" } }, async calls => {
    ROLES.head();
    assert.equal((await post(GOOD)).status, 503);
    assert.equal(calls.complete.length, 0);
  });
});

test("allowUnverifiedCheckouts: pure policy", () => {
  const ok = { ...QA_ENV, ADMIN_PEPPER: "x", ELF_ACCOUNT_PEPPER: "x", TEAM_COACH_PEPPER: "x", TEAM_MEMBER_PEPPER: "x", ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: "true" };
  assert.equal(allowUnverifiedCheckouts(ok), true);
  assert.equal(allowUnverifiedCheckouts({ ...ok, STRIPE_SECRET_KEY: "sk_test_x" }), false, "Stripe configured");
  assert.equal(allowUnverifiedCheckouts({ ...ok, ELF_DEPLOYMENT: undefined, ELF_QA_SUPABASE_REF: undefined, NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }), false, "not QA");
  assert.equal(allowUnverifiedCheckouts({ ...ok, ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: undefined }), false, "not requested");
  assert.equal(allowUnverifiedCheckouts({ ELF_QA_ALLOW_UNVERIFIED_CHECKOUTS: "true" }), false, "production-shaped");
});

test("preview failures stop before the transition (legacy Head Coach, missing grant, database error)", async () => {
  for (const [rpc, status] of [
    [dbError("season_actor_account_required"), 403],
    [{ status: 401, body: { code: "42501", message: "permission denied for function team_season_preview" } }, 503],
    [{ status: 500, body: { message: "boom" } }, 500],
  ] as const) {
    await withWorld({ preview: rpc }, async calls => {
      ROLES.head();
      assert.equal((await post(GOOD)).status, status);
      assert.equal(calls.complete.length, 0);
    });
  }
});

// ── The database's own refusals ────────────────────────────────────────

test("database refusals map to clear answers and never leak the database's text", async () => {
  const cases: [Rpc, number, string][] = [
    [dbError("season_preview_stale"), 409, "stale"],
    [dbError("season_confirmation_mismatch"), 400, "confirmation"],
    [dbError("season_idempotency_conflict"), 409, "duplicate_conflict"],
    [dbError("canceling statement due to lock timeout", "55P03"), 409, "busy"],
    [dbError("season_pending_parent_requests"), 409, "blocked"],
    [{ status: 401, body: { code: "42501", message: "permission denied for function team_season_complete" } }, 503, "not_permitted"],
    [{ status: 500, body: { message: "internal detail: Sam Senior row 42" } }, 500, "error"],
    ["throw", 500, "error"],
  ];
  for (const [rpc, status, code] of cases) {
    await withWorld({ complete: rpc }, async () => {
      ROLES.head();
      const res = await post(GOOD);
      const text = await res.text();
      assert.equal(res.status, status, code);
      assert.equal(JSON.parse(text).code, code);
      assert.ok(!text.includes("Sam Senior") && !text.includes("permission denied") && !text.includes("lock timeout"), code);
    });
  }
});

// ── Repeats, duplicates and concurrency ────────────────────────────────

test("retry after a lost response: an already-completed season goes straight to the database, which replays the receipt", async () => {
  const completed = { ...PREVIEW, from: { ...PREVIEW.from, completed: true, archived: true, successor_slug: "wolves-2028" },
                      blockers: ["season_already_completed"], fingerprint: "e".repeat(32) };
  await withWorld({ preview: { status: 200, body: completed }, complete: { status: 200, body: { ...RESULT, replayed: true } } }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 200);
    assert.equal((await body(res)).receipt.replayed, true);
    assert.equal(calls.complete[0].p_idempotency_key, KEY);
  });
});

test("Phase 5B timeout → retry: the request dies after the database committed; the retry (same id) gets the receipt, never a join code; payments aren't re-checked for a completed season", async () => {
  const completed = { ...PREVIEW, from: { ...PREVIEW.from, completed: true, archived: true, successor_slug: "wolves-2028" },
                      blockers: ["season_already_completed"], fingerprint: "e".repeat(32) };
  // 1) The first request times out (network error after the commit): a safe-to-retry 500.
  await withWorld({ complete: "throw" }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 500);
    assert.match((await body(res)).error, /safely try again/);
    assert.equal(calls.complete.length, 1);
  });
  // 2) The retry: the season now shows completed; Stripe is unconfigured but irrelevant to a replay.
  await withWorld({ stripeKey: null, preview: { status: 200, body: completed },
                    complete: { status: 200, body: { ...RESULT, replayed: true } } }, async calls => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 200);
    const text = JSON.stringify(await body(res));
    assert.equal(JSON.parse(text).receipt.replayed, true);
    assert.equal(JSON.parse(text).receipt.paymentsUnverified, undefined);
    assert.ok(!/join_?code|ABC123/i.test(text), "no join code in the replayed receipt");
    assert.equal(calls.complete[0].p_idempotency_key, KEY);
    assert.equal(calls.stripe.length, 0);
  });
  // 3) Retried by someone the database no longer authorizes (e.g. demoted in the new season): 403.
  await withWorld({ preview: { status: 200, body: completed }, complete: dbError("season_actor_not_authorized") }, async () => {
    ROLES.head();
    const res = await post(GOOD);
    assert.equal(res.status, 403);
    assert.equal((await body(res)).receipt, undefined);
  });
});

test("a second completion with a new confirmation id → 409 already completed", async () => {
  const completed = { ...PREVIEW, from: { ...PREVIEW.from, completed: true }, blockers: ["season_already_completed"] };
  await withWorld({ preview: { status: 200, body: completed }, complete: dbError("season_already_completed") }, async () => {
    ROLES.head();
    const res = await post({ ...GOOD, idempotencyKey: "99999999-2222-4333-8444-555555555555" });
    assert.equal(res.status, 409);
    assert.equal((await body(res)).code, "already_completed");
  });
});

test("double submit (two simultaneous requests, same confirmation id): both forward the same key; the database answers once, then replays", async () => {
  await withWorld({ complete: [{ status: 200, body: RESULT }, { status: 200, body: { ...RESULT, replayed: true } }] }, async calls => {
    ROLES.head();
    const [a, b] = await Promise.all([post(GOOD), post(GOOD)]);
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const ra = (await body(a)).receipt, rb = (await body(b)).receipt;
    assert.equal(ra.transitionId, rb.transitionId);
    assert.deepEqual([ra.replayed, rb.replayed].sort(), [false, true]);
    assert.deepEqual(calls.complete.map(c => c.p_idempotency_key), [KEY, KEY]);
  });
});
