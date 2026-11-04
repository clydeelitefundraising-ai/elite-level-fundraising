// People on ELF — identity matching, roles, seasons, exclusions, account
// status, pending items, pagination, failure handling and access.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

register(new URL("../testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mzsvbxosoidwhntpjdkf.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const logic = await import("./peopleStatsLogic.ts");
const { computePeopleStats, isCurrentSeason } = logic;
const { peopleExclusionsFor, supabaseRef, PRODUCTION_PEOPLE_EXCLUSIONS, QA_PEOPLE_EXCLUSIONS } = await import("./peopleStatsExclusions.ts");
const { fetchAllRows, loadPeopleStats, getPeopleStats } = await import("./peopleStats.ts");
type Input = Parameters<typeof computePeopleStats>[0];
type Camp = Input["campaigns"][number];

const NOW = new Date("2026-11-03T12:00:00Z");
const camp = (slug: string, extra: Partial<Camp> = {}): Camp => ({
  campaign_slug: slug, organization_id: null, is_demo: false, archived: false, season_completed_at: null, successor_campaign_slug: null, ...extra,
});
const base = (over: Partial<Input> = {}): Input => ({
  campaigns: [camp("a-2027"), camp("b-2027")],
  athletes: [], members: [], coaches: [],
  staffInvitations: [], parentRequests: [], athleteRequests: [], coachInviteTokens: [],
  exclusions: { organizationIds: [], campaignSlugs: [] }, now: NOW,
  ...over,
});
const mem = (id: string, slug: string, role: string, account_id: string | null = null, athlete_id: string | null = null) => ({ id, campaign_slug: slug, role, account_id, athlete_id });
const coach = (id: string, slug: string, role: string, email: string | null, account_id: string | null = null) => ({ id, campaign_slug: slug, role, account_id, email });
const ath = (id: string, slug: string, prev: string | null = null) => ({ id, campaign_slug: slug, previous_season_athlete_id: prev });

// ── Identity ────────────────────────────────────────────────────────────────

test("one ELF account across teams and roles is one person, counted under each role", () => {
  const s = computePeopleStats(base({
    coaches: [coach("c1", "a-2027", "head_coach", "pat@x.test", "acct-1")],
    members: [mem("m1", "b-2027", "parent", "acct-1"), mem("m2", "a-2027", "parent", "acct-1")],
  }));
  assert.equal(s.allTime.total, 1);
  assert.equal(s.allTime.byRole.head_coach, 1);
  assert.equal(s.allTime.byRole.parent, 1);
  assert.equal(s.allTime.multipleRoles, 1);
  assert.equal(s.allTime.byStatus.account_linked, 1);
});

test("a joined athlete is the same person as their roster row", () => {
  const s = computePeopleStats(base({
    athletes: [ath("r1", "a-2027"), ath("r2", "a-2027")],
    members: [mem("m1", "a-2027", "athlete", "acct-9", "r1")],
  }));
  assert.equal(s.allTime.total, 2);
  assert.equal(s.allTime.byRole.athlete, 2);
  assert.equal(s.allTime.byStatus.account_linked, 1);
  assert.equal(s.allTime.byStatus.roster_only, 1);
});

test("an athlete carried into a new season is one person; the link is ignored when the old season isn't counted", () => {
  const seasons = [camp("t-2026", { season_completed_at: "2026-06-01", successor_campaign_slug: "t-2027" }), camp("t-2027")];
  const s = computePeopleStats(base({ campaigns: seasons, athletes: [ath("old", "t-2026"), ath("new", "t-2027", "old")] }));
  assert.equal(s.allTime.total, 1);
  assert.equal(s.current.total, 1);
  const excluded = computePeopleStats(base({
    campaigns: seasons, athletes: [ath("old", "t-2026"), ath("new", "t-2027", "old")],
    exclusions: { organizationIds: [], campaignSlugs: ["t-2026"] },
  }));
  assert.equal(excluded.allTime.total, 1, "only the counted season remains");
});

// Coach rows carry an email in the database; the rules never use it. The
// helper keeps it on the fixtures to prove that.
test("coaches with the same email but different ELF accounts stay separate people", () => {
  const s = computePeopleStats(base({
    coaches: [coach("c1", "a-2027", "head_coach", "athletics@school.test", "acct-1"), coach("c2", "b-2027", "booster", " Athletics@School.test ", "acct-2")],
  }));
  assert.equal(s.allTime.total, 2);
  assert.equal(s.allTime.byStatus.account_linked, 2);
  assert.equal(s.allTime.multipleRoles, 0);
});

test("one ELF account coaching several teams is one person, whatever names or emails the rows carry", () => {
  const s = computePeopleStats(base({
    campaigns: [camp("a-2027"), camp("b-2027"), camp("c-2027")],
    coaches: [
      coach("c1", "a-2027", "head_coach", "pat@x.test", "acct-1"),
      coach("c2", "b-2027", "head_coach", "pat.work@y.test", "acct-1"),
      coach("c3", "c-2027", "assistant_coach", null, "acct-1"),
    ],
  }));
  assert.equal(s.allTime.total, 1);
  assert.equal(s.allTime.byRole.head_coach, 1);
  assert.equal(s.allTime.byRole.assistant_coach, 1);
  assert.equal(s.allTime.multipleRoles, 1);
  assert.equal(s.allTime.byStatus.account_linked, 1);
});

test("unlinked coaches on different teams stay separate, even with the same email", () => {
  const s = computePeopleStats(base({
    coaches: [coach("c1", "a-2027", "head_coach", "coach@school.test"), coach("c2", "b-2027", "head_coach", "coach@school.test")],
  }));
  assert.equal(s.allTime.total, 2);
  assert.equal(s.allTime.byRole.head_coach, 2);
  assert.equal(s.allTime.byStatus.team_login_only, 2);
});

test("an email shared with a linked coach never links an unlinked coach or merges them", () => {
  const s = computePeopleStats(base({
    coaches: [coach("c1", "a-2027", "head_coach", "pat@x.test", "acct-1"), coach("c2", "b-2027", "head_coach", "pat@x.test")],
  }));
  assert.equal(s.allTime.total, 2);
  assert.deepEqual(s.allTime.byStatus, { account_linked: 1, team_login_only: 1, roster_only: 0 });
});

test("a coach who is also a parent on the same account is one person with two roles", () => {
  const s = computePeopleStats(base({
    coaches: [coach("c1", "a-2027", "head_coach", "pat@x.test", "acct-1")],
    members: [mem("m1", "a-2027", "parent", "acct-1")],
  }));
  assert.equal(s.allTime.total, 1);
  assert.equal(s.allTime.multipleRoles, 1);
});

test("never merged by name, or by member/parent emails: one person per unlinked team record", () => {
  const s = computePeopleStats(base({
    athletes: [ath("r1", "a-2027"), ath("r2", "b-2027")],
    members: [mem("m1", "a-2027", "parent"), mem("m2", "b-2027", "parent"), mem("m3", "a-2027", "booster")],
    coaches: [coach("c1", "a-2027", "head_coach", null), coach("c2", "b-2027", "head_coach", "not-an-email")],
  }));
  assert.equal(s.allTime.total, 7);
  assert.equal(s.allTime.byRole.parent, 2);
  assert.equal(s.allTime.byRole.booster, 1);
  assert.equal(s.allTime.byRole.head_coach, 2);
});

// ── Roles and status ────────────────────────────────────────────────────────

test("every role is counted; boosters from either table; unknown roles count in the total only", () => {
  const s = computePeopleStats(base({
    athletes: [ath("r1", "a-2027")],
    members: [mem("m1", "a-2027", "parent"), mem("m2", "a-2027", "booster"), mem("m3", "a-2027", "mystery")],
    coaches: [coach("c1", "a-2027", "head_coach", "h@x.test"), coach("c2", "a-2027", "assistant_coach", "a@x.test"), coach("c3", "a-2027", "booster", "b@x.test")],
  }));
  assert.deepEqual(s.allTime.byRole, { athlete: 1, head_coach: 1, assistant_coach: 1, parent: 1, booster: 2 });
  assert.equal(s.allTime.otherRole, 1);
  assert.equal(s.allTime.total, 7);
  assert.equal(s.allTime.multipleRoles, 0);
});

test("status: account linked, team login only, roster only — each person exactly once", () => {
  const s = computePeopleStats(base({
    athletes: [ath("r1", "a-2027"), ath("r2", "a-2027")],
    members: [mem("m1", "a-2027", "athlete", null, "r2"), mem("m2", "a-2027", "parent", "acct-2")],
  }));
  assert.deepEqual(s.allTime.byStatus, { account_linked: 1, team_login_only: 1, roster_only: 1 });
  assert.equal(s.allTime.byStatus.account_linked + s.allTime.byStatus.team_login_only + s.allTime.byStatus.roster_only, s.allTime.total);
});

// ── Seasons ─────────────────────────────────────────────────────────────────

test("current seasons are neither archived nor completed (completion date or successor)", () => {
  assert.equal(isCurrentSeason(camp("x")), true);
  assert.equal(isCurrentSeason(camp("x", { archived: true })), false);
  assert.equal(isCurrentSeason(camp("x", { season_completed_at: "2026-06-01" })), false);
  assert.equal(isCurrentSeason(camp("x", { successor_campaign_slug: "y" })), false);
});

test("all-time includes archived and completed seasons; current counts only roles held in current seasons", () => {
  const s = computePeopleStats(base({
    campaigns: [camp("old", { archived: true }), camp("done", { season_completed_at: "2026-05-01" }), camp("now")],
    athletes: [ath("r1", "old"), ath("r2", "done")],
    members: [mem("m1", "old", "parent", "acct-1"), mem("m2", "now", "booster", "acct-1")],
    coaches: [coach("c1", "now", "head_coach", "h@x.test")],
  }));
  assert.equal(s.allTime.total, 4);
  assert.equal(s.current.total, 2);
  assert.equal(s.current.byRole.parent, 0, "the parent role was only in an archived season");
  assert.equal(s.current.byRole.booster, 1);
  assert.equal(s.current.multipleRoles, 0);
  assert.equal(s.allTime.multipleRoles, 1);
  assert.deepEqual(s.teamSeasons, { included: 3, current: 1, demo: 0, excludedTest: 0 });
});

// ── Exclusions ──────────────────────────────────────────────────────────────

test("demo campaigns, excluded schools and excluded slugs are left out and reported; orphan records aren't counted", () => {
  const s = computePeopleStats(base({
    campaigns: [camp("real"), camp("demo", { is_demo: true }), camp("test-school", { organization_id: "org-test" }), camp("test-slug"), camp("other-school", { organization_id: "org-real" })],
    athletes: [ath("r1", "real"), ath("r2", "demo"), ath("r3", "test-school"), ath("r4", "test-slug"), ath("r5", "other-school"), ath("r6", "gone")],
    members: [mem("m1", "test-school", "parent", "acct-1")],
    exclusions: { organizationIds: ["org-test"], campaignSlugs: ["test-slug"] },
  }));
  assert.equal(s.allTime.total, 2);
  assert.deepEqual(s.teamSeasons, { included: 2, current: 2, demo: 1, excludedTest: 2 });
  assert.equal(s.orphanRecords, 1);
});

test("exclusion lists: exact approved production IDs, QA's own IDs, chosen by Supabase project", () => {
  assert.deepEqual([...PRODUCTION_PEOPLE_EXCLUSIONS.organizationIds], [
    "fbe60df4-ca01-4ae8-9182-b6696bf9a94f", "9f9a250f-1151-4b18-86d1-1304b4c83706", "ce5078fc-fc3e-462a-9cb5-04a4afaa4ea0",
  ]);
  assert.deepEqual([...PRODUCTION_PEOPLE_EXCLUSIONS.campaignSlugs], ["elf-season-test-2026"]);
  for (const id of QA_PEOPLE_EXCLUSIONS.organizationIds) assert.ok(!PRODUCTION_PEOPLE_EXCLUSIONS.organizationIds.includes(id), "QA IDs are not production IDs");
  assert.equal(peopleExclusionsFor("https://nggabucgcoaffpppchsp.supabase.co").environment, "production");
  assert.equal(peopleExclusionsFor("https://mzsvbxosoidwhntpjdkf.supabase.co/").environment, "qa");
  assert.deepEqual(peopleExclusionsFor("http://127.0.0.1:54321"), { environment: "none", organizationIds: [], campaignSlugs: [] });
  assert.equal(peopleExclusionsFor(undefined).environment, "none");
  assert.equal(supabaseRef("http://nggabucgcoaffpppchsp.supabase.co"), null, "https only");
  assert.equal(supabaseRef("https://evil.example/nggabucgcoaffpppchsp.supabase.co"), null);
  const src = readFileSync(join(process.cwd(), "src/lib/platform/peopleStatsExclusions.ts"), "utf8");
  assert.doesNotMatch(src, /school_name|\.test\(|RegExp|includes\("(QA|Test)/i, "no name-based exclusion");
});

// ── Pending ─────────────────────────────────────────────────────────────────

test("pending invitations and requests are counted separately, only for counted team-seasons", () => {
  const future = "2026-12-01T00:00:00Z", past = "2026-10-01T00:00:00Z";
  const s = computePeopleStats(base({
    campaigns: [camp("a-2027"), camp("demo", { is_demo: true })],
    coaches: [coach("c1", "a-2027", "head_coach", "h@x.test"), coach("c2", "demo", "head_coach", "d@x.test")],
    staffInvitations: [
      { campaign_slug: "a-2027", role: "assistant_coach", accepted_at: null, revoked_at: null, expires_at: future },
      { campaign_slug: "a-2027", role: "booster", accepted_at: "2026-10-02", revoked_at: null, expires_at: future },
      { campaign_slug: "a-2027", role: "booster", accepted_at: null, revoked_at: "2026-10-02", expires_at: future },
      { campaign_slug: "a-2027", role: "booster", accepted_at: null, revoked_at: null, expires_at: past },
      { campaign_slug: "demo", role: "booster", accepted_at: null, revoked_at: null, expires_at: future },
    ],
    parentRequests: [{ campaign_slug: "a-2027", status: "pending" }, { campaign_slug: "a-2027", status: "approved" }],
    athleteRequests: [{ campaign_slug: "a-2027", status: "pending" }, { campaign_slug: "demo", status: "pending" }],
    coachInviteTokens: [
      { coach_id: "c1", used_at: null, expires_at: future }, { coach_id: "c1", used_at: "2026-10-01", expires_at: future },
      { coach_id: "c1", used_at: null, expires_at: past }, { coach_id: "c2", used_at: null, expires_at: future },
    ],
  }));
  assert.deepEqual(s.pending, { staffInvitations: 1, parentRequests: 1, athleteRequests: 1, coachLinkInvitations: 1 });
  assert.equal(s.allTime.total, 1, "pending items never add to the total");
});

// ── Pagination and failure handling ─────────────────────────────────────────

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("fetchAllRows pages with narrow selects and a stable order until a short page", async () => {
  const urls: string[] = [];
  const data = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }];
  const fake = async (url: string) => {
    urls.push(url);
    const off = Number(new URL(url).searchParams.get("offset"));
    return json(data.slice(off, off + 2));
  };
  const rows = await fetchAllRows<{ id: string }>("athletes", "id,campaign_slug", "id", fake, 2);
  assert.deepEqual(rows.map(r => r.id), ["1", "2", "3", "4", "5"]);
  assert.equal(urls.length, 3);
  for (const u of urls) {
    const q = new URL(u).searchParams;
    assert.equal(q.get("select"), "id,campaign_slug");
    assert.equal(q.get("order"), "id");
    assert.equal(q.get("limit"), "2");
  }
  const exact = await fetchAllRows<{ id: string }>("athletes", "id", "id", async u => json(data.slice(0, 4).slice(Number(new URL(u).searchParams.get("offset")), Number(new URL(u).searchParams.get("offset")) + 2)), 2);
  assert.equal(exact.length, 4, "an exact multiple ends on the following empty page");
});

test("fetchAllRows throws on a failed or malformed page — never a partial total", async () => {
  await assert.rejects(fetchAllRows("athletes", "id", "id", async () => json({ message: "nope" }, 500)), /read failed \(500\)/);
  await assert.rejects(fetchAllRows("athletes", "id", "id", async () => json({ rows: [] })), /unexpected shape/);
  let calls = 0;
  await assert.rejects(fetchAllRows("athletes", "id", "id", async () => (++calls === 1 ? json([{ id: "1" }, { id: "2" }]) : json({}, 503)), 2), /503/);
});

const TABLE_DATA: Record<string, unknown[]> = {
  campaign_settings: [camp("a-2027"), camp("demo", { is_demo: true })],
  athletes: [ath("r1", "a-2027")],
  team_members: [mem("m1", "a-2027", "parent", "acct-1")],
  team_coaches: [coach("c1", "a-2027", "head_coach", "secret.coach@x.test")],
  team_staff_invitations: [], parent_access_requests: [], pending_athlete_requests: [], coach_invite_tokens: [],
};
const tableFetch = (fail: string[] = []) => async (url: string) => {
  const table = new URL(url).pathname.split("/").pop()!;
  if (fail.includes(table)) return json({ message: "down" }, 500);
  return json(new URL(url).searchParams.get("offset") === "0" ? TABLE_DATA[table] ?? [] : []);
};

test("loadPeopleStats returns aggregates only and never requests names, emails or phones", async () => {
  const urls: string[] = [];
  const spy = tableFetch();
  const r = await loadPeopleStats(async u => { urls.push(u); return spy(u); }, NOW);
  for (const u of urls) assert.doesNotMatch(new URL(u).searchParams.get("select") ?? "", /email|name|phone/, u);
  assert.ok(urls.some(u => new URL(u).pathname.endsWith("/team_coaches")));
  assert.equal(r.allTime.total, 3);
  assert.equal(r.exclusions.environment, "qa");
  assert.equal(r.pendingAvailable, true);
  const out = JSON.stringify(r);
  for (const leak of ["@", "secret.coach", "acct-1", "\"r1\"", "\"m1\"", "\"c1\""]) assert.ok(!out.includes(leak), leak);
});

test("a failed core read fails the whole statistic; a failed pending read only hides pending", async () => {
  await assert.rejects(loadPeopleStats(tableFetch(["team_members"]), NOW));
  const r = await loadPeopleStats(tableFetch(["coach_invite_tokens"]), NOW);
  assert.equal(r.pendingAvailable, false);
  assert.equal(r.allTime.total, 3);
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
  const origError = console.error; console.error = () => {};
  try {
    assert.equal(await getPeopleStats(), null);
  } finally {
    globalThis.fetch = realFetch; console.error = origError;
  }
});

// ── Access and placement ────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

test("People on ELF lives behind the Platform Admin layout gate and adds no API route", () => {
  assert.ok(existsSync(join(process.cwd(), "src/app/platform-admin/people/page.tsx")));
  assert.match(read("src/app/platform-admin/layout.tsx"), /resolvePlatformAdminGateRedirect\(/);
  const page = read("src/app/platform-admin/people/page.tsx");
  assert.doesNotMatch(page, /getAdminAccess|elf_admin|"use client"/, "never reachable with the shared password; server-rendered");
  assert.match(page, /getPeopleStats\(\)/);
  const apiHits: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.") && readFileSync(p, "utf8").includes("peopleStats")) apiHits.push(p);
    }
  })(join(process.cwd(), "src/app/api"));
  assert.deepEqual(apiHits, [], "no API route exposes people statistics");
  assert.doesNotMatch(read("src/app/api/admin/stats/route.ts"), /peopleStats/, "legacy stats API unchanged");
});

test("dashboard KPI links to the People page and shows — when unavailable", () => {
  const dash = read("src/app/platform-admin/page.tsx");
  assert.match(dash, /label: "People on ELF", value: show\(people \? people\.allTime\.total : null\), href: "\/platform-admin\/people"/);
  assert.match(read("src/lib/platformAdminNav.ts"), /href: "\/platform-admin\/people"/);
});

test("Legacy Admin header: Back to Platform Admin only for Platform Admin accounts; sidebar link kept", () => {
  const shell = read("src/app/admin/AdminShell.tsx");
  assert.match(shell, /\{via === "platform_admin" && \(\n\s*<a href="\/platform-admin" className="adm-back-pa" aria-label="Back to Platform Admin">/);
  assert.match(shell, /via === "platform_admin" \? \(\n\s*<a href="\/platform-admin" className="adm-nav-item"/, "sidebar link unchanged");
  assert.equal((shell.match(/href="\/platform-admin"/g) || []).length, 2);
  const css = read("src/app/admin/adminResponsive.css");
  const outside = css.split("\n@media")[0];
  assert.match(outside, /\.adm-back-pa \{[^}]*display: inline-flex;/, "visible at every width");
  assert.match(css, /\.adm-back-pa \{\n    min-height: 44px;/, "44px tap target on phones");
  assert.match(read("src/app/admin/layout.tsx"), /<AdminShell via=\{access\.via\}>/);
});
