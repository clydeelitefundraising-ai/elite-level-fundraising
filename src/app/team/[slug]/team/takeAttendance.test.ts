// Team Management Phase 5-5 — the roster's Take Attendance entry point:
// who sees it (the real Team page with real signed sessions), where it
// goes, and that the roster header around it (Add Athlete, search, class
// tabs) is unchanged. Rendered with react-dom/server via the attendance
// screen's test-only loader; no database (a fake PostgREST world).
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement, isValidElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: TeamPage } = await import("./page.tsx");
const { default: TeamView } = await import("./TeamView.tsx");
const { RedirectSignal } = await import("../attendance/testSupport/nextNavigationStub.mjs");
const { takeAttendanceHref, attendancePath, rosterPath } = await import("./takeAttendance.ts");
const W = await import("../../../api/team/[slug]/attendance/testSupport/attendanceWorld.mjs");

type El = { type: unknown; props: Record<string, unknown> };

/** Finds the TeamView element inside the Team page's element tree. */
function findTeamView(node: unknown): El | null {
  if (!isValidElement(node)) return null;
  const el = node as unknown as El;
  if (el.type === TeamView) return el;
  for (const value of Object.values(el.props)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = findTeamView(child);
      if (found) return found;
    }
  }
  return null;
}

async function teamPageAs(role: string) {
  return W.withWorld(async () => {
    W.ROLES[role]();
    return TeamPage({ params: Promise.resolve({ slug: W.SLUG }) });
  });
}

// ── Who sees it ───────────────────────────────────────────────────────────

test("Head Coach, Assistant Coach and platform admin get Take Attendance for this team", async () => {
  for (const role of ["head", "assistant", "admin"]) {
    const view = findTeamView(await teamPageAs(role));
    assert.ok(view, role);
    assert.equal(view.props.attendanceHref, `/team/${W.SLUG}/attendance`, role);
  }
});

test("boosters (both kinds), parents and athletes don't", async () => {
  for (const role of ["boosterCoach", "boosterMember", "parent", "athlete"]) {
    const view = findTeamView(await teamPageAs(role));
    assert.ok(view, `${role} still sees the roster`);
    assert.equal(view.props.attendanceHref, null, role);
  }
});

test("signed-out visitors, forged sessions and other teams' coaches never reach the roster (or the action)", async () => {
  for (const role of ["nobody", "forged", "otherTeamHead"]) {
    await assert.rejects(teamPageAs(role), (e: unknown) => e instanceof RedirectSignal, role);
  }
});

test("the roster response carries no attendance data (no attendance reads at all)", async () => {
  await W.withWorld(async (w: { requests: string[] }) => {
    W.ROLES.head();
    await TeamPage({ params: Promise.resolve({ slug: W.SLUG }) });
    assert.deepEqual(w.requests.filter(r => /attendance/.test(r)), []);
  });
});

test("the decision is the attendance screen's own rule (canViewAttendance), and paths keep the team slug", () => {
  const coach = (role: string) => ({ kind: "coach", session: { id: "c1", name: "C", role, campaign_slug: "wolves" } }) as never;
  const member = (role: string) => ({ kind: "member", session: { id: "m1", name: "M", role, campaign_slug: "wolves", athlete_id: null } }) as never;
  assert.equal(takeAttendanceHref("wolves", coach("head_coach")), "/team/wolves/attendance");
  assert.equal(takeAttendanceHref("wolves", coach("assistant_coach")), "/team/wolves/attendance");
  for (const actor of [coach("booster"), member("booster"), member("parent"), member("athlete"), { kind: "public" } as never]) {
    assert.equal(takeAttendanceHref("wolves", actor), null);
  }
  assert.equal(attendancePath("monroe-valley-track-and-field-2027"), "/team/monroe-valley-track-and-field-2027/attendance");
  assert.equal(rosterPath("monroe-valley-track-and-field-2027"), "/team/monroe-valley-track-and-field-2027/team?tab=roster");
  assert.equal(attendancePath("a b/c"), "/team/a%20b%2Fc/attendance", "slug encoded");
});

// ── The roster header ─────────────────────────────────────────────────────

const athletes = [
  { id: W.A(1), name: "Ava Athlete", class_year: "Senior", campaign_slug: W.SLUG, goal_cents: null, event: null, profile_photo: null },
  { id: W.A(2), name: "Ben Brown", class_year: "Junior", campaign_slug: W.SLUG, goal_cents: null, event: null, profile_photo: null },
];
const headCoach = { kind: "coach", session: { id: "c1", name: "Hana", role: "head_coach", campaign_slug: W.SLUG } };
const parent = { kind: "member", session: { id: "m1", name: "Pat", role: "parent", campaign_slug: W.SLUG, athlete_id: W.A(1) } };

function renderRoster(actor: unknown, attendanceHref: string | null) {
  return renderToStaticMarkup(createElement(TeamView, {
    slug: W.SLUG, initialAthletes: athletes as never, actor: actor as never,
    attribution: { totalsCents: {}, donorCounts: {}, lastDonationAt: {} }, contactCounts: {}, outreachMap: {},
    attendanceHref,
  }));
}
const links = (html: string) => [...html.matchAll(/<a href="([^"]+)"[^>]*class="takeAttendance[^"]*"[^>]*>(.*?)<\/a>/g)].map(m => [m[1], m[2].replace(/<[^>]+>/g, "")]);

test("coach roster: Take Attendance (outlined link, calendar-check icon) beside Add Athlete on mobile and desktop", () => {
  const html = renderRoster(headCoach, `/team/${W.SLUG}/attendance`);
  assert.deepEqual(links(html), [
    [`/team/${W.SLUG}/attendance`, "Take Attendance"],   // mobile header
    [`/team/${W.SLUG}/attendance`, "Take Attendance"],   // desktop header
  ]);
  assert.match(html, /class="takeAttendance[^"]*"[^>]*><svg[^>]*lucide-calendar-check/);
  // Mobile: the link comes first, then the unchanged primary Add Athlete (CoachBar).
  assert.match(html, /<div class="rosterHeaderActions"><a href="\/team\/wolves\/attendance"[^>]*>.*?Take Attendance<\/a><div[^>]*><button[^>]*>.*?Add Athlete<\/button><\/div><\/div>/);
  // Desktop: link, then the unchanged Add Athlete button.
  assert.match(html, /class="takeAttendance takeAttendanceMd[^"]*"[^>]*>.*?Take Attendance<\/a><button[^>]*background:var\(--team-primary\)[^>]*>.*?Add Athlete<\/button>/);
});

test("no href: nothing rendered (and parents still get their usual roster)", () => {
  const html = renderRoster(parent, null);
  assert.deepEqual(links(html), []);
  assert.doesNotMatch(html, /Take Attendance/);
  assert.match(html, /Ava Athlete/);
});

test("Add Athlete, search and class tabs are unchanged around the new action", () => {
  const withLink = renderRoster(headCoach, `/team/${W.SLUG}/attendance`);
  const without = renderRoster(headCoach, null);
  const strip = (html: string) => html
    .replace(/<a href="[^"]+"[^>]*class="takeAttendance[^"]*"[^>]*>.*?<\/a>/g, "")
    .replace(/<div class="rosterHeaderActions">/, "<div>");
  // Removing the link (and its wrapper) leaves exactly the roster without it.
  assert.equal(strip(withLink), strip(without));
  assert.equal((withLink.match(/Add Athlete/g) ?? []).length, 2, "mobile and desktop");
  assert.equal((withLink.match(/aria-label="Search athletes"/g) ?? []).length, 2);
  assert.equal((withLink.match(/role="tablist"/g) ?? []).length, 2, "class tabs on both");
});

test("narrow screens: the header wraps instead of overflowing; 44px touch target; no fixed widths", () => {
  const css = readFileSync(new URL("./Team.module.css", import.meta.url), "utf8");
  const rule = (name: string) => new RegExp(`\\.${name} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  assert.match(rule("rosterHeaderActions"), /flex-wrap: wrap/);
  assert.match(rule("rosterHeaderActions"), /margin-left: auto/);
  assert.match(rule("rosterHeaderActions"), /min-width: 0/);
  assert.match(rule("takeAttendance"), /white-space: nowrap/);
  assert.match(css, /\.takeAttendance::after \{[^}]*height: 44px/);
  assert.doesNotMatch(rule("takeAttendance") + rule("rosterHeaderActions"), /(^|[^-])width:/);
  const grid = readFileSync(new URL("./AthleteRosterGrid.tsx", import.meta.url), "utf8");
  assert.match(grid, /display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var\(--space-2\)"/, "the mobile header row may wrap");
});
