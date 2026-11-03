// Phase 1 — campaigns created by Platform Admins are linked to a validated
// school: New Campaign + CRM Launch (/api/admin/onboard) and Duplicate
// (/api/admin/campaigns/duplicate). Authorization, school validation,
// inheritance, and that demos / Complete Season are unchanged.
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
process.env.TEAM_COACH_PEPPER         = "fake-team-coach-pepper";

register(new URL("../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { __setTestCookie } = await import("../../../../lib/testSupport/nextHeadersStub.mjs");
const { NextRequest } = await import("../../../../lib/testSupport/nextServerStub.mjs");
const { makeAccountCookie } = await import("@/lib/accountAuth");
const { getAdminToken } = await import("@/lib/adminAuth");

type Row = Record<string, unknown>;
const MONROE = "11111111-1111-4111-8111-111111111111";
const CHINO = "22222222-2222-4222-8222-222222222222";
const SEED = "33333333-3333-4333-8333-333333333333";
const MISSING = "55555555-5555-4555-8555-555555555555";

function makeWorld() {
  const db: Record<string, Row[]> = {
    elf_accounts: [
      { id: "acct-admin", email: "admin@elf.test", name: "ELF Admin", salt: "s-admin", profile_photo_url: null },
      { id: "acct-coach", email: "coach@elf.test", name: "Coach", salt: "s-coach", profile_photo_url: null },
    ],
    platform_admins: [{ id: "pa-1", account_id: "acct-admin", role: "platform_admin" }],
    organizations: [
      { id: MONROE, slug: "monroe-valley-high-school", school_name: "Monroe Valley High School", city: "Phoenix", state: "AZ", show_community_partners: true, show_community_partners_public: false },
      { id: CHINO, slug: "chino-valley-high-school", school_name: "Chino Valley High School", city: "Chino Valley", state: "AZ", show_community_partners: false, show_community_partners_public: false },
      { id: SEED, slug: "default", school_name: "", city: "", state: "", show_community_partners: false, show_community_partners_public: false },
    ],
    campaign_settings: [
      { campaign_slug: "monroe-track-2026", school_name: "Monroe Valley High School", sport_name: "Track", organization_id: MONROE, primary_color: "#0A3D62", secondary_color: "#F6B93B", logo_url: "", season: "2026 Season", location: "Phoenix, AZ" },
      { campaign_slug: "unlinked-hoops-2026", school_name: "Unlinked HS", sport_name: "Basketball", organization_id: null, primary_color: "#111111", secondary_color: "#222222", logo_url: "", season: "2026 Season", location: "" },
    ],
    coach_crm_contacts: [{ id: "crm-1", name: "Casey Coach", email: "casey@school.test", school_name: "Monroe Valley HS", sport: "Track" }],
    audit_logs: [],
  };
  const requests: { method: string; path: string; body?: Row }[] = [];
  const hooks: { orgReadStatus?: number; insertError?: { status: number; code: string } } = {};
  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, q] = path.split("?");
    const p = new URLSearchParams(q ?? "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method, path, body });
    const rows = (db[table] ??= []);
    if (method === "GET") {
      if (table === "organizations" && hooks.orgReadStatus) return new Response("{}", { status: hooks.orgReadStatus });
      let out = rows;
      for (const [k, v] of p.entries()) if (v.startsWith("eq.")) out = out.filter(r => String(r[k]) === decodeURIComponent(v.slice(3)));
      return new Response(JSON.stringify(out.map(r => ({ ...r }))), { status: 200 });
    }
    if (method === "POST") {
      if (table === "campaign_settings" && hooks.insertError) {
        return new Response(JSON.stringify({ code: hooks.insertError.code, message: "insert failed", details: "", hint: "" }), { status: hooks.insertError.status });
      }
      const items = Array.isArray(body) ? body : [body];
      if (table === "campaign_settings" && items.some(i => rows.some(r => r.campaign_slug === i.campaign_slug))) return new Response("[]", { status: 201 });
      for (const i of items) rows.push({ id: `${table}-${rows.length + 1}`, ...i });
      return new Response(JSON.stringify(items), { status: 201 });
    }
    return new Response("[]", { status: 200 });
  }
  return { db, requests, hooks, fetchImpl };
}

type World = ReturnType<typeof makeWorld>;
async function withWorld(run: (w: World) => Promise<void>, who: "admin" | "coach" | "shared-admin" | "nobody" = "admin") {
  const w = makeWorld();
  const real = globalThis.fetch;
  const realLog = console.log, realWarn = console.warn, realErr = console.error;
  globalThis.fetch = w.fetchImpl as typeof fetch;
  console.log = console.warn = console.error = () => {};
  __setTestCookie("elf_session", undefined);
  __setTestCookie("elf_admin", undefined);
  if (who === "admin") __setTestCookie("elf_session", makeAccountCookie("acct-admin", "s-admin"));
  if (who === "coach") __setTestCookie("elf_session", makeAccountCookie("acct-coach", "s-coach"));
  if (who === "shared-admin") __setTestCookie("elf_admin", getAdminToken()!);
  try { await run(w); } finally {
    globalThis.fetch = real; console.log = realLog; console.warn = realWarn; console.error = realErr;
    __setTestCookie("elf_session", undefined); __setTestCookie("elf_admin", undefined);
  }
}

const post = (body: unknown) =>
  new NextRequest("http://test.local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
const onboard = async (body: Row) => { const { POST } = await import("../onboard/route.ts"); const res = await POST(post(body)); return { status: res.status, body: await res.json() }; };
const duplicate = async (body: Row) => { const { POST } = await import("./duplicate/route.ts"); const res = await POST(post(body)); return { status: res.status, body: await res.json() }; };

const NEW = {
  campaign_slug: "monroe-soccer-2027", school_name: "Monroe Valley High School", sport_name: "Soccer", mascot: "Falcons",
  season: "2027 Season", location: "Phoenix, AZ", primary_color: "#0A3D62", secondary_color: "#F6B93B", logo_url: "",
  goal_cents: 1000000, deadline: "2027-05-01", coach_name: "Sam Coach", coach_email: "sam@school.test", coach_password: "longpassword1",
  contact_goal: 10, layout_variant: "classic",
};
const DUP = {
  source_slug: "monroe-track-2026", campaign_slug: "monroe-track-2027", school_name: "Monroe Valley High School", sport_name: "Track",
  mascot: "", season: "2027 Season", location: "Phoenix, AZ", goal_cents: 0, deadline: "", default_athlete_goal_cents: null,
  coach_name: "Sam Coach", coach_email: "sam2@school.test", coach_password: "longpassword1", copy: { branding: true, feature_toggles: true },
};
const campaignInserts = (w: World) => w.requests.filter(q => q.method === "POST" && q.path.startsWith("campaign_settings")).map(q => q.body!);
const writes = (w: World) => w.requests.filter(q => q.method !== "GET");
const auditRow = (w: World, action: string) => w.requests.find(q => q.method === "POST" && q.path === "audit_logs" && q.body?.action === action)?.body;

for (const [who, status] of [["nobody", 401], ["coach", 401], ["shared-admin", 403]] as const) {
  test(`authorization: ${who} can't create or duplicate a campaign (${status}), nothing is written`, async () => {
    await withWorld(async w => {
      assert.equal((await onboard({ ...NEW, organization_id: MONROE })).status, status);
      assert.equal((await duplicate({ ...DUP, organization_id: MONROE })).status, status);
      assert.deepEqual(writes(w), []);
    }, who);
  });
}

test("new campaign: a missing, malformed, unknown or placeholder school is refused before any write", async () => {
  await withWorld(async w => {
    for (const [org, msg] of [
      [undefined, /Choose the school/], [null, /Choose the school/], ["", /Choose the school/],
      ["not-a-uuid", /isn't valid/], [MISSING, /doesn't exist/], [SEED, /doesn't exist/],
    ] as const) {
      const res = await onboard({ ...NEW, ...(org === undefined ? {} : { organization_id: org }) });
      assert.equal(res.status, 400, String(org));
      assert.equal(res.body.code, "school");
      assert.match(res.body.error, msg);
    }
    assert.deepEqual(writes(w), []);
  });
});

test("new campaign: a school read failure is a 503 (never treated as 'no school'), nothing written", async () => {
  await withWorld(async w => {
    w.hooks.orgReadStatus = 500;
    const res = await onboard({ ...NEW, organization_id: MONROE });
    assert.equal(res.status, 503);
    assert.deepEqual(writes(w), []);
  });
});

test("new campaign: linked to the validated school; everything else is written as before; audited with the school", async () => {
  await withWorld(async w => {
    const res = await onboard({ ...NEW, organization_id: MONROE.toUpperCase() });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const [row] = campaignInserts(w);
    assert.equal(row.organization_id, MONROE);
    assert.equal(row.campaign_slug, "monroe-soccer-2027");
    assert.equal(row.primary_color, "#0A3D62");
    assert.equal(row.goal_cents, 1000000);
    assert.ok(w.requests.some(q => q.method === "POST" && q.path.startsWith("team_coaches")), "coach still created");
    assert.ok(w.requests.some(q => q.method === "POST" && q.path.startsWith("team_join_codes")), "join code still created");
    assert.equal((auditRow(w, "campaign.created")?.new_value as Row)?.organization_id, MONROE);
  });
});

test("CRM Launch: same school rule — required and validated; the CRM school name never selects a school", async () => {
  await withWorld(async w => {
    const noSchool = await onboard({ ...NEW, crm_contact_id: "crm-1" });
    assert.equal(noSchool.status, 400);
    assert.deepEqual(writes(w), []);
    const ok = await onboard({ ...NEW, crm_contact_id: "crm-1", organization_id: CHINO });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const [row] = campaignInserts(w);
    assert.deepEqual([row.organization_id, row.crm_contact_id], [CHINO, "crm-1"]);
  });
});

test("the school removed between check and insert: the campaign is refused, not created unlinked", async () => {
  await withWorld(async w => {
    w.hooks.insertError = { status: 409, code: "23503" };
    const res = await onboard({ ...NEW, organization_id: MONROE });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /no longer exists/);
    assert.ok(!w.requests.some(q => q.path.startsWith("team_coaches")), "nothing after the failed insert");
  });
});

test("duplicate: inherits the source's school by default (also for an older client that omits the field)", async () => {
  await withWorld(async w => {
    const res = await duplicate({ ...DUP, organization_id: MONROE });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const legacy = await duplicate({ ...DUP, campaign_slug: "monroe-track-2028", coach_email: "sam3@school.test" });
    assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
    assert.deepEqual(campaignInserts(w).map(r => r.organization_id), [MONROE, MONROE]);
    const audit = w.requests.filter(q => q.path === "audit_logs" && q.body?.action === "campaign.duplicated").map(q => q.body!.new_value as Row);
    assert.deepEqual(audit.map(a => [a.organization_id, a.inherited_school]), [[MONROE, true], [MONROE, true]]);
  });
});

test("duplicate: another school can be chosen; it is validated like any other", async () => {
  await withWorld(async w => {
    assert.equal((await duplicate({ ...DUP, organization_id: CHINO })).status, 200);
    assert.equal(campaignInserts(w)[0].organization_id, CHINO);
    assert.equal((await duplicate({ ...DUP, campaign_slug: "x-y-z", organization_id: MISSING })).status, 400);
    assert.equal((await duplicate({ ...DUP, campaign_slug: "x-y-q", organization_id: SEED })).status, 400);
    assert.equal(campaignInserts(w).length, 1);
  });
});

test("duplicate: a source without a school requires choosing one; explicit null is refused", async () => {
  await withWorld(async w => {
    const base = { ...DUP, source_slug: "unlinked-hoops-2026", campaign_slug: "unlinked-hoops-2027" };
    assert.equal((await duplicate(base)).status, 400);
    assert.equal((await duplicate({ ...base, organization_id: null })).status, 400);
    assert.deepEqual(campaignInserts(w), []);
    const chosen = await duplicate({ ...base, organization_id: CHINO });
    assert.equal(chosen.status, 200);
    assert.equal(campaignInserts(w)[0].organization_id, CHINO);
  });
});

test("legacy compatibility: demos stay unlinked, Complete Season still inherits, coach self-service unchanged", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
  for (const f of ["src/app/api/admin/demo/create/route.ts", "src/app/api/admin/demo/seed/route.ts"]) {
    const src = read(f);
    assert.match(src, /createCampaignCore\(/, f);
    assert.doesNotMatch(src, /organizationId|organization_id|resolveCampaignSchool/, f);
  }
  const core = read("src/lib/campaignCreate.ts");
  assert.match(core, /\.\.\.\(p\.organizationId \? \{ organization_id: p\.organizationId \} : \{\}\)/, "omitted → column stays NULL");
  assert.match(read("supabase/migrations/phase_s1_complete_season.sql"), /src\.show_booster_in_staff_roster, src\.organization_id, src\.branding_customized/);
  assert.doesNotMatch(read("src/lib/teamProvisioning/selfServiceCreate.ts"), /resolveCampaignSchool|CampaignSchoolPicker/);
});

test("wizards: school step required, launches send organization_id, no arbitrary first-school defaults, Platform Admin pages", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
  const page = read("src/app/admin/campaigns/new/page.tsx");
  assert.doesNotMatch(page, /organizations\?select=.*limit=1/, "no first-row organizations defaults");
  for (const p of ["src/app/admin/campaigns/new/page.tsx", "src/app/admin/campaigns/duplicate/page.tsx"]) {
    assert.match(read(p), /if \(access\.via !== "platform_admin"\) return <PlatformAdminRequired /, p);
  }
  const wiz = read("src/app/admin/campaigns/new/NewCampaignWizard.tsx");
  assert.match(wiz, /organization_id:            school\?\.id \?\? null,/);
  assert.match(wiz, /if \(step === 1 && !hasSchool\) errs\.push\("Choose the school/);
  assert.match(wiz, /setTouched\(prev => \{ const n = new Set\(prev\); for \(const k of Object\.keys\(patch\)\) n\.add\(k\); return n; \}\);/, "every form edit is recorded");
  assert.match(wiz, /applySchoolDefaults\(d, touched, next\.org, NEUTRAL\)/);
  assert.match(wiz, /suggestedSchool=\{crmSeed\?\.schoolName \?\? ""\}/);
  assert.match(wiz, /<ReviewRow label="Community Partners" value=\{school \? <>\{partnerVisibilityText\(school\.org\)\}/);
  const picker = read("src/app/admin/campaigns/_components/CampaignSchoolPicker.tsx");
  const searchEffect = picker.slice(picker.indexOf("useEffect(() => {\n    if (!changing) return;"), picker.indexOf("async function choose"));
  assert.doesNotMatch(searchEffect, /onChange\(|choose\(/, "a suggestion never selects a school by itself");
  assert.match(picker, /fetch\(`\/api\/platform-admin\/school-links\/schools\?q=/);
  assert.match(picker, /<CreateSchoolForm/, "reuses the Create New School workflow");
  const dup = read("src/app/admin/campaigns/duplicate/DuplicateWizard.tsx");
  assert.match(dup, /const inheritedId = data\.organization_id \?\? null;/);
  assert.match(dup, /organization_id:            school\?\.id \?\? null,/);
  assert.match(dup, /if \(step === 2 && !hasSchool\) errs\.push\("Choose the school/);
});

test("Review layout: wraps on narrow screens (no fixed two-column grid), so nothing is clipped at phone widths", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
  for (const p of ["src/app/admin/campaigns/new/NewCampaignWizard.tsx", "src/app/admin/campaigns/duplicate/DuplicateWizard.tsx"]) {
    const src = read(p);
    assert.doesNotMatch(src, /gridTemplateColumns: "1fr (320|300)px"/, p);
    assert.match(src, /display: "flex", flexWrap: "wrap", gap: "1\.5rem", alignItems: "flex-start"/, p);
    assert.match(src, /flex: "3 1 340px", minWidth: 0/, p);
    // Review rows drop a long value under its label instead of squeezing it.
    assert.match(src, /flexWrap: "wrap", justifyContent: "space-between"[^\n]*rowGap/, p);
    assert.match(src, /textAlign: "right", marginLeft: "auto", minWidth: 0, overflowWrap: "anywhere"/, p);
  }
});
