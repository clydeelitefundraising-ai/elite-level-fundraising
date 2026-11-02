// School-Account Linking, Phase B — Platform Admin school links.
// Route tests with a real account cookie + platform_admins row against a
// fetch-mocked PostgREST that also enforces the completed-season guard
// (phase_s2: any UPDATE touching a completed season fails the statement).
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
const { signPreview, applySchoolLink } = await import("@/lib/platform/schoolLinks");
const { buildDryRunReport, planSchoolLink, conditionalSeasonFilter, sanitizeSchoolQuery } = await import("@/lib/platform/schoolLinksLogic");

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
  return { db, requests, fetchImpl };
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
const writes = (w: World) => w.requests.filter(q => q.method !== "GET" && !q.path.startsWith("audit_logs"));

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

test("team seasons: whole chain oldest→newest, current season, completed seasons read-only, each season's school", async () => {
  await withWorld(async () => {
    for (const anchor of ["mustangs-2025", "mustangs-2026", "mustangs-2027"]) {
      const d = await json(await (await team()).GET(r("/x"), ctx(anchor)));
      assert.deepEqual(d.seasons.map((s: Row) => s.campaign_slug), ["mustangs-2025", "mustangs-2026", "mustangs-2027"], anchor);
      assert.equal(d.currentSeason, "mustangs-2027");
      assert.deepEqual(d.seasons.map((s: Row) => s.readOnly), [true, true, false]);
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

test("preview refuses: unknown school (never created), seasons from another team, completed seasons, nothing to change", async () => {
  await withWorld(async w => {
    assert.equal((await preview("mustangs-2027", MISSING, ["mustangs-2027"])).status, 404);
    const other = await preview("mustangs-2027", MONROE, ["mustangs-2027", "owls-soccer"]);
    assert.equal(other.status, 400);
    assert.equal(other.body.code, "season_not_in_team");
    const done = await preview("mustangs-2027", MONROE, ["mustangs-2026", "mustangs-2027"]);
    assert.equal(done.status, 409);
    assert.equal(done.body.code, "season_read_only");
    const same = await preview("mustangs-2025", CHINO, ["mustangs-2025"]);
    assert.equal(same.body.code, "season_read_only");
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

test("link the current season: only organization_id changes, other seasons and teams untouched, audited per season", async () => {
  await withWorld(async w => {
    const before = JSON.parse(JSON.stringify(w.db.campaign_settings));
    const res = await previewThenConfirm("mustangs-2027", MONROE, ["mustangs-2027"]);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.updated, ["mustangs-2027"]);
    const patch = w.requests.find(q => q.method === "PATCH")!;
    assert.deepEqual(Object.keys(patch.body!), ["organization_id"], "nothing but the link is written");
    for (const row of w.db.campaign_settings) {
      const old = before.find((b: Row) => b.campaign_slug === row.campaign_slug);
      if (row.campaign_slug === "mustangs-2027") assert.deepEqual({ ...row, organization_id: null }, old);
      else assert.deepEqual(row, old, `${row.campaign_slug} untouched`);
    }
    await new Promise(res2 => setTimeout(res2, 0));
    const audits = w.requests.filter(q => q.path.startsWith("audit_logs"));
    assert.equal(audits.length, 1);
    assert.equal(audits[0].body!.action, "school_link.set");
    assert.equal(audits[0].body!.campaign_slug, "mustangs-2027");
    assert.equal(audits[0].body!.actor_type, "platform_admin");
    assert.equal(audits[0].body!.actor_id, "pa-1");
    assert.deepEqual((audits[0].body!.new_value as Row).community_partners, { teamApp: true, publicPage: true });
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
    await new Promise(res2 => setTimeout(res2, 0));
    const actions = w.requests.filter(q => q.path.startsWith("audit_logs")).map(q => q.body!.action);
    assert.deepEqual(actions, ["school_link.set", "school_link.set", "school_link.unlink"]);
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
    assert.equal(w.requests.filter(q => q.method === "PATCH").length, 0);
  });
});

test("stale confirmation: a school changed after the preview → 409, nothing written", async () => {
  await withWorld(async w => {
    const p = await preview("mustangs-2027", MONROE, ["mustangs-2027"]);
    w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2027")!.organization_id = CHINO; // someone else linked it
    const res = await confirm("mustangs-2027", { organizationId: MONROE, seasons: p.body.confirm, previewToken: p.body.previewToken });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "stale");
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "mustangs-2027")!.organization_id, CHINO);
    assert.equal(w.requests.filter(q => q.method === "PATCH").length, 0);
  });
});

test("a confirm naming a season outside the team or a completed season is refused before any write", async () => {
  await withWorld(async w => {
    for (const seasons of [
      [{ campaign_slug: "mustangs-2027", expectedOrganizationId: null }, { campaign_slug: "owls-soccer", expectedOrganizationId: null }],
      [{ campaign_slug: "mustangs-2026", expectedOrganizationId: null }],
    ]) {
      const token = signPreview({ adminId: "pa-1", slug: "mustangs-2027", organizationId: MONROE, seasons });
      const res = await confirm("mustangs-2027", { organizationId: MONROE, seasons, previewToken: token });
      assert.ok([400, 409].includes(res.status), JSON.stringify(res.body));
    }
    assert.equal(w.requests.filter(q => q.method === "PATCH").length, 0);
  });
});

// ── All-or-nothing writes (library level) ─────────────────────────────────

test("multi-season write: one conditional UPDATE; success updates all", async () => {
  await withWorld(async w => {
    w.db.campaign_settings.push(season("x-a"), season("x-b", { organization_id: CHINO }));
    const res = await applySchoolLink([{ campaign_slug: "x-a", organization_id: null }, { campaign_slug: "x-b", organization_id: CHINO }], MONROE);
    assert.equal(res.ok, true);
    assert.equal(w.requests.filter(q => q.method === "PATCH").length, 1, "a single statement");
    assert.ok(w.db.campaign_settings.filter(s => ["x-a", "x-b"].includes(String(s.campaign_slug))).every(s => s.organization_id === MONROE));
  });
});

test("multi-season write: a season changed concurrently → the others are put back, nothing left half-applied", async () => {
  await withWorld(async w => {
    w.db.campaign_settings.push(season("x-a"), season("x-b", { organization_id: LINCOLN_NE })); // expected CHINO, but it's LINCOLN_NE now
    const res = await applySchoolLink([{ campaign_slug: "x-a", organization_id: null }, { campaign_slug: "x-b", organization_id: CHINO }], MONROE);
    assert.deepEqual(res, { ok: false, reason: "stale", reverted: true });
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "x-a")!.organization_id, null, "reverted");
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "x-b")!.organization_id, LINCOLN_NE, "concurrent change kept");
  });
});

test("multi-season write: a completed season in the set makes the database refuse the whole statement", async () => {
  await withWorld(async w => {
    w.db.campaign_settings.push(season("x-a"));
    const res = await applySchoolLink([{ campaign_slug: "x-a", organization_id: null }, { campaign_slug: "mustangs-2026", organization_id: null }], MONROE);
    assert.deepEqual(res, { ok: false, reason: "read_only" });
    assert.equal(w.db.campaign_settings.find(s => s.campaign_slug === "x-a")!.organization_id, null);
  });
});

// ── Rules, report, wiring ─────────────────────────────────────────────────

test("plan: current season by default only; additional seasons only when listed; duplicates and stale refused", () => {
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
  assert.equal(conditionalSeasonFilter([{ campaign_slug: "t-1", organization_id: null }, { campaign_slug: "t-2", organization_id: CHINO }]),
    `or=(and(campaign_slug.eq.t-1,organization_id.is.null),and(campaign_slug.eq.t-2,organization_id.eq.${CHINO}))`);
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
  assert.match(readFileSync(join(process.cwd(), "src/app/platform-admin/_components/PlatformAdminHeader.tsx"), "utf8"), /href="\/platform-admin\/school-links"/);
  const lib = readFileSync(join(process.cwd(), "src/lib/platform/schoolLinks.ts"), "utf8");
  assert.doesNotMatch(lib, /organizations`?,\s*\{\s*method: "POST"|restInsert/, "no school creation path");
});
