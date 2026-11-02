// Attendance Reports — entry points (roster header, attendance screen),
// the reports page's access gate, the filter/URL helpers, and the screen's
// responsive rules. Same test-only UI loader and fake PostgREST world as the
// Take Attendance tests.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("../testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement, isValidElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: TeamPage } = await import("../../team/page.tsx");
const { default: TeamView } = await import("../../team/TeamView.tsx");
const { default: ReportsPage } = await import("./page.tsx");
const { default: AttendanceReportsView } = await import("./AttendanceReportsView.tsx");
const { RedirectSignal } = await import("../testSupport/nextNavigationStub.mjs");
const { attendanceReportsHref, attendanceReportsPath } = await import("../../team/takeAttendance.ts");
const { attendanceReportsQuery, reportApiUrl, reportsPagePath } = await import("./reportQuery.ts");
const W = await import("../../../../api/team/[slug]/attendance/testSupport/attendanceWorld.mjs");

type El = { type: unknown; props: Record<string, unknown> };

function find(node: unknown, type: unknown): El | null {
  if (!isValidElement(node)) return null;
  const el = node as unknown as El;
  if (el.type === type) return el;
  for (const value of Object.values(el.props)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = find(child, type);
      if (found) return found;
    }
  }
  return null;
}

function withSettings(w: { db: Record<string, unknown> }) {
  w.db.campaign_settings = [{ campaign_slug: W.SLUG, school_name: "Wolves High", sport_name: "Track", season: "2026–27" }];
}

// ── Roster entry point ────────────────────────────────────────────────────

test("roster: coaches and platform admins get the Attendance Reports link; others don't", async () => {
  for (const [role, expected] of [
    ["head", `/team/${W.SLUG}/attendance/reports`], ["assistant", `/team/${W.SLUG}/attendance/reports`], ["admin", `/team/${W.SLUG}/attendance/reports`],
    ["boosterCoach", null], ["boosterMember", null], ["parent", null], ["athlete", null],
  ] as const) {
    const page = await W.withWorld(async () => { W.ROLES[role](); return TeamPage({ params: Promise.resolve({ slug: W.SLUG }) }); });
    const view = find(page, TeamView);
    assert.ok(view, role);
    assert.equal(view.props.reportsHref, expected, role);
  }
});

const athletes = [{ id: W.A(1), name: "Ava Athlete", class_year: "Senior", campaign_slug: W.SLUG, goal_cents: null, event: null, profile_photo: null }];
const headCoach = { kind: "coach", session: { id: "c1", name: "Hana", role: "head_coach", campaign_slug: W.SLUG } };

function renderRoster(reportsHref: string | null) {
  return renderToStaticMarkup(createElement(TeamView, {
    slug: W.SLUG, initialAthletes: athletes as never, actor: headCoach as never,
    attribution: { totalsCents: {}, donorCounts: {}, lastDonationAt: {} }, contactCounts: {}, outreachMap: {},
    attendanceHref: `/team/${W.SLUG}/attendance`, reportsHref,
  }));
}

test("roster header: Reports beside Take Attendance (phone), Attendance Reports on desktop", () => {
  const html = renderRoster(`/team/${W.SLUG}/attendance/reports`);
  const links = [...html.matchAll(/<a href="([^"]+)"[^>]*class="takeAttendance[^"]*"[^>]*>(.*?)<\/a>/g)].map(m => [m[1], m[2].replace(/<[^>]+>/g, "")]);
  assert.deepEqual(links, [
    [`/team/${W.SLUG}/attendance`, "Take Attendance"],
    [`/team/${W.SLUG}/attendance/reports`, "Reports"],
    [`/team/${W.SLUG}/attendance`, "Take Attendance"],
    [`/team/${W.SLUG}/attendance/reports`, "Attendance Reports"],
  ]);
  assert.match(html, /aria-label="Attendance Reports"/);
  assert.doesNotMatch(renderRoster(null), /attendance\/reports/);
});

test("reports stay reachable in a completed season (Take Attendance doesn't)", () => {
  for (const file of ["AthleteRosterGrid.tsx", "DesktopRosterTable.tsx"]) {
    const src = readFileSync(new URL(`../../team/${file}`, import.meta.url), "utf8");
    assert.match(src, /\{attendanceHref && !seasonReadOnly && <TakeAttendanceLink/);
    assert.match(src, /\{reportsHref && <AttendanceReportsLink href=\{reportsHref\}/, file);
  }
});

test("attendance screen header links to Attendance Reports", () => {
  const src = readFileSync(new URL("../AttendanceScreen.tsx", import.meta.url), "utf8");
  assert.match(src, /<Link href=\{attendanceReportsPath\(slug\)\}[^>]*>\s*Attendance Reports\s*<\/Link>/);
});

test("the link rule is the attendance rule; paths keep the slug", () => {
  const coach = (role: string) => ({ kind: "coach", session: { id: "c1", name: "C", role, campaign_slug: "wolves" } }) as never;
  const member = (role: string) => ({ kind: "member", session: { id: "m1", name: "M", role, campaign_slug: "wolves", athlete_id: null } }) as never;
  assert.equal(attendanceReportsHref("wolves", coach("head_coach")), "/team/wolves/attendance/reports");
  assert.equal(attendanceReportsHref("wolves", coach("assistant_coach")), "/team/wolves/attendance/reports");
  for (const actor of [coach("booster"), member("booster"), member("parent"), member("athlete"), { kind: "public" } as never]) {
    assert.equal(attendanceReportsHref("wolves", actor), null);
  }
  assert.equal(attendanceReportsPath("a b/c"), "/team/a%20b%2Fc/attendance/reports");
});

// ── The reports page gate ─────────────────────────────────────────────────

async function reportsPageAs(role: string, searchParams: Record<string, string> = {}) {
  return W.withWorld(async (w: { db: Record<string, unknown> }) => {
    withSettings(w);
    W.ROLES[role]();
    return ReportsPage({ params: Promise.resolve({ slug: W.SLUG }), searchParams: Promise.resolve(searchParams) });
  });
}

test("reports page: coaches get the report screen with their filters; others get the coach-only notice", async () => {
  for (const role of ["head", "assistant", "admin"]) {
    const page = await reportsPageAs(role, { from: "2026-10-01", to: "2026-10-19", sort: "percent", athlete: "../bad" });
    const view = find(page, AttendanceReportsView);
    assert.ok(view, role);
    assert.deepEqual(view.props.initial, { from: "2026-10-01", to: "2026-10-19", athlete: null, sort: "percent" });
    assert.equal(view.props.teamName, "Wolves High Track");
  }
  for (const role of ["boosterCoach", "boosterMember", "parent", "athlete"]) {
    const html = renderToStaticMarkup(await reportsPageAs(role) as never);
    assert.match(html, /Coach Access Only/, role);
    assert.match(html, /Attendance reports are only available to this team/);
  }
  for (const role of ["nobody", "forged", "otherTeamHead"]) {
    await assert.rejects(reportsPageAs(role), (e: unknown) => e instanceof RedirectSignal, role);
  }
});

// ── Filters in the URL and the downloads ──────────────────────────────────

test("query parsing drops anything malformed", () => {
  assert.deepEqual(attendanceReportsQuery({ from: "2026-10-01", to: ["2026-10-02", "x"], athlete: "a-1", sort: "absences" }),
    { from: "2026-10-01", to: null, athlete: "a-1", sort: "absences" });
  assert.deepEqual(attendanceReportsQuery({ from: "10/01/2026", athlete: "a/b", sort: "x" }), { from: null, to: null, athlete: null, sort: "name" });
});

test("downloads carry exactly the on-screen filters", () => {
  const q = { from: "2026-10-01", to: "2026-10-19", athlete: "a-1", sort: "percent" as const };
  const base = "/api/team/wolves/attendance/report?from=2026-10-01&to=2026-10-19&athlete=a-1&sort=percent";
  assert.equal(reportApiUrl("wolves", q, "json"), base);
  assert.equal(reportApiUrl("wolves", q, "pdf"), `${base}&format=pdf`);
  assert.equal(reportApiUrl("wolves", q, "csv-athletes"), `${base}&format=csv`);
  assert.equal(reportApiUrl("wolves", q, "csv-sessions"), `${base}&format=csv&view=sessions`);
  assert.equal(reportsPagePath("wolves", { from: null, to: null, athlete: null, sort: "name" }), "/team/wolves/attendance/reports");
  const view = readFileSync(new URL("./AttendanceReportsView.tsx", import.meta.url), "utf8");
  assert.match(view, /const shown: ReportQuery = data \? \{ \.\.\.query, from: data\.from, to: data\.to \} : query;/);
  for (const f of ["pdf", "csv-athletes", "csv-sessions"]) assert.ok(view.includes(`reportApiUrl(slug, shown, "${f}")`), f);
});

// ── Layout ────────────────────────────────────────────────────────────────

test("phones: stacked filters, athlete cards, 44px controls, no fixed widths; table from 768px", () => {
  const css = readFileSync(new URL("./AttendanceReports.module.css", import.meta.url), "utf8");
  const rule = (sel: string) => new RegExp(`\\${sel} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  assert.match(rule(".table"), /display: none/);
  assert.match(css, /@media \(min-width: 768px\) \{\s*\.table \{ display: table; \}\s*\.athleteCards \{ display: none; \}/);
  for (const sel of [".input", ".downloadBtn", ".backLink", ".sessionSummary"]) assert.match(rule(sel), /min-height: 44px/, sel);
  assert.match(rule(".input"), /font-size: 1rem/, "no iOS zoom");
  // (1px is the visually-hidden label's standard clip, not a layout width.)
  assert.doesNotMatch(css, /(^|[^-])width: (?!1px)\d+px/m, "no fixed pixel widths");
});

test("the screen's first render is a loading state (no invented numbers before the report arrives)", () => {
  const html = renderToStaticMarkup(createElement(AttendanceReportsView, {
    slug: W.SLUG, teamName: "Wolves High Track", initial: { from: null, to: null, athlete: null, sort: "name" },
  }));
  assert.match(html, /Loading report…/);
  assert.doesNotMatch(html, /%/);
});

// ── View Absences ─────────────────────────────────────────────────────────

test("View Absences: the on-screen list is exactly the exported list, newest first", async () => {
  const { AbsenceList } = await import("./AttendanceReportsView.tsx");
  const { buildAttendanceReport } = await import("@/lib/attendanceReport");
  const { absenceDatesCell } = await import("@/lib/attendanceReportCsv");
  const TZ = "America/Phoenix";
  const report = buildAttendanceReport({
    sessions: [{ id: "s1", date: "2026-10-22", timeZone: TZ }, { id: "s2", date: "2026-10-23", timeZone: TZ }, { id: "s3", date: "2026-10-24", timeZone: TZ }],
    roster: [
      { id: "jo", name: "Jo Junior", classYear: null, createdAt: null },
      { id: "sam", name: "Sam Senior", classYear: null, createdAt: null },
    ],
    records: [
      { sessionId: "s1", athleteId: "jo", status: "absent", absenceReason: "excused" },
      { sessionId: "s2", athleteId: "jo", status: "absent", absenceReason: "unexcused" },
      { sessionId: "s3", athleteId: "jo", status: "absent", absenceReason: "other" },
      { sessionId: "s1", athleteId: "sam", status: "present", absenceReason: null },
      { sessionId: "s2", athleteId: "sam", status: "present", absenceReason: null },
      // s3: Sam unmarked — never an absence
    ],
  }, { from: "2026-10-01", to: "2026-10-31", athleteId: null, sort: "name" });
  for (const a of report.athletes) {
    const html = renderToStaticMarkup(createElement(AbsenceList, { absences: a.absences }));
    const items = [...html.matchAll(/<li[^>]*><span[^>]*>([^<]+)<\/span><span[^>]*>([^<]+)<\/span><\/li>/g)].map(m => `${m[1]} – ${m[2]}`);
    const shown = items.length ? items.join("; ") : html.replace(/<[^>]+>/g, "");
    assert.equal(shown, absenceDatesCell(a.absences), a.name);
  }
  const jo = renderToStaticMarkup(createElement(AbsenceList, { absences: report.athletes[0].absences }));
  assert.match(jo, /Oct 24, 2026.*Other.*Oct 23, 2026.*Unexcused.*Oct 22, 2026.*Excused/);
  assert.equal(renderToStaticMarkup(createElement(AbsenceList, { absences: report.athletes[1].absences })).replace(/<[^>]+>/g, ""), "No recorded absences in this period.");
});

test("View Absences: a toggle per athlete in the table and on phone cards, 44px, accessible", () => {
  const view = readFileSync(new URL("./AttendanceReportsView.tsx", import.meta.url), "utf8");
  assert.match(view, /<AbsencesToggle a=\{a\} open=\{openAbsences\.has\(a\.athleteId\)\} onToggle=\{toggleAbsences\} idPrefix="t" \/>/);
  assert.match(view, /<AbsencesToggle a=\{a\} open=\{open\} onToggle=\{onToggle\} idPrefix="c" \/>/);
  assert.match(view, /aria-expanded=\{open\}/);
  assert.match(view, /<td colSpan=\{9\} id=\{`t-abs-\$\{a\.athleteId\}`\}>/);
  assert.match(view, /View Absences \(\$\{a\.absences\.length\}\)/);
  const css = readFileSync(new URL("./AttendanceReports.module.css", import.meta.url), "utf8");
  assert.match(/\.absToggle \{([^}]*)\}/.exec(css)?.[1] ?? "", /min-height: 44px/);
});
