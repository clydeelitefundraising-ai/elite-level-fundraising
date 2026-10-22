// Complete Season Phase 3 — GET /api/team/[slug]/season/preview.
// The real getTeamActor() resolves signed cookies against the attendance
// tests' fake PostgREST world; team_season_preview() and Stripe are faked
// here. The database function itself is tested against real PostgreSQL in
// supabase/tests/phase_s3_season_preview_access/.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { SLUG, ROLES, makeWorld, clearCookies } = await import("../../attendance/testSupport/attendanceWorld.mjs");
const { NextRequest } = await import("../../../../../../lib/testSupport/nextServerStub.mjs");
const route = await import("./route.ts");

// A preview as team_season_preview() returns it (shape only matters here).
const PREVIEW = {
  from: { slug: SLUG, season_label: "2027 Season", school_name: "Wolves HS", sport_name: "Track", program_id: "p", has_organization: true,
          archived: false, completed: false, successor_slug: null, fundraising_enabled: true },
  proposed: { slug: "wolves-2028", slug_source: "derived", slug_available: true, season_label: "2028 Season", label_source: "derived",
              confirmation_phrase: "COMPLETE 2027 SEASON" },
  actor: { kind: "head_coach" },
  roster: { total: 3, graduating: 1, returning: 2, freshman_to_sophomore: 0, sophomore_to_junior: 0, junior_to_senior: 1, unchanged_middle_school: 0,
            flagged: [{ athlete_id: "a3", name: "Cy Clark", class_year: null, reason: "blank" }] },
  members: { athletes_carried: 0, parents_carried: 0, boosters_carried: 0, athletes_graduated: 0, parents_graduates_only: 1,
             unlinked_not_carried: 0, parent_links_carried: 0, must_rejoin: [{ member_id: "m-ath", name: "Ava Athlete", role: "athlete" }] },
  coaches: { head_carried: 1, assistant_carried: 1, booster_carried: 0, actor_carried: true, must_rejoin: [] },
  calendar: { cutoff_local_date: "2026-10-19", future_events_to_copy: 2, subscription_moves: false },
  copied: { fund_uses: 1, store_products: 0, team_contact_goal: true, team_goal_cents: 100000, default_athlete_goal_cents: 5000 },
  left_in_history: { announcements: 3, message_threads: 4, attendance_sessions: 5, donations: 6, team_sponsors: 2, todo_tasks: 1, clearance_resources: 0 },
  open_items: { pending_athlete_requests: 0, pending_parent_requests: 0, pending_staff_invitations: 0, pending_fundraising_inquiries: 0,
                donations_last_24h: 1, recent_attendance_drafts: 0 },
  blockers: [], warnings: ["season_flagged_grades", "season_recent_donations"], fingerprint: "0123456789abcdef0123456789abcdef",
};

type Rpc = { status: number; body: unknown };
async function withPreviewWorld(opts: { rpc?: Rpc; stripe?: Rpc | "throw"; flag?: string | undefined; stripeKey?: string | undefined },
                                run: (calls: { rpc: unknown[]; stripe: string[]; all: string[] }) => Promise<void>) {
  const w = makeWorld();
  const calls = { rpc: [] as unknown[], stripe: [] as string[], all: [] as string[] };
  const realFetch = globalThis.fetch;
  const prevFlag = process.env.COMPLETE_SEASON_PREVIEW;
  const prevKey = process.env.STRIPE_SECRET_KEY;
  if (opts.flag === undefined) delete process.env.COMPLETE_SEASON_PREVIEW; else process.env.COMPLETE_SEASON_PREVIEW = opts.flag;
  if (opts.stripeKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = opts.stripeKey;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.all.push(u);
    if (u.startsWith("https://api.stripe.com/")) {
      calls.stripe.push(u);
      if (opts.stripe === "throw") throw new Error("network");
      const s = opts.stripe ?? { status: 200, body: { data: [], has_more: false } };
      return new Response(JSON.stringify(s.body), { status: s.status });
    }
    if (u.endsWith("/rest/v1/rpc/team_season_preview")) {
      calls.rpc.push(JSON.parse(String(init?.body)));
      const r = opts.rpc ?? { status: 200, body: PREVIEW };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }
    return w.fetchImpl(u, init);
  }) as typeof fetch;
  try { await run(calls); } finally {
    globalThis.fetch = realFetch;
    if (prevFlag === undefined) delete process.env.COMPLETE_SEASON_PREVIEW; else process.env.COMPLETE_SEASON_PREVIEW = prevFlag;
    if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = prevKey;
    clearCookies();
  }
}
const get = (query = "", slug = SLUG) =>
  route.GET(new NextRequest(`http://test.local/api/team/${slug}/season/preview${query}`) as never, { params: Promise.resolve({ slug }) });
const body = async (res: Response) => JSON.parse(await res.text());

test("feature flag off (default): 404 for everyone, the database is never asked", async () => {
  for (const flag of [undefined, "false", "1", "TRUE", " true"]) {
    await withPreviewWorld({ flag }, async calls => {
      ROLES.head();
      const res = await get();
      assert.equal(res.status, 404, `flag=${flag}`);
      assert.equal(calls.rpc.length, 0);
    });
  }
});

test("Head Coach: 200 with the database's preview; the actor is the session's coach id", async () => {
  await withPreviewWorld({ flag: "true" }, async calls => {
    ROLES.head();
    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const b = await body(res);
    assert.deepEqual(b.preview, PREVIEW, "passed through unchanged — never recalculated or fabricated");
    assert.deepEqual(calls.rpc, [{ p_from_slug: SLUG, p_actor: { coach_id: "coach-head" }, p_to_slug: null, p_to_season_label: null }]);
  });
});

test("platform admin: 200; the actor is the session's platform admin id", async () => {
  await withPreviewWorld({ flag: "true" }, async calls => {
    ROLES.admin();
    const res = await get();
    assert.equal(res.status, 200);
    assert.deepEqual((calls.rpc[0] as { p_actor: unknown }).p_actor, { platform_admin_id: "pa-1" });
  });
});

test("Assistant Coach, boosters, athlete, parent: 403 before the database is asked — no names can leak", async () => {
  for (const role of ["assistant", "boosterCoach", "boosterMember", "athlete", "parent"] as const) {
    await withPreviewWorld({ flag: "true" }, async calls => {
      ROLES[role]();
      const res = await get();
      const text = await res.text();
      assert.equal(res.status, 403, role);
      assert.equal(calls.rpc.length, 0, `${role}: no preview requested`);
      assert.ok(!text.includes("Ava Athlete") && !text.includes("Cy Clark"), role);
    });
  }
});

test("signed out, another team's Head Coach, or a forged cookie: refused, no preview requested", async () => {
  for (const role of ["nobody", "otherTeamHead", "forged"] as const) {
    await withPreviewWorld({ flag: "true" }, async calls => {
      ROLES[role]();
      const res = await get();
      assert.ok(res.status === 401 || res.status === 403, `${role}: ${res.status}`);
      assert.equal(calls.rpc.length, 0, role);
    });
  }
});

test("identity can't be supplied by the client: query parameters never reach p_actor", async () => {
  await withPreviewWorld({ flag: "true" }, async calls => {
    ROLES.head();
    await get("?coach_id=evil&platform_admin_id=evil&p_actor=evil&actor=evil");
    assert.deepEqual((calls.rpc[0] as { p_actor: unknown }).p_actor, { coach_id: "coach-head" });
  });
});

test("new name/address overrides: valid ones are passed on, invalid ones are refused before the database", async () => {
  await withPreviewWorld({ flag: "true" }, async calls => {
    ROLES.head();
    assert.equal((await get("?next_slug=wolves-track-2028&next_label=Fall%202028")).status, 200);
    assert.deepEqual(calls.rpc[0], { p_from_slug: SLUG, p_actor: { coach_id: "coach-head" }, p_to_slug: "wolves-track-2028", p_to_season_label: "Fall 2028" });
    for (const q of ["?next_slug=Bad%20Slug", "?next_slug=ab", `?next_label=${"x".repeat(41)}`]) {
      const res = await get(q);
      assert.equal(res.status, 400, q);
    }
    assert.equal(calls.rpc.length, 1);
  });
});

test("migrations not applied: a clear 'not available' (503), never a made-up preview", async () => {
  for (const rpc of [
    { status: 404, body: { code: "PGRST202", message: "Could not find the function public.team_season_preview" } },
    { status: 404, body: { code: "42883", message: "function does not exist" } },
    { status: 401, body: { code: "42501", message: "permission denied for function team_season_preview" } },
  ]) {
    await withPreviewWorld({ flag: "true", rpc }, async () => {
      ROLES.head();
      const res = await get();
      const b = await body(res);
      assert.equal(res.status, 503, JSON.stringify(rpc.body));
      assert.equal(b.code, "preview_unavailable");
      assert.equal(b.preview, undefined);
    });
  }
});

test("database refusals map to clear answers and never echo the database message", async () => {
  const cases: [string, number, string][] = [
    ["season_actor_account_required", 403, "account_required"],
    ["season_actor_not_authorized", 403, "forbidden"],
    ["season_team_not_found", 404, "not_found"],
    ["something unexpected", 500, "error"],
  ];
  for (const [message, status, code] of cases) {
    await withPreviewWorld({ flag: "true", rpc: { status: 400, body: { code: "P0001", message } } }, async () => {
      ROLES.head();
      const res = await get();
      const text = await res.text();
      assert.equal(res.status, status, message);
      assert.equal(JSON.parse(text).code, code);
      assert.ok(!text.includes(message), "no database message echoed");
    });
  }
  await withPreviewWorld({ flag: "true", rpc: { status: 200, body: { unexpected: true } } }, async () => {
    ROLES.head();
    assert.equal((await get()).status, 500, "a malformed result is an error, not shown");
  });
});

test("open Stripe checkouts: counted for this team only (read-only list call); unknown when Stripe can't be asked", async () => {
  const stripe = { status: 200, body: { has_more: false, data: [
    { metadata: { campaign_slug: SLUG } }, { metadata: { campaign_slug: SLUG } }, { metadata: { campaign_slug: "hawks" } }, { metadata: null },
  ] } };
  await withPreviewWorld({ flag: "true", stripe, stripeKey: "sk_test_x" }, async calls => {
    ROLES.head();
    const b = await body(await get());
    assert.deepEqual(b.openCheckouts, { state: "checked", count: 2, more: false });
    assert.equal(calls.stripe.length, 1);
    assert.match(calls.stripe[0], /\/v1\/checkout\/sessions\?status=open&limit=100&created\[gte\]=\d+$/);
  });
  await withPreviewWorld({ flag: "true", stripeKey: undefined }, async calls => {
    ROLES.head();
    assert.deepEqual((await body(await get())).openCheckouts, { state: "unknown" });
    assert.equal(calls.stripe.length, 0);
  });
  for (const s of ["throw", { status: 500, body: {} }] as const) {
    await withPreviewWorld({ flag: "true", stripe: s, stripeKey: "sk_test_x" }, async () => {
      ROLES.head();
      assert.deepEqual((await body(await get())).openCheckouts, { state: "unknown" });
    });
  }
});

test("no execution path: the route only reads, and nothing in the app calls team_season_complete", async () => {
  assert.deepEqual(Object.keys(route).filter(k => /^(GET|POST|PUT|PATCH|DELETE)$/.test(k)), ["GET"]);
  assert.deepEqual(readdirSync(join(process.cwd(), "src/app/api/team/[slug]/season")), ["preview"]);
  const offenders: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx|mjs)$/.test(e.name) || e.name.endsWith(".test.ts")) continue;
      if (/team_season_complete/.test(readFileSync(p, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) offenders.push(p);
    }
  })(join(process.cwd(), "src"));
  assert.deepEqual(offenders, []);
  await withPreviewWorld({ flag: "true" }, async calls => {
    ROLES.head();
    await get();
    assert.ok(calls.all.every(u => !u.includes("team_season_complete")));
    assert.ok(calls.all.filter(u => u.includes("/rest/v1/rpc/")).every(u => u.endsWith("rpc/team_season_preview")));
  });
});
