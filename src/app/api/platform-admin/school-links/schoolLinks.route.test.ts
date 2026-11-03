// School-Account Linking, Phase B — Platform Admin school links.
// Route tests with a real account cookie + platform_admins row against a
// fetch-mocked PostgREST. The confirm goes through ONE call to
// rpc/school_link_apply (phase_o3); the fake below mirrors its contract
// (actor check, chain, stale, nothing-to-change, links + audit rows
// together or not at all). The real transaction, locking and guard
// behaviour is tested against PostgreSQL in
// supabase/tests/phase_o3_school_link_apply. Direct PATCHes still hit the
// completed-season guard (phase_s2) here, so any stray write would fail.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";
process.env.ADMIN_PASSWORD            = "shared-admin-password";
process.env.ADMIN_PEPPER              = "shared-admin-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { NextRequest } = await import("../../../../lib/testSupport/nextServerStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { getAdminToken } = await import("@/lib/adminAuth");
const { signPreview } = await import("@/lib/platform/schoolLinks");
const { buildDryRunReport, planSchoolLink, sanitizeSchoolQuery } = await import("@/lib/platform/schoolLinksLogic");

type Row = Record<string, unknown>;
const MONROE = "11111111-1111-4111-8111-111111111111";   // advertising on (app + public)
const CHINO = "22222222-2222-4222-8222-222222222222";    // advertising off
const LINCOLN_NE = "33333333-3333-4333-8333-333333333333";
const LINCOLN_OR = "44444444-4444-4444-8444-444444444444";
const MISSING = "55555555-5555-4555-8555-555555555555";

function season(slug: string, o: Partial<Row> = {}): Row {
  return { campaign_slug: slug, school_name: "Monroe Valley High School", sport_name: "Track", season: "2027", organization_id: null,
    season_completed_at: null, successor_campaign_slug: null, goal_cents: 500000, mascot: "Mustangs", ...o };
}

function makeWorld() {
  const db: Record<string, Row[]> = {
    elf_accounts: [
      { id: "acct-admin", email: "admin@elf.test", name: "ELF Admin", salt: "s-admin", profile_photo_url: null },
      { id: "acct-admin2", email: "admin2@elf.test", name: "Other Admin", salt: "s-admin2", profile_photo_url: null },
      { id: "acct-coach", email: "coach@elf.test", name: "Coach", salt: "s-coach", profile_photo_url: null },
    ],
    platform_admins: [
      { id: "pa-1", account_id: "acct-admin", role: "platform_admin" },
      { id: "pa-2", account_id: "acct-admin2", role: "platform_admin" },
    ],
    organizations: [
      { id: MONROE, slug: "monroe-valley-high-school", school_name: "Monroe Valley High School", city: "Phoenix", state: "AZ", show_community_partners: true, show_community_partners_public: true },
      { id: CHINO, slug: "chino-valley-high-school", school_name: "Chino Valley High School", city: "Chino Valley", state: "AZ", show_community_partners: false, show_community_partners_public: false },
      { id: LINCOLN_NE, slug: "lincoln-high-school-ne", school_name: "Lincoln High School", city: "Omaha", state: "NE", show_community_partners: false, show_community_partners_public: false },
      { id: LINCOLN_OR, slug: "lincoln-high-school-or", school_name: "Lincoln High School", city: "Portland", state: "OR", show_community_partners: false, show_community_partners_public: false },
    ],
    // mustangs: 2025 (completed) → 2026 (completed) → 2027 (current). Other teams separate.
    campaign_settings: [
      season("mustangs-2025", { season: "2025", season_completed_at: "2025-12-01", successor_campaign_slug: "mustangs-2026", organization_id: CHINO }),
      season("mustangs-2026", { season: "2026", season_completed_at: "2026-12-01", successor_campaign_slug: "mustangs-2027" }),
      season("mustangs-2027"),
      season("lincoln-hoops", { school_name: "Lincoln High School", sport_name: "Basketball" }),
      season("owls-soccer", { school_name: "QA Owls Academy", sport_name: "Soccer" }),
    ],
    audit_logs: [],
  };
  const requests: { method: string; path: string; body?: Row }[] = [];
  const hooks: { beforeRpc?: () => void; rpcError?: string; rpcStatus?: number; rpcThrows?: boolean } = {};

  // Mirrors public.school_link_apply(): validates, then changes every
  // selected season and writes its audit row — or raises and changes nothing.
  function schoolLinkApply(b: Row): Response {
    const fail = (m: string) => new Response(JSON.stringify({ code: "P0001", message: m }), { status: 400 });
    hooks.beforeRpc?.();
    if (hooks.rpcError) return new Response(JSON.stringify({ code: "P0001", message: hooks.rpcError }), { status: hooks.rpcStatus ?? 400 });
    const actor = b.p_actor as Row | null;
    const pa = db.platform_admins.find(p => p.id === actor?.platform_admin_id && p.account_id === actor?.account_id);
    if (!pa) return fail("school_link_actor_not_authorized");
    const acct = db.elf_accounts.find(a => a.id === pa.account_id)!;
    const seasons = b.p_seasons as { campaign_slug: string; expected_organization_id: string | null }[];
    const target = b.p_organization_id as string | null;
    const org = target ? db.organizations.find(o => o.id === target) : null;
    if (target && !org) return fail("school_link_organization_not_found");
    const rows = seasons.map(x => db.campaign_settings.find(c => c.campaign_slug === x.campaign_slug));
    if (rows.some(x => !x)) return fail("school_link_season_not_in_team");
    const chain = new Set<string>([String(b.p_team_slug)]);
    for (let grew = true; grew;) { grew = false; for (const c of db.campaign_settings) {
      const a = String(c.campaign_slug), n = c.successor_campaign_slug as string | null;
      if (n && chain.has(a) !== chain.has(n)) { chain.add(a); chain.add(n); grew = true; } } }
    if (seasons.some(x => !chain.has(x.campaign_slug))) return fail("school_link_season_not_in_team");
    if (seasons.some((x, i) => (rows[i]!.organization_id ?? null) !== x.expected_organization_id)) return fail("school_link_stale");
    const changing = rows.filter(x => (x!.organization_id ?? null) !== target) as Row[];
    if (!changing.length) return fail("school_link_nothing_to_change");
    for (const c of changing) {
      const prev = db.organizations.find(o => o.id === c.organization_id);
      db.audit_logs.push({ action: target ? "school_link.set" : "school_link.unlink", campaign_slug: c.campaign_slug, actor_type: "platform_admin", actor_id: pa.id, actor_email: acct.email,
        previous_value: { organization_id: c.organization_id ?? null, school: prev?.school_name ?? null }, new_value: { organization_id: target, school: org?.school_name ?? null },
        ip_address: (b.p_request as Row).ip_address, user_agent: (b.p_request as Row).user_agent });
      c.organization_id = target;
    }
    const updated = changing.map(c => String(c.campaign_slug)).sort();
    return new Response(JSON.stringify({ updated, unchanged: seasons.map(x => x.campaign_slug).filter(x => !updated.includes(x)).sort() }), { status: 200 });
  }

  function cond(r: Row, k: string, v: string): boolean {
    if (v.startsWith("eq.")) return String(r[k]) === decodeURIComponent(v.slice(3));
    if (v === "is.null") return r[k] == null;
    if (v.startsWith("in.(")) return v.slice(4, -1).split(",").map(decodeURIComponent).includes(String(r[k]));
    if (v.startsWith("ilike.")) { const pat = decodeURIComponent(v.slice(6)).replace(/\*/g, "").toLowerCase(); return String(r[k] ?? "").toLowerCase().includes(pat); }
    return true;
  }
  function orMatch(r: Row, expr: string): boolean {
    const inner = expr.slice(1, -1); // strip ( )
    if (inner.startsWith("and(")) {
      return [...inner.matchAll(/and\(([^)]*)\)/g)].some(m => m[1].split(",").every(c => { const [k, ...rest] = c.split("."); return cond(r, k, rest.join(".")); }));
    }
    return inner.split(",").some(c => { const [k, ...rest] = c.split("."); return cond(r, k, rest.join(".")); });
  }
  function filter(rows: Row[], p: URLSearchParams): Row[] {
    let out = rows;
    for (const [k, v] of p.entries()) {
      if (["select", "limit", "order", "offset"].includes(k)) continue;
      out = k === "or" ? out.filter(r => orMatch(r, v)) : out.filter(r => cond(r, k, v));
    }
    const limit = p.get("limit");
    return limit ? out.slice(0, +limit) : out;
  }
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, q] = path.split("?");
    const p = new URLSearchParams(q ?? "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body });
    if (table === "rpc/school_link_apply" && method === "POST") {
      if (hooks.rpcThrows) throw new TypeError("fetch failed");
      return schoolLinkApply(body);
    }
    const rows = (db[table] ??= []);
    if (method === "GET") return new Response(JSON.stringify(filter(rows, p).map(r => ({ ...r }))), { status: 200 });
    if (method === "PATCH") {
      const hit = filter(rows, p);
      if (table === "campaign_settings" && hit.some(r => r.season_completed_at || r.successor_campaign_slug)) {
        return new Response(JSON.stringify({ code: "P0001", message: "season_completed_read_only" }), { status: 400 });
      }
      for (const r of hit) Object.assign(r, body);
      return new Response(JSON.stringify(hit.map(r => ({ ...r }))), { status: 200 });
    }
    if (method === "POST") { rows.push({ id: `row-${rows.length + 1}`, ...body }); return new Response(JSON.stringify([body]), { status: 201 }); }
    return new Response("null", { status: 405 });
  }
  return { db, requests, hooks, fetchImpl };
}

type World = ReturnType<typeof makeWorld>;
async function withWorld(run: (w: World) => Promise<void>, who: "admin" | "admin2" | "coach" | "shared-admin" | "nobody" = "admin") {
  const w = makeWorld();
  const real = globalThis.fetch;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  __setTestCookie("elf_session", undefined);
  __setTestCookie("elf_admin", undefined);
  if (who === "admin") __setTestCookie("elf_session", makeAccountCookie("acct-admin", "s-admin"));
  if (who === "admin2") __setTestCookie("elf_session", makeAccountCookie("acct-admin2", "s-admin2"));
  if (who === "coach") __setTestCookie("elf_session", makeAccountCookie("acct-coach", "s-coach"));
  if (who === "shared-admin") __setTestCookie("elf_admin", getAdminToken()!);
  try { await run(w); } finally { globalThis.fetch = real; __setTestCookie("elf_session", undefined); __setTestCookie("elf_admin", undefined); }
}

const r = (path: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://test.local${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as never;
const team = () => import("./teams/[slug]/route.ts");
const previewRoute = () => import("./teams/[slug]/preview/route.ts");
const schools = () => import("./schools/route.ts");
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const json = async (res: Response) => res.json();

async function preview(slug: string, organizationId: string | null, seasons: string[]) {
  const res = await (await previewRoute()).POST(r(`/x/${slug}/preview`, "POST", { organizationId, seasons }), ctx(slug));
  return { status: res.status, body: await json(res) };
}
async function confirm(slug: string, body: unknown) {
  const res = await (await team()).PUT(r(`/x/${slug}`, "PUT", body), ctx(slug));
  return { status: res.status, body: await json(res) };
}
const writes = (w: World) => w.requests.filter(q => q.method !== "GET");
const rpcCalls = (w: World) => w.requests.filter(q => q.path === "rpc/school_link_apply");
/** Every write the confirm made, other than the one RPC call. */
const otherWrites = (w: World) => writes(w).filter(q => q.path !== "rpc/school_link_apply");

// ── Who ───────────────────────────────────────────────────────────────────

for (const who of ["nobody", "coach", "shared-admin"] as const) {
  test(`only Platform Admin accounts: ${who} is refused on every school-link API and nothing is written`, async () => {
    await withWorld(async w => {
      assert.equal((await (await schools()).GET(r("/x?q=monroe"))).status, 401);
      assert.equal((await (await team()).GET(r("/x"), ctx("mustangs-2027"))).status, 401);
      assert.equal((await preview("mustangs-2027", MONROE, ["mustangs-2027"])).status, 401);
      assert.equal((await confirm("mustangs-2027", { organizationId: MONROE, seasons: [{ campaign_slug: "mustangs-2027", expectedOrganizationId: null }], previewToken: "x" })).status, 401);
      assert.equal(writes(w).length, 0);
      assert.ok(!w.requests.some(q => q.path.startsWith("campaign_settings")), "no team data read");
    }, who);
  });
}

// ── Reading ───────────────────────────────────────────────────────────────

test("team seasons: whole chain oldest→newest, current season, completed seasons flagged, each season's school", async () => {
  await withWorld(async () => {
    for (const anchor of ["mustangs-2025", "mustangs-2026", "mustangs-2027"]) {
      const d = await json(await (await team()).GET(r("/x"), ctx(anchor)));
      assert.deepEqual(d.seasons.map((s: Row) => s.campaign_slug), ["mustangs-2025", "mustangs-2026", "mustangs-2027"], anchor);
      assert.equal(d.currentSeason, "mustangs-2027");
      assert.deepEqual(d.seasons.map((s: Row) => s.completed), [true, true, false]);
      assert.equal(d.seasons[0].school, "Chino Valley High School — Chino Valley, AZ");
      assert.equal(d.seasons[2].school, null);
    }
    assert.equal((await (await team()).GET(r("/x"), ctx("no-such-team"))).status, 404);
    assert.equal((await (await team()).GET(r("/x"), ctx("Bad Slug!"))).status, 400);
  });
});

test("school search: name, city or state; same-named schools stay distinct; read-only", async () => {
  await withWorld(async w => {
    const byName = await json(await (await schools()).GET(r("/x?q=lincoln")));
    assert.deepEqual(byName.schools.map((s: Row) => s.label), ["Lincoln High School — Omaha, NE", "Lincoln High School — Portland, OR"]);
    const byCity = await json(await (await schools()).GET(r("/x?q=portland")));
    assert.deepEqual(byCity.schools.map((s: Row) => s.id), [LINCOLN_OR]);
    const byState = await json(await (await schools()).GET(r("/x?q=AZ")));
    assert.ok(byState.schools.length >= 2);
    assert.equal(writes(w).length, 0);
    assert.equal(sanitizeSchoolQuery("a),or=(id.neq.x"), "a or id.neq.x");
  });
});

// ── Preview ───────────────────────────────────────────────────────────────

test("preview: before/after school and Community Partner visibility (Team App and public page); writes nothing", async () => {
  await withWorld(async w => {
    const p = await preview("mustangs-2027", MONROE, ["mustangs-2027"]);
    assert.equal(p.status, 200);
    const c = p.body.changes[0];
    assert.equal(c.before.school, null);
    assert.equal(c.after.school, "Monroe Valley High School — Phoenix, AZ");
    assert.deepEqual(c.before.visibility, { teamApp: false, publicPage: false });
    assert.deepEqual(c.after.visibility, { teamApp: true, publicPage: true });
    assert.equal(c.changesPartners, true);
    assert.match(p.body.previewToken, /^\d{13}\.[0-9a-f]{64}$/);
    const noAds = await preview("mustangs-2027", CHINO, ["mustangs-2027"]);
    assert.equal(noAds.body.changes[0].changesPartners, false, "unlinked → a no-advertising school: nothing visible changes");
    assert.equal(writes(w).length, 0);
  });
});

test("preview includes completed seasons when selected (each with its previewed school); writes nothing", async () => {
  await withWorld(async w => {
    const p = await preview("mustangs-2027", MONROE, ["mustangs-2025", "mustangs-2026", "mustangs-2027"]);
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.deepEqual(p.body.confirm, [
      { campaign_slug: "mustangs-2025", expectedOrganizationId: CHINO },
      { campaign_slug: "mustangs-2026", expectedOrganizationId: null },
      { campaign_slug: "mustangs-2027", expectedOrganizationId: null },
    ]);
    assert.equal(p.body.changes[0].before.school, "Chino Valley High School — Chino Valley, AZ");
    assert.equal(writes(w).length, 0);
  });
});

test("preview refuses: unknown school (never created), seasons from another team, nothing to change", async () => {
  await withWorld(async w => {
    assert.equal((await preview("mustangs-2027", MISSING, ["mustangs-2027"])).status, 404);
    const other = await preview("mustangs-2027", MONROE, ["mustangs-2027", "owls-soccer"]);
    assert.equal(other.status, 400);
    assert.equal(other.body.code, "season_not_in_team");
    const same = await preview("mustangs-2025", CHINO, ["mustangs-2025"]);
    assert.equal(same.status, 400);
    assert.equal(same.body.code, "nothing_to_change");
    assert.ok(!w.requests.some(q => q.method === "POST" && q.path.startsWith("organizations")));
    assert.equal(writes(w).length, 0);
  });
});

// ── Confirm ───────────────────────────────────────────────────────────────

async function previewThenConfirm(slug: string, org: string | null, seasons: string[]) {
  const p = await preview(slug, org, seasons);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  return confirm(slug, { organizationId: p.body.organizationId, seasons: p.body.confirm, previewToken: p.body.previewToken });
}

test("link the current season: ONE database call carrying the verified admin and previewed schools; no app-level writes or rollback", async () => {
  await withWorld(async w => {
    const before = JSON.parse(JSON.stringify(w.db.campaign_settings));
    const res = await previewThenConfirm("mustangs-2027", MONROE, ["mustangs-2027"]);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.updated, ["mustangs-2027"]);
    assert.equal(rpcCalls(w).length, 1);
    assert.deepEqual(rpcCalls(w)[0].body, {
      p_actor: { platform_admin_id: "pa-1", account_id: "acct-admin" },
      p_team_slug: "mustangs-2027",
      p_organization_id: MONROE,
      p_seasons: [{ campaign_slug: "mustangs-2027", expected_organization_id: null }],
      p_request: { ip_address: null, user_agent: null },
    });
    assert.equal(otherWrites(w).length, 0, "no PATCH, no audit insert, no revert from the app");
    for (const row of w.db.campaign_settings) {
      const old = before.find((b: Row) => b.campaign_slug === row.campaign_slug);
      if (row.campaign_slug === "mustangs-2027") assert.deepEqual({ ...row, organization_id: null }, old);
      else assert.deepEqual(row, old, `${row.campaign_slug} untouched`);
    }
    assert.equal(w.db.audit_logs.length, 1, "audit row written by the database call");
    assert.equal(w.db.audit_logs[0].action, "school_link.set");
    assert.equal(w.db.audit_logs[0].actor_id, "pa-1");
  });
});

test("completed seasons: link, change and unlink their school; only organization_id changes", async () => {
  await withWorld(async w => {
    const before = JSON.parse(JSON.stringify(w.db.campaign_settings));
    const linked = await previewThenConfirm("mustangs-2027", MONROE, ["mustangs-2025", "mustangs-2026", "mustangs-2027"]);
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    assert.deepEqual(linked.body.updated, ["mustangs-2025", "mustangs-2026", "mustangs-2027"]);
    for (const row of w.db.campaign_settings) {
      const old = before.find((b: Row) => b.campaign_slug === row.campaign_slug);
      if (String(row.campaign_slug).startsWith("mustangs-")) {
        assert.equal(row.organization_id, MONROE);
        assert.deepEqual({ ...row, organization_id: old.organization_id }, old, `${row.campaign_slug}: completion, successor and everything else unchanged`);
      } else assert.deepEqual(row, old);
    }
    assert.equal((await previewThenConfirm("mustangs-2026", LINCOLN_NE, ["mustangs-2026"])).status, 200);
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2026")!.organization_id, LINCOLN_NE);
    assert.equal((await previewThenConfirm("mustangs-2025", null, ["mustangs-2025"])).status, 200);
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2025")!.organization_id, null);
    assert.deepEqual(w.db.audit_logs.map(a => [a.action, a.campaign_slug]), [
      ["school_link.set", "mustangs-2025"], ["school_link.set", "mustangs-2026"], ["school_link.set", "mustangs-2027"],
      ["school_link.set", "mustangs-2026"], ["school_link.unlink", "mustangs-2025"],
    ]);
    assert.equal(otherWrites(w).length, 0);
  });
});

test("change and unlink", async () => {
  await withWorld(async w => {
    assert.equal((await previewThenConfirm("lincoln-hoops", LINCOLN_NE, ["lincoln-hoops"])).status, 200);
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "lincoln-hoops")!.organization_id, LINCOLN_NE);
    assert.equal((await previewThenConfirm("lincoln-hoops", LINCOLN_OR, ["lincoln-hoops"])).status, 200);
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "lincoln-hoops")!.organization_id, LINCOLN_OR);
    assert.equal((await previewThenConfirm("lincoln-hoops", null, ["lincoln-hoops"])).status, 200);
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "lincoln-hoops")!.organization_id, null);
    assert.deepEqual(w.db.audit_logs.map(a => a.action), ["school_link.set", "school_link.set", "school_link.unlink"]);
  });
});

test("the preview is mandatory and binding: no token, altered school/season, another admin's or an expired token are refused", async () => {
  await withWorld(async w => {
    const p = await preview("mustangs-2027", CHINO, ["mustangs-2027"]);
    const base = { organizationId: CHINO, seasons: p.body.confirm, previewToken: p.body.previewToken };
    assert.equal((await confirm("mustangs-2027", { ...base, previewToken: undefined })).body.code, "preview_required");
    assert.equal((await confirm("mustangs-2027", { ...base, organizationId: MONROE })).body.code, "preview_required", "school swapped after preview");
    const expired = signPreview({ adminId: "pa-1", slug: "mustangs-2027", organizationId: CHINO, seasons: p.body.confirm }, Date.now() - 16 * 60 * 1000);
    assert.equal((await confirm("mustangs-2027", { ...base, previewToken: expired })).body.code, "preview_required");
    const otherAdmin = signPreview({ adminId: "pa-2", slug: "mustangs-2027", organizationId: CHINO, seasons: p.body.confirm });
    assert.equal((await confirm("mustangs-2027", { ...base, previewToken: otherAdmin })).body.code, "preview_required");
    assert.equal(writes(w).length, 0);
  });
});

test("the actor always comes from the signed-in session, never the request body", async () => {
  await withWorld(async w => {
    const p = await preview("mustangs-2027", CHINO, ["mustangs-2027"]);
    const res = await confirm("mustangs-2027", { organizationId: CHINO, seasons: p.body.confirm, previewToken: p.body.previewToken,
      p_actor: { platform_admin_id: "pa-2", account_id: "acct-admin2" }, actor: { platformAdminId: "pa-2" } });
    assert.equal(res.status, 200);
    assert.deepEqual(rpcCalls(w)[0].body!.p_actor, { platform_admin_id: "pa-1", account_id: "acct-admin" });
  });
});

test("stale confirmation caught before the call: a school changed after the preview → 409, nothing written", async () => {
  await withWorld(async w => {
    const p = await preview("mustangs-2027", MONROE, ["mustangs-2027"]);
    w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2027")!.organization_id = CHINO; // someone else linked it
    const res = await confirm("mustangs-2027", { organizationId: MONROE, seasons: p.body.confirm, previewToken: p.body.previewToken });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "stale");
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2027")!.organization_id, CHINO);
    assert.equal(writes(w).length, 0);
  });
});

test("stale confirmation caught BY THE DATABASE (changed between the app's check and the call) → 409, nothing changed, no audit row, no retry or revert", async () => {
  await withWorld(async w => {
    const p = await preview("mustangs-2027", MONROE, ["mustangs-2026", "mustangs-2027"]);
    w.hooks.beforeRpc = () => { w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2027")!.organization_id = LINCOLN_NE; };
    const res = await confirm("mustangs-2027", { organizationId: MONROE, seasons: p.body.confirm, previewToken: p.body.previewToken });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "stale");
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2026")!.organization_id, null, "the other season was not changed");
    assert.equal(w.db.audit_logs.length, 0);
    assert.equal(rpcCalls(w).length, 1);
    assert.equal(otherWrites(w).length, 0);
  });
});

test("database refusals map to fixed responses; unknown failures say nothing changed; never a follow-up write", async () => {
  const cases: [string | null, number, string, number?][] = [
    ["school_link_stale", 409, "stale"],
    ["school_link_nothing_to_change", 400, "nothing_to_change"],
    ["school_link_season_not_in_team", 400, "season_not_in_team"],
    ["school_link_team_not_found", 404, "team_not_found"],
    ["school_link_organization_not_found", 404, "organization_not_found"],
    ["school_link_actor_not_authorized", 403, "not_authorized"],
    ["school_link_actor_invalid", 403, "not_authorized"],
    ["school_link_invalid", 400, "invalid"],
    ["season_completed_read_only", 500, "error"],
    ["canceling statement due to statement timeout", 500, "error", 500],
    [null, 500, "error"], // network failure
  ];
  for (const [dbError, status, code, httpStatus] of cases) {
    await withWorld(async w => {
      const p = await preview("mustangs-2027", MONROE, ["mustangs-2027"]);
      if (dbError) { w.hooks.rpcError = dbError; w.hooks.rpcStatus = httpStatus; } else w.hooks.rpcThrows = true;
      const res = await confirm("mustangs-2027", { organizationId: MONROE, seasons: p.body.confirm, previewToken: p.body.previewToken });
      assert.equal(res.status, status, String(dbError));
      assert.equal(res.body.code, code, String(dbError));
      if (code === "error") assert.match(res.body.error, /Nothing was changed/);
      assert.doesNotMatch(JSON.stringify(res.body), /statement timeout|school_link_/, "database text is never echoed");
      assert.equal(rpcCalls(w).length, 1, "one call, no retry");
      assert.equal(otherWrites(w).length, 0, "no compensating writes");
      assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2027")!.organization_id, null);
    });
  }
});

test("a confirm naming a season outside the team is refused before the database call", async () => {
  await withWorld(async w => {
    const seasons = [{ campaign_slug: "mustangs-2027", expectedOrganizationId: null }, { campaign_slug: "owls-soccer", expectedOrganizationId: null }];
    const token = signPreview({ adminId: "pa-1", slug: "mustangs-2027", organizationId: MONROE, seasons });
    const res = await confirm("mustangs-2027", { organizationId: MONROE, seasons, previewToken: token });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "season_not_in_team");
    assert.equal(writes(w).length, 0);
  });
});

// ── Rules, report, wiring ─────────────────────────────────────────────────

test("plan: current season by default only; additional seasons only when listed; completed seasons allowed; duplicates and stale refused", () => {
  const chain = [
    { campaign_slug: "t-1", school_name: "A", sport_name: "S", season: "1", organization_id: null, season_completed_at: null, successor_campaign_slug: null },
    { campaign_slug: "t-2", school_name: "A", sport_name: "S", season: "2", organization_id: null, season_completed_at: null, successor_campaign_slug: null },
  ];
  const orgs = new Map([[CHINO, { id: CHINO, slug: "c", school_name: "Chino", city: null, state: null, show_community_partners: false, show_community_partners_public: false }]]);
  const one = planSchoolLink({ chain, selected: ["t-2"], target: orgs.get(CHINO)!, orgsById: orgs });
  assert.ok(one.ok && one.changes.map(c => c.campaign_slug).join() === "t-2");
  assert.equal((planSchoolLink({ chain, selected: ["t-2", "t-2"], target: null, orgsById: orgs }) as { error: string }).error, "duplicate_season");
  const stale = planSchoolLink({ chain, selected: ["t-1"], target: orgs.get(CHINO)!, orgsById: orgs, expected: new Map([["t-1", CHINO]]) });
  assert.equal((stale as { error: string }).error, "stale");
  const done = [{ ...chain[0], season_completed_at: "2026-01-01", successor_campaign_slug: "t-2" }, chain[1]];
  const both = planSchoolLink({ chain: done, selected: ["t-1", "t-2"], target: orgs.get(CHINO)!, orgsById: orgs });
  assert.ok(both.ok && both.changes.length === 2, "a completed season can be planned (organization_id only)");
});

test("dry-run report: exact matches, ambiguous names, unmatched names, possible duplicates — computed, never applied", () => {
  const w = makeWorld();
  w.db.organizations.push({ id: "66666666-6666-4666-8666-666666666666", slug: "monroe-valley-hs", school_name: "Monroe Valley H.S.", city: "Phoenix", state: "AZ", show_community_partners: false, show_community_partners_public: false });
  const rep = buildDryRunReport(w.db.campaign_settings as never, w.db.organizations as never);
  assert.deepEqual(rep.exactMatches.map(m => [m.campaign_slug, m.organization_id]), [["mustangs-2026", MONROE], ["mustangs-2027", MONROE]]);
  assert.equal(rep.exactMatches[0].completed, true);
  assert.deepEqual(rep.ambiguous.map(a => [a.school_name, a.campaign_slugs]), [["Lincoln High School", ["lincoln-hoops"]]]);
  assert.deepEqual(rep.unmatched.map(u => u.school_name), ["QA Owls Academy"]);
  assert.deepEqual(rep.possibleDuplicates.map(d => d.normalized), ["lincoln high school"], "same name, different city — reported only");
  assert.deepEqual(rep.totals, { seasons: 5, linked: 1, unlinked: 4, organizations: 5 });
  const page = readFileSync(join(process.cwd(), "src/app/platform-admin/school-links/page.tsx"), "utf8");
  assert.doesNotMatch(page, /applySchoolLink|method: "PATCH"|method: "POST"/, "the report page never writes");
});

test("wiring: Campaign Control Center points staff to Platform Admin; nav links; linking never creates a school", () => {
  const ccc = readFileSync(join(process.cwd(), "src/app/admin/campaigns/[slug]/CampaignControlCenter.tsx"), "utf8");
  assert.match(ccc, /School links are managed in Platform Admin/);
  assert.match(ccc, /href=\{`\/platform-admin\/school-links\/\$\{encodeURIComponent\(campaignSlug\)\}`\}/);
  assert.doesNotMatch(ccc, /Link it to an organization before this toggle becomes available/);
  assert.match(readFileSync(join(process.cwd(), "src/lib/platformAdminNav.ts"), "utf8"), /href: "\/platform-admin\/school-links"/);
  const lib = readFileSync(join(process.cwd(), "src/lib/platform/schoolLinks.ts"), "utf8");
  assert.doesNotMatch(lib, /organizations`?,\s*\{\s*method: "POST"|restInsert/, "no school creation path");
  assert.doesNotMatch(lib, /method: "PATCH"|reverted/, "no direct link write and no app-level rollback");
  assert.match(lib, /rpc\/school_link_apply/);
  const put = readFileSync(join(process.cwd(), "src/app/api/platform-admin/school-links/teams/[slug]/route.ts"), "utf8");
  assert.doesNotMatch(put, /logAuditEvent/, "audit rows are written inside the database transaction");
  assert.match(put, /platformAdminId: admin\.platformAdminId, accountId: admin\.accountId/);
});
