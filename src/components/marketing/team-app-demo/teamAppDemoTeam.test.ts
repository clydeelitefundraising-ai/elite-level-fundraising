// Team App demo, Phase 4 — Fundraiser, Team (Overview, Staff, To-Do List,
// athlete profiles), Shop and Partners.
//
//   • Fundraising: the demo's donations add up to the sample campaign
//     exactly ($9,840 of $15,000, 112 donations, 18 days left), every number
//     on the page comes from the app's own builders.
//   • The in-memory API (demoApi.ts) answers each role like the real routes:
//     same permission helpers, validators, builders and error messages.
//   • To-Do: the real acknowledgment and completion rules, including a task
//     revised after a family acknowledged it.
//   • What the demo copies from the app (MyCoachFundraiserCard, the report
//     download helpers) stays identical to the app's.
//   • The browser-global stand-ins never reach the network, share, copy,
//     print or change the visitor's URL.
//   • Everything is fictional: example.com emails, 555-01xx phones,
//     .example websites, illustrated products and logos.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { attributeDonationsToAthletes } from "../../../lib/donationAttribution.ts";
import { buildTeamStats, buildPace, buildTopDonors, buildLeaderboard } from "../../../app/team/[slug]/fundraiser/fundraiserData.ts";
import { isCoachOnly, isHeadCoach, isStaff, shouldShowFundraisingNav, type TeamActor } from "../../../lib/permissions.ts";
import { resolveFundraiserRouteView } from "../../../lib/fundraiserAccess.ts";
import { COMMUNITY_PARTNER_SLOT_COUNT } from "../../../lib/platform/communityPartnerSlots.ts";
import { SAMPLE_ATHLETES, SAMPLE_CAMPAIGN, SAMPLE_COACHES, SAMPLE_DONATIONS, SAMPLE_PREVIEW_PARTNERS } from "../demo/fixtures.ts";
import { DEMO_ACTORS, DEMO_SLUG, JORDAN_ELLIS_ID, DEMO_ROSTER } from "./demoData.ts";
import {
  DEMO_HEAD_COACH_ID, DEMO_TEAM_ATHLETES, buildDemoContacts, buildDemoDonations, buildDemoSettings, coachOwner, demoDisplayGoalCents,
} from "./fundraisingData.ts";
import { DEMO_COMMUNITY_PARTNERS, DEMO_STORE_URL, buildDemoProducts, buildDemoSponsors } from "./teamInfoData.ts";
import { buildDemoDb, createDemoApi, PREVIEW_DONATION, type DemoDb } from "./demoApi.ts";
import { demoHistory, demoSearch, resetDemoLocation } from "./demoHistory.ts";
import { fetch as demoFetch, installDemoServer, navigator as demoNavigator, window as demoWindow, confirm as demoConfirm } from "./demoGlobals.ts";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const D = "src/components/marketing/team-app-demo";
const T = "src/app/team/[slug]";
const NOW = new Date("2026-10-30T20:00:00Z"); // Friday Oct 30, 1 PM in Arizona
const MAYA = DEMO_ROSTER[0].id;

/** A fresh demo API acting as `role` (switchable). */
function api(role: keyof typeof DEMO_ACTORS = "coach") {
  let actor: TeamActor = DEMO_ACTORS[role];
  const notices: string[] = [];
  let db: DemoDb = buildDemoDb(NOW);
  const server = createDemoApi({ initial: db, actor: () => actor, notify: (m) => notices.push(m), onChange: (next) => { db = next; }, now: () => NOW });
  const call = (method: string, path: string, body: unknown = null) => {
    const url = new URL(`https://demo.invalid/api/team/${DEMO_SLUG}${path}`);
    const res = server.handle({ method, path: url.pathname, query: url.searchParams, body });
    assert.ok(res, `${method} ${path} is answered`);
    return { status: res.status ?? 200, json: res.json as Record<string, unknown> & Record<string, never>, text: res.text, headers: res.headers };
  };
  return { call, as: (r: keyof typeof DEMO_ACTORS) => { actor = DEMO_ACTORS[r]; }, db: () => db, notices, server };
}

// ── Fundraising records ─────────────────────────────────────────────────────

test("fundraiser: the demo campaign is the sample campaign — $9,840 of $15,000 from 112 donations, 18 days left", () => {
  const donations = buildDemoDonations(NOW);
  const settings = buildDemoSettings(NOW);
  const raised = donations.reduce((s, d) => s + d.amount_cents, 0);
  assert.equal(raised, SAMPLE_CAMPAIGN.raised * 100);
  assert.equal(donations.length, 112);
  assert.equal(settings.goal_cents, SAMPLE_CAMPAIGN.goal * 100);
  assert.equal(demoDisplayGoalCents(settings.goal_cents, raised), 1_500_000);
  // The app counts days left from the real clock (Date.now()), as the demo
  // does: built "now", the countdown reads 18 at any hour of the day.
  const realNow = Date.now;
  try {
    for (const hour of [0, 6, 12, 18, 23]) {           // Arizona local hours on Oct 30
      const at = Date.parse("2026-10-30T07:05:00Z") + hour * 3_600_000;
      Date.now = () => at;
      const local = buildDemoSettings(new Date(at));
      assert.equal(buildTeamStats(local, buildDemoDonations(new Date(at)), raised).daysRemaining, SAMPLE_CAMPAIGN.daysLeft, `hour ${hour}`);
    }
  } finally {
    Date.now = realNow;
  }
  assert.ok(buildPace(settings, donations, buildTeamStats(settings, donations, raised)), "pace is shown");
  // Each athlete's total and the head coach's are the sample page's.
  const { totalsCents } = attributeDonationsToAthletes(DEMO_TEAM_ATHLETES, donations);
  for (const a of SAMPLE_ATHLETES) assert.equal(totalsCents[a.id], a.raised * 100, a.name);
  assert.equal(donations.filter((d) => d.coach_id === DEMO_HEAD_COACH_ID).reduce((s, d) => s + d.amount_cents, 0), SAMPLE_COACHES[0].raised * 100);
  assert.ok(donations.every((d) => !(d.athlete_id && d.coach_id)), "never both an athlete and a coach");
  assert.ok(donations.every((d) => d.amount_cents >= 1000 && d.amount_cents % 500 === 0));
  // Newest first; the newest six are the sample page's recent donations.
  assert.deepEqual(donations.map((d) => d.created_at), [...donations.map((d) => d.created_at)].sort().reverse());
  assert.deepEqual(donations.slice(0, 6).map((d) => [d.donor_name ?? "Anonymous", d.amount_cents / 100]), SAMPLE_DONATIONS.map((d) => [d.name, d.amount]));
  assert.ok(donations.every((d) => Date.parse(d.created_at) < NOW.getTime() && Date.parse(d.created_at) > NOW.getTime() - 46 * 86_400_000));
  // Deterministic: every visitor sees the same records.
  assert.deepEqual(buildDemoDonations(NOW), donations);
});

test("fundraiser: the display goal is the app's own rule (getDisplayGoalCents, restated line for line)", () => {
  // lib/platform/donations.ts can't be loaded outside the server (it holds
  // the database client), so compare the function's code itself.
  const body = (src: string, name: string) => {
    const start = src.indexOf(`export function ${name}(`);
    assert.ok(start >= 0, name);
    return code(src.slice(src.indexOf("{", src.indexOf(")", start)), src.indexOf("\n}\n", start) + 2)).replace(/\s+/g, " ").trim();
  };
  assert.equal(body(read(`${D}/fundraisingData.ts`), "demoDisplayGoalCents"), body(read("src/lib/platform/donations.ts"), "getDisplayGoalCents"));
  // The behavior the page relies on: well below the goal, it's the goal.
  assert.equal(demoDisplayGoalCents(1_500_000, 984_000), 1_500_000);
  assert.equal(demoDisplayGoalCents(1_500_000, 1_400_000), 1_800_000, "steps up near the goal");
  assert.equal(demoDisplayGoalCents(0, 5), 0);
});

test("fundraiser: leaderboard, top donors and goals come from the app's builders over fictional donors", () => {
  const donations = buildDemoDonations(NOW);
  const board = buildLeaderboard(DEMO_TEAM_ATHLETES, donations);
  assert.deepEqual(board.slice(0, 3).map((e) => e.name), ["Maya Torres", "Jordan Ellis", "Caleb Brooks"]);
  assert.equal(board.find((e) => e.id === JORDAN_ELLIS_ID)!.rank, 2);
  const donors = buildTopDonors(DEMO_TEAM_ATHLETES, donations);
  assert.ok(donors.length > 30 && donors[0].totalCents >= donors[1].totalCents);
  assert.ok(DEMO_TEAM_ATHLETES.every((a) => a.goal_cents === SAMPLE_ATHLETES.find((s) => s.id === a.id)!.goal * 100));
});

test("fundraiser: every role sees the Fundraiser tab (fundraising is on); coaches get the coach dashboard, families their athlete", () => {
  for (const r of ["coach", "athlete", "parent"] as const) {
    assert.equal(shouldShowFundraisingNav(true, DEMO_ACTORS[r]), true, r);
    assert.equal(resolveFundraiserRouteView(true, DEMO_ACTORS[r]), "dashboard", r);
  }
  const page = code(read(`${D}/DemoFundraiser.tsx`));
  assert.match(page, /if \(actor\.kind === "coach"\) \{[\s\S]*<FundraiserTabs[\s\S]*<CoachDashboard[\s\S]*<FollowUpsWorkspaceView/);
  assert.match(page, /<FundraiserView\s+mode="athlete"/);
  // Top Donors (donors) is coach-only, exactly as parseFundraiserListView decides.
  assert.match(page, /parseFundraiserListView\(requestedView, true\)/);
  assert.match(page, /parseFundraiserListView\(requestedView, false\)/);
});

test("fundraiser: My Fundraiser is the real page's card, copied verbatim (only its share button is the preview twin)", () => {
  const extract = (src: string) => {
    const start = src.indexOf("function MyCoachFundraiserCard(");
    const end = src.indexOf("\n}\n", start);
    return src.slice(start, end + 2);
  };
  const real = extract(read(`${T}/fundraiser/page.tsx`));
  const demo = extract(read(`${D}/DemoFundraiser.tsx`));
  assert.ok(real.length > 1000);
  assert.equal(demo, real);
  assert.match(read(`${D}/DemoFundraiser.tsx`), /import CoachShareButton from "\.\/DemoCoachShareButton";/);
});

// ── The API, by role ────────────────────────────────────────────────────────

test("api: no donation is ever made — checkout answers with a preview-only message", () => {
  const { server } = api("athlete");
  const res = server.handle({ method: "POST", path: "/api/checkout", query: new URLSearchParams(), body: { amountCents: 5000 } });
  assert.equal(res?.status, 503);
  assert.deepEqual(res?.json, { error: PREVIEW_DONATION });
});

test("api: contacts — athletes and parents manage their athlete's list, the participating coach her own, with the real validation", () => {
  const a = api("athlete");
  assert.deepEqual(a.call("GET", "/contacts?summary=1").json, { count: 7, goal: 10 });
  assert.equal(a.call("POST", "/contacts", { first_name: "Pat" }).json.error, "At least one of phone or email is required.");
  assert.equal(a.call("POST", "/contacts", { email: "nope" }).json.error, "Email must contain @.");
  const added = a.call("POST", "/contacts", { first_name: "Pat", phone: "(602) 555-0199", relationship: "Neighbor" });
  assert.equal(added.status, 200);
  assert.equal(added.json.added_by_type, "athlete");
  a.as("parent");
  assert.deepEqual(a.call("GET", "/contacts?summary=1").json, { count: 8, goal: 10 }, "the parent sees Jordan's list");
  assert.equal(a.call("GET", `/contacts?athleteId=${MAYA}`).json.contacts.length, 8, "an unlinked athlete id falls back to Jordan");
  a.as("coach");
  assert.equal(a.call("GET", "/contacts").json.contacts.length, 8, "Coach Whitfield's own contacts");
  assert.equal(a.call("GET", `/contacts/coach/athlete/${JORDAN_ELLIS_ID}`).json.contacts.length, 8);
  a.as("athlete");
  assert.equal(a.call("GET", `/contacts/coach/athlete/${MAYA}`).status, 403, "staff only");
  assert.equal(a.call("GET", "/contacts/coach/summary").status, 403);
  const mayas = buildDemoContacts(NOW)[MAYA][0];
  assert.equal(a.call("DELETE", `/contacts/${mayas.id}`).status, 403, "not their athlete's contact");
});

test("api: follow-ups — only staff log outreach; the entry is attributed to the signed-in coach", () => {
  const a = api("athlete");
  assert.equal(a.call("POST", `/outreach/${MAYA}`, { status: "contacted" }).status, 401);
  a.as("coach");
  assert.equal(a.call("POST", `/outreach/${MAYA}`, { status: "maybe" }).status, 400);
  const row = a.call("POST", `/outreach/${MAYA}`, { status: "needs_follow_up", note: "  Call grandparents  " });
  assert.equal(row.json.contacted_by, "Dana Whitfield");
  assert.equal(row.json.note, "Call grandparents");
  assert.equal(a.call("GET", `/outreach/${MAYA}`).json[0].id, row.json.id, "newest first");
  assert.ok(a.call("GET", `/outreach/coach/${DEMO_HEAD_COACH_ID}`).status === 200);
});

test("api: the coach's Athlete Report is the real export's columns, with a BOM", () => {
  const { call } = api("coach");
  const res = call("GET", "/analytics/export/athletes");
  assert.ok(res.text?.startsWith("\uFEFFRank,Name,Participant Type,Role / Grade,Event,Jersey #,Grad Year,Fundraising Contacts,Donor Count,Amount Raised,Goal,% of Goal,Follow-Up Status,Last Outreach\r\n"));
  // Coaches and athletes ranked together by amount raised, like the route.
  assert.match(res.text!, /\r\n1,Dana Whitfield,Coach,Head Coach,,,,8,10,\$1290\.00,\$1500\.00,86%,,\r\n/);
  assert.match(res.text!, /\r\n2,Maya Torres,Athlete,Senior,Wide Receiver,1,2027,12,13,\$1240\.00,\$1000\.00,100%,,\r\n/);
  assert.match(res.text!, /,Mason Reyes,Athlete,Sophomore,Cornerback,24,2029,0,8,\$585\.00,\$750\.00,78%,Needs Follow Up,\d{4}-\d\d-\d\d\r\n/);
  const real = read("src/app/api/team/[slug]/analytics/export/athletes/route.ts");
  assert.ok(real.includes('"Rank", "Name", "Participant Type", "Role / Grade", "Event", "Jersey #", "Grad Year",'));
  assert.ok(real.includes('"Fundraising Contacts", "Donor Count", "Amount Raised", "Goal", "% of Goal",'));
});

// ── To-Do List ──────────────────────────────────────────────────────────────

test("to-do: each role sees the tasks the app shows them, with their own acknowledgment status", () => {
  const a = api("coach");
  const coach = a.call("GET", "/todo/tasks").json;
  assert.equal(coach.viewer, "manager");
  assert.equal(coach.canManage, true);
  assert.equal(coach.tasks.length, 5);
  assert.equal(a.call("GET", "/todo/tasks?status=archived").json.tasks.length, 1);
  a.as("athlete");
  const athlete = a.call("GET", "/todo/tasks").json;
  assert.equal(athlete.canManage, false);
  assert.deepEqual(athlete.tasks.map((t: { audience: string; my_ack: string }) => [t.audience, t.my_ack]), [["both", "done"], ["both", "todo"], ["athlete", "done"]]);
  assert.equal(a.call("GET", "/todo/tasks?status=archived").status, 403, "only the Head Coach sees archived tasks");
  a.as("parent");
  const parent = a.call("GET", "/todo/tasks").json;
  assert.deepEqual(parent.tasks.map((t: { audience: string; my_ack: string }) => [t.audience, t.my_ack]), [["both", "done"], ["both", "done"], ["parent", "todo"], ["parent", "todo"]]);
  assert.equal(a.call("POST", "/todo/tasks", { title: "x", audience: "both" }).status, 403, "only the Head Coach creates tasks");
});

test("to-do: acknowledging follows the app's rules — revision, typed name, the checkbox, then recorded once", () => {
  const a = api("athlete");
  const conduct = a.call("GET", "/todo/tasks").json.tasks[1];
  const path = `/todo/tasks/${conduct.id}/acknowledgment`;
  const view = a.call("GET", path).json.acknowledgment;
  assert.deepEqual(view.outstandingAthleteIds, [JORDAN_ELLIS_ID]);
  assert.equal(view.children[0].name, "Jordan Ellis");
  const body = { expected_revision: conduct.revision, full_name: "Jordan Ellis", confirmed: true, athlete_ids: [JORDAN_ELLIS_ID] };
  assert.equal(a.call("POST", path, { ...body, expected_revision: 1 }).json.reason, "revision_changed");
  assert.equal(a.call("POST", path, { ...body, full_name: "J" }).json.reason, "invalid_name");
  assert.equal(a.call("POST", path, { ...body, confirmed: false }).json.reason, "not_confirmed");
  assert.equal(a.call("POST", path, { ...body, athlete_ids: [] }).json.reason, "children_changed");
  const ok = a.call("POST", path, body);
  assert.equal(ok.json.recorded, 1);
  assert.deepEqual(ok.json.acknowledgment.outstandingAthleteIds, []);
  assert.equal(ok.json.acknowledgment.children[0].entries.find((e: { requirement: string }) => e.requirement === "athlete").by, "you");
  assert.equal(a.call("POST", path, body).json.reason, "already_satisfied");
  assert.equal(a.call("GET", "/todo/tasks").json.tasks[1].my_ack, "done");
  // The coach can't acknowledge for a family.
  a.as("coach");
  assert.equal(a.call("POST", path, body).json.reason, "not_eligible");
});

test("to-do: the coach's completion view — complete, outstanding, needs update, not joined, no parent linked", () => {
  const a = api("coach");
  const summary = a.call("GET", "/todo/completion").json;
  assert.equal(summary.athleteCount, 10);
  assert.equal(summary.tasks.length, 5);
  const conduct = a.call("GET", "/todo/tasks").json.tasks[1];
  const detail = a.call("GET", `/todo/completion/tasks/${conduct.id}`).json;
  const stateOf = (name: string, req: string) => detail.athletes.find((r: { athlete: { name: string } }) => r.athlete.name === name)
    .entries.find((e: { requirement: string }) => e.requirement === req).state;
  assert.equal(stateOf("Maya Torres", "athlete"), "complete");
  assert.equal(stateOf("Maya Torres", "parent"), "needs_update", "acknowledged before the task was revised");
  assert.equal(stateOf("Jordan Ellis", "athlete"), "outstanding");
  assert.equal(stateOf("Jordan Ellis", "parent"), "complete");
  assert.equal(stateOf("Caleb Brooks", "athlete"), "not_joined");
  assert.equal(stateOf("Lucas Bennett", "parent"), "no_parent_linked");
  // Families see their own athlete's applicable tasks only; never another athlete's.
  a.as("parent");
  const family = a.call("GET", `/todo/family-completion/${JORDAN_ELLIS_ID}`).json;
  assert.deepEqual(family.tasks.map((t: { task: { audience: string } }) => t.task.audience).sort(), ["both", "both", "parent", "parent"]);
  assert.equal(a.call("GET", `/todo/family-completion/${MAYA}`).status, 404);
  assert.equal(a.call("GET", "/todo/completion").status, 403);
});

test("to-do: editing a task the way the database does — a real change raises the revision, a stale version conflicts", () => {
  const a = api("coach");
  const physical = a.call("GET", "/todo/tasks").json.tasks[0];
  const edit = (patch: Record<string, unknown>) => a.call("PATCH", `/todo/tasks/${physical.id}`, {
    title: physical.title, audience: physical.audience, instructions: physical.instructions, body_text: physical.body_text,
    resources: physical.resources.map((r: { kind: string; url: string; attachment_id: string; label: string }) => (r.kind === "link" ? { kind: "link", url: r.url, label: r.label } : { kind: "file", attachment_id: r.attachment_id })),
    expected_version: physical.version, ...patch,
  });
  const same = edit({});
  assert.equal(same.json.revisionChanged, false, "saving without changes keeps acknowledgments");
  assert.equal(edit({}).status, 409, "the old version is now stale");
  const fresh = a.call("GET", "/todo/tasks").json.tasks[0];
  const changed = a.call("PATCH", `/todo/tasks/${fresh.id}`, { title: "Turn in your updated physical form", audience: "both", expected_version: fresh.version, resources: [] });
  assert.equal(changed.json.revisionChanged, true);
  assert.equal(a.call("PATCH", `/todo/tasks/${fresh.id}`, { title: "", audience: "both", expected_version: 99 }).json.error, "Title is required.");
  // Jordan's earlier acknowledgment no longer counts.
  a.as("athlete");
  assert.equal(a.call("GET", "/todo/tasks").json.tasks[0].my_ack, "todo");
});

test("to-do: the completion report is the app's own CSV (buildCompletionCsv), saved as a preview", () => {
  const { call } = api("coach");
  const res = call("GET", "/todo/completion/export");
  assert.ok(res.text?.startsWith("\uFEFF"), "UTF-8 BOM, like the app's report");
  assert.match(res.headers!["Content-Type"], /^text\/csv/);
  assert.match(res.headers!["Content-Disposition"], /filename=".+\.csv"/);
  assert.match(res.text!, /Jordan Ellis/);
});

// ── Overview, Staff, Shop, Partners ─────────────────────────────────────────

test("team: only the Head Coach edits the Overview and the Booster setting; everyone sees the staff", () => {
  const a = api("athlete");
  assert.equal(a.call("PATCH", "/overview", { team_about: "Hi" }).status, 403);
  const staff = a.call("GET", "/staff-roster").json;
  assert.equal(staff.canManageBoosterVisibility, false);
  assert.deepEqual(staff.staff.map((s: { role: string }) => s.role), ["head_coach", "assistant_coach", "booster"]);
  assert.equal(a.call("PATCH", "/settings/booster-visibility", { show_booster_in_staff_roster: false }).status, 403);
  a.as("coach");
  assert.equal(a.call("PATCH", "/overview", { location: { street: "1 Main", city_state: "", zip: "" } }).json.error, "Add the city and state for this address.");
  assert.equal(a.call("PATCH", "/overview", { location: { street: "4400 E. Comet Way", city_state: "Sunridge Valley, AZ", zip: "85999" } }).status, 200);
  assert.equal(a.call("PATCH", "/settings/booster-visibility", { show_booster_in_staff_roster: false }).status, 200);
  assert.equal(a.call("GET", "/staff-roster").json.staff.length, 2, "the booster is hidden from the roster");
});

test("shop and partners: staff manage the Gear Gallery, coaches manage Team Sponsors — families only view", () => {
  for (const [r, staff, coach] of [["coach", true, true], ["athlete", false, false], ["parent", false, false]] as const) {
    assert.equal(isStaff(DEMO_ACTORS[r]), staff, r);
    assert.equal(isCoachOnly(DEMO_ACTORS[r]), coach, r);
  }
  assert.equal(isHeadCoach(DEMO_ACTORS.coach), true);
  const a = api("parent");
  assert.equal(a.call("POST", "/shop/products", { name: "Mug", price_cents: 1200 }).status, 403);
  assert.equal(a.call("POST", "/sponsors", { name: "A", url: "https://a.example" }).status, 403);
  a.as("coach");
  const p = a.call("POST", "/shop/products", { name: "Comets Mug", price_cents: 1200, category: "Accessories" });
  assert.equal(p.json.name, "Comets Mug");
  assert.equal(a.call("POST", "/sponsors", { name: "A" }).json.error, "Name and URL are required.");
  // The real views decide what's shown: hidden products and sponsor
  // management are staff/coach-only inside the twins.
  assert.match(read(`${D}/DemoShopView.tsx`), /const visibleProducts {3}= isCoach \? products : products\.filter\(p => p\.visible\);/);
  assert.match(read(`${D}/DemoSponsorsView.tsx`), /const canManage = isCoachOnly\(actor\) && !seasonReadOnly;/);
});

test("shop: fictional Comets merchandise with original illustrations; buying only ever happens in the (fictional) team store", () => {
  const products = buildDemoProducts(NOW);
  assert.equal(products.length, 8);
  assert.ok(products.some((p) => !p.visible), "a hidden product only staff see");
  for (const p of products) {
    assert.ok(existsSync(join(ROOT, "public", p.image_url!)), p.image_url!);
    assert.ok(p.external_url === null || p.external_url.startsWith(`${DEMO_STORE_URL}/`), p.name);
  }
  assert.equal(new URL(DEMO_STORE_URL).hostname.endsWith(".example"), true);
});

test("partners: the sample Community Partners in every position, team sponsors with no invented agreements", () => {
  assert.equal(DEMO_COMMUNITY_PARTNERS.length, COMMUNITY_PARTNER_SLOT_COUNT);
  assert.deepEqual(DEMO_COMMUNITY_PARTNERS.map((p) => p.business_name), SAMPLE_PREVIEW_PARTNERS.map((p) => p.business_name));
  assert.ok(DEMO_COMMUNITY_PARTNERS.every((p) => p.website_url === null && existsSync(join(ROOT, "public", p.logo_url!))));
  const sponsors = buildDemoSponsors(NOW);
  assert.ok(sponsors.every((s) => s.sponsorship_amount_cents === null && !s.contact_name && !s.contact_email && !s.contact_phone));
  assert.ok(sponsors.every((s) => new URL(s.url).hostname.endsWith(".example") && existsSync(join(ROOT, "public", s.logo_url!))));
});

test("data: everything is fictional — example.com emails, 555-01xx phones, .example websites only", () => {
  for (const f of ["fundraisingData.ts", "todoData.ts", "teamInfoData.ts", "demoApi.ts"]) {
    const src = code(read(`${D}/${f}`));
    for (const m of src.matchAll(/[a-z0-9.]+@([a-z0-9.-]+\.[a-z]{2,})/gi)) assert.equal(m[1], "example.com", `${f}: ${m[0]}`);
    for (const m of src.matchAll(/https?:\/\/([^/"`\s]+)/g)) assert.match(m[1], /\.example$|^demo\.invalid$|^\$\{slug\}\.example$/, `${f}: ${m[0]}`);
  }
  const db = buildDemoDb(NOW);
  const phones = [...Object.values(db.contacts).flat().map((c) => c.phone), ...db.athletes.map((a) => a.contact_phone)].filter(Boolean) as string[];
  assert.ok(phones.length > 50 && phones.every((p) => /^\(\d{3}\) 555-01\d\d$/.test(p)), "only the fictional 555-01xx range");
  const emails = [...Object.values(db.contacts).flat().map((c) => c.email), ...db.athletes.map((a) => a.contact_email)].filter(Boolean) as string[];
  assert.ok(emails.every((e) => e.endsWith("@example.com")));
  assert.ok(db.contacts[coachOwner(DEMO_HEAD_COACH_ID)].length === 8);
});

// ── The browser-global stand-ins ────────────────────────────────────────────

test("globals: the twins' fetch is answered by the demo — never the network — and unknown calls get a preview error", async () => {
  const notices: string[] = [];
  const uninstall = installDemoServer({ handle: (req) => (req.path.endsWith("/ping") ? { json: { ok: req.method } } : null), notify: (m) => notices.push(m) });
  try {
    const ok = await demoFetch("/api/team/x/ping", { method: "POST", body: "{}" });
    assert.deepEqual(await ok.json(), { ok: "POST" });
    const missing = await demoFetch("https://example.com/anything");
    assert.equal(missing.status, 503);
    assert.match((await missing.json()).error, /^Preview only/);
    assert.equal(notices.length, 1);
  } finally {
    uninstall();
  }
  const src = code(read(`${D}/demoGlobals.ts`));
  assert.ok(!/globalThis\.fetch|XMLHttpRequest|sendBeacon/.test(src), "never calls the real fetch");
});

test("globals: share, copy, confirm and print are previews; history is the demo's own", async () => {
  const notices: string[] = [];
  const uninstall = installDemoServer({ handle: () => null, notify: (m) => notices.push(m) });
  try {
    await demoNavigator.share({ url: "x" } as ShareData);
    // Copying is refused (so no button ever says "Copied"), with a notice.
    await assert.rejects(demoNavigator.clipboard.writeText("x"));
    assert.equal(demoConfirm("Delete?"), true);
    assert.equal(notices.length, 2);
    assert.ok(notices.every((n) => n.startsWith("Preview only")));
  } finally {
    uninstall();
  }
  resetDemoLocation("tab=clearance");
  demoWindow.history.pushState({ elfTodoBack: "list" }, "", "?tab=clearance&view=completion");
  assert.equal(demoSearch(), "tab=clearance&view=completion");
  assert.deepEqual(demoHistory.state, { elfTodoBack: "list" });
  demoHistory.back();
  assert.equal(demoSearch(), "tab=clearance");
  demoWindow.history.replaceState(null, "", "/team/demo/screen");
  assert.equal(demoSearch(), "");
});

test("reports: the download helpers the demo copies stay identical to the app's", () => {
  const real = read(`${T}/team/reportDownload.ts`);
  const demo = read(`${D}/demoReportDownload.ts`);
  const block = (src: string, start: string, end: string) => {
    const i = src.indexOf(start);
    assert.ok(i >= 0, start);
    return src.slice(i, src.indexOf(end, i));
  };
  assert.equal(
    block(demo, "export class ReportDownloadError", "// ── The demo's delivery").trim(),
    block(real, "export class ReportDownloadError", "/** A normal browser download").trim(),
  );
  assert.ok(!/nativePushDevice|nativeFileShare|Capacitor/.test(code(demo)), "never loads the app's native bridges");
});

// ── Screens and hints ───────────────────────────────────────────────────────

test("screens: every tab is the real screen now — no 'next phase' placeholders left in the Team tab or the bottom-nav tabs", () => {
  const team = code(read(`${D}/DemoTeam.tsx`));
  assert.ok(!/NextPhase/.test(team));
  for (const twin of ["DemoOverviewView", "DemoTeamStaffRosterView", "DemoTodoListView", "DemoCoachAthleteView", "DemoAthleteProfileView"]) {
    assert.match(team, new RegExp(`from "\\./${twin}"`));
  }
  const shell = code(read(`${D}/TeamAppDemo.tsx`));
  for (const tab of ["fundraiser", "shop", "sponsors", "team"]) assert.match(shell, new RegExp(`tab === "${tab}" \\?`));
  // The simulator has a hint for every tab, for every role.
  const sim = read("src/components/marketing/demo/TeamAppSimulator.tsx");
  const hints = sim.slice(sim.indexOf("export const TAB_HINTS"), sim.indexOf("const TAB_NAMES"));
  for (const role of ["coach", "athlete", "parent"]) {
    const block = hints.slice(hints.indexOf(`  ${role}: {`), hints.indexOf("  },", hints.indexOf(`  ${role}: {`)));
    for (const tab of ["home", "communications", "calendar", "fundraiser", "shop", "team", "sponsors"]) {
      assert.match(block, new RegExp(`\\n    ${tab}: "[^"]+",`), `${role} ${tab} hint`);
    }
  }
});
