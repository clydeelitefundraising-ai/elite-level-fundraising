// Isolated Team App demo (/preview/team-app): isolation, safety and
// fidelity to the real Team App.
//
//   1. Isolation — walks the demo's whole import graph: only audited app
//      modules, no routing/session/server/database imports, no request or
//      storage APIs, and HomeView.tsx only for its audited pure exports.
//   2. Network guard — the inline guard blocks everything except the
//      page's own static files (run against the stringified script).
//   3. Fidelity — the header/nav/card twins keep the real components'
//      tabs and style declarations; roles are decided by the real helpers.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { runInNewContext } from "node:vm";
import { buildQuickActions } from "../../../app/team/[slug]/home/coachDashboardHelpers.ts";
import { isHeadCoach, isStaff, shouldShowFundraisingNav } from "../../../lib/permissions.ts";
import { isAnnouncementVisibleToActor } from "../../../lib/announcementVisibility.ts";
import { DEMO_ACTORS, DEMO_FUNDRAISER, DEMO_ROSTER, DEMO_SLUG, DEMO_TEAM, JORDAN_ELLIS_ID, buildDemoAnnouncements, buildDemoUpcoming, isVisibleToDemoRole } from "./demoData.ts";
import { DEMO_ROLES, DEMO_TAB_IDS, demoTabForHref } from "./demoProtocol.ts";
import { DEMO_NETWORK_GUARD_SCRIPT, DEMO_STATIC_PREFIXES, installDemoNetworkGuard } from "./networkGuard.ts";
import { SAMPLE_ATHLETES, SAMPLE_CAMPAIGN, SAMPLE_NOTICE } from "../demo/fixtures.ts";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const DEMO_DIR = "src/components/marketing/team-app-demo";
const PAGE = "src/app/preview/team-app/page.tsx";
const SIMULATOR = "src/components/marketing/demo/TeamAppSimulator.tsx";
const HOME_VIEW = "src/app/team/[slug]/home/HomeView.tsx";
const UPDATE_CARD = "src/app/team/[slug]/files/UpdateCard.tsx";
const UPDATES_WORKSPACE = "src/app/team/[slug]/files/useUpdatesWorkspace.ts";
const CALENDAR_WORKSPACE = "src/app/team/[slug]/calendar/useCalendarWorkspace.ts";

// ── 1. Isolation ────────────────────────────────────────────────────────────

/** Runtime (non-type-only) import specifiers of a source file. */
function runtimeImports(src: string): { spec: string; names: string[] }[] {
  const out: { spec: string; names: string[] }[] = [];
  for (const m of src.matchAll(/^\s*import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm)) {
    const clause = m[1];
    const names = [...(clause.match(/\{([\s\S]*?)\}/)?.[1] ?? "").split(",")]
      .map((n) => n.trim()).filter((n) => n && !n.startsWith("type "))
      .map((n) => n.split(/\s+as\s+/)[0]);
    if (/^\s*[A-Za-z_$][\w$]*\s*(,|$)/.test(clause)) names.push("default");
    if (/\*\s+as\s+/.test(clause)) names.push("*");
    out.push({ spec: m[2], names });
  }
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["'];?/gm)) out.push({ spec: m[1], names: [] });
  return out;
}

function resolve(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join("src", spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(fromFile), spec);
  else return null; // package
  base = base.replace(/\\/g, "/");
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(join(ROOT, cand)) && !/\/$/.test(cand) && /\.(tsx?|css)$/.test(cand)) return cand;
  }
  return null;
}

// App modules the demo may load at runtime, each audited for this use.
// HomeView.tsx, UpdateCard.tsx and useUpdatesWorkspace.ts are NOT walked
// as a whole (they post, like, comment, track seen and upload through the
// API) — only the named, audited pure exports may be used.
const AUDITED_APP_MODULES = new Set([
  "src/app/team/[slug]/home/coachDashboardHelpers.ts",
  "src/app/team/[slug]/home/Home.module.css",
  "src/app/team/[slug]/_components/CoachBar.tsx",
  "src/app/team/[slug]/_components/SeasonStatus.tsx",
  "src/app/team/[slug]/_components/EventDetailsModal.tsx",
  "src/app/team/[slug]/_components/Modal.tsx",
  "src/app/team/[slug]/_components/ElfMark.tsx",
  "src/app/team/[slug]/messages/_shared/Avatar.tsx",
  "src/app/team/[slug]/messages/_shared/participantDisplay.ts",
  "src/app/team/[slug]/messages/_shared/groupMessaging.ts",
  "src/app/team/[slug]/files/AnnouncementFormModal.tsx",
  // Phase 3 — Calendar, Team roster, Attendance.
  "src/app/team/[slug]/calendar/MonthView.tsx",
  "src/app/team/[slug]/calendar/AgendaList.tsx",
  "src/app/team/[slug]/calendar/DateGroupCard.tsx",
  "src/app/team/[slug]/calendar/EventFormModal.tsx",
  "src/app/team/[slug]/team/rosterHelpers.ts",
  "src/app/team/[slug]/team/GradeTabs.tsx",
  "src/app/team/[slug]/team/Team.module.css",
  "src/app/team/[slug]/team/takeAttendance.ts",
  "src/app/team/[slug]/team/[id]/AthleteAttendanceCard.tsx",
  "src/app/team/[slug]/attendance/attendanceEditor.ts",
  "src/app/team/[slug]/attendance/attendanceFormat.ts",
  "src/app/team/[slug]/attendance/AttendanceRow.tsx",
  "src/app/team/[slug]/attendance/AttendancePanels.tsx",
  "src/app/team/[slug]/attendance/Attendance.module.css",
  "src/lib/teamAttendance.ts",
  "src/lib/teamAttendanceDraft.ts",
  "src/lib/teamAttendanceActor.ts",
  "src/lib/teamTaskCompletion.ts",
  "src/lib/teamTaskAcks.ts",
  "src/lib/athleteAttendance.ts",
  "src/lib/athleteAccess.ts",
  "src/lib/athleteClass.ts",
  "src/lib/permissions.ts",
  "src/lib/theme/teamTheme.ts",
  "src/lib/theme/contrast.ts",
  "src/lib/calendarShared.ts",
  "src/lib/teamJoinQr.ts",
  "src/lib/seasonState.ts",
  "src/components/marketing/demo/fixtures.ts",
  // Phase 4 — Fundraiser, Team (Overview, Staff, To-Do), Shop, Partners.
  // Presentation and pure helpers only; the components that call the API
  // are generated twins whose fetch is the demo's (demoGlobals.ts).
  "src/app/team/[slug]/fundraiser/CampaignOverviewCard.tsx",
  "src/app/team/[slug]/fundraiser/DashboardParts.tsx",
  "src/app/team/[slug]/fundraiser/DesktopFollowUpsView.tsx",
  "src/app/team/[slug]/fundraiser/FollowUpsView.tsx",
  "src/app/team/[slug]/fundraiser/PrintFollowUpsReport.tsx",
  "src/app/team/[slug]/fundraiser/Fundraiser.module.css",
  "src/app/team/[slug]/fundraiser/coachShare.ts",
  "src/app/team/[slug]/fundraiser/followUpsFormat.ts",
  "src/app/team/[slug]/fundraiser/fundraiserData.ts",
  "src/app/team/[slug]/fundraiser/fundraiserFormat.ts",
  "src/app/team/[slug]/fundraiser/fundraiserHelpers.ts",
  "src/app/team/[slug]/sponsors/CommunityPartnersListView.tsx",
  "src/app/team/[slug]/sponsors/partnersTabs.ts",
  "src/app/team/[slug]/team/Overview.module.css",
  "src/app/team/[slug]/team/completionView.ts",
  "src/components/communityPartners/CommunityPartnerSlots.tsx",
  "src/components/communityPartners/CommunityPartnerSlots.module.css",
  "src/lib/platform/communityPartnerSlots.ts",
  "src/lib/donationAttribution.ts",
  "src/lib/followUps.ts",
  "src/lib/fundraiserAccess.ts",
  "src/lib/shareCopy.ts",
  "src/lib/teamOverview.ts",
  "src/lib/teamShellSettings.ts",
  "src/lib/teamTaskCompletionCsv.ts",
  "src/lib/teamTasks.ts",
]);
const HOME_VIEW_EXPORTS = new Set(["CATEGORY_STYLE", "relativeTime", "UpcomingEventRow", "MobileActivityRow", "RequestsEntryCard", "FundraiserSnapshot"]);
const SYMBOL_AUDITED: Record<string, Set<string>> = {
  [HOME_VIEW]: HOME_VIEW_EXPORTS,
  [UPDATE_CARD]: new Set(["CATEGORY_STYLE", "FILE_STYLE", "FILTER_CHIPS", "SectionLabel", "formatSize"]),
  [UPDATES_WORKSPACE]: new Set(["BLANK_UPDATE_FORM", "SCOPE_LABELS", "SCOPE_OPTIONS"]),
  [CALENDAR_WORKSPACE]: new Set(["BLANK_EVENT_FORM", "eventFormFromRow"]),
};
const ALLOWED_PACKAGES = new Set(["react", "react-dom", "lucide-react", "next"]);

const ENTRY_FILES = [PAGE, SIMULATOR, ...["TeamAppDemo.tsx", "DemoChrome.tsx", "DemoHome.tsx", "DemoComms.tsx", "DemoUpdates.tsx", "DemoMessages.tsx", "commsData.ts", "demoData.ts", "demoProtocol.ts", "networkGuard.ts", "DemoCalendar.tsx", "DemoExportMenu.tsx", "DemoTeam.tsx", "DemoAttendance.tsx", "attendanceData.ts", "demoRouter.tsx", "DemoLink.tsx", "NextPhase.tsx"].map((f) => `${DEMO_DIR}/${f}`)];

function walkDemoGraph() {
  const seen = new Set<string>();
  const symbolNames: Record<string, Set<string>> = Object.fromEntries(Object.keys(SYMBOL_AUDITED).map((k) => [k, new Set<string>()]));
  const problems: string[] = [];
  const queue = [...ENTRY_FILES];
  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith(".css")) continue;
    for (const { spec, names } of runtimeImports(read(file))) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (!ALLOWED_PACKAGES.has(pkg) || /^next\/(link|navigation|headers|router|server)/.test(spec)) problems.push(`${file} imports ${spec}`);
        if (spec === "next" && names.length) problems.push(`${file} imports runtime values from next`);
        continue;
      }
      const target = resolve(file, spec);
      if (!target) { problems.push(`${file}: cannot resolve ${spec}`); continue; }
      if (SYMBOL_AUDITED[target]) { names.forEach((n) => symbolNames[target].add(n)); continue; }
      const own = target.startsWith(`${DEMO_DIR}/`) || target === PAGE || target === SIMULATOR;
      if (!own && !AUDITED_APP_MODULES.has(target)) { problems.push(`${file} imports unaudited ${target}`); continue; }
      queue.push(target);
    }
  }
  return { seen, symbolNames, homeViewNames: symbolNames[HOME_VIEW], problems };
}

test("isolation: the demo only loads its own files, audited app modules and audited HomeView exports", () => {
  const { seen, homeViewNames, problems } = walkDemoGraph();
  assert.deepEqual(problems, []);
  assert.ok(seen.has(`${DEMO_DIR}/DemoHome.tsx`) && seen.has("src/lib/permissions.ts"), "graph was walked");
  for (const [file, names] of Object.entries(walkDemoGraph().symbolNames)) {
    for (const n of names) assert.ok(SYMBOL_AUDITED[file].has(n), `unaudited ${file} export ${n}`);
    assert.ok(names.size > 0, `${file} is used`);
  }
  assert.ok(homeViewNames.size > 0);
});

test("isolation: nothing the demo loads can make a request, use storage, route, or touch a session", () => {
  const { seen } = walkDemoGraph();
  for (const f of seen) {
    if (f.endsWith(".css")) continue;
    const src = code(read(f));
    // A generated twin's fetch / navigator / confirm / alert / window are the
    // demo's (one import from ./demoGlobals shadows the browser's in that
    // module), so the real component body can stay unchanged.
    const shadowed = new Set((src.match(/^import \{ ([^}]+) \} from "\.\/demoGlobals";$/m)?.[1] ?? "").split(", ").filter(Boolean));
    if (f === `${DEMO_DIR}/demoGlobals.ts` || f === `${DEMO_DIR}/demoFiles.ts` || f === `${DEMO_DIR}/demoReportDownload.ts`) {
      ["fetch", "navigator", "confirm", "alert", "window"].forEach((n) => shadowed.add(n));
      if (f !== `${DEMO_DIR}/demoGlobals.ts`) assert.match(src, /import \{[^}]*\bfetch\b[^}]*\} from "\.\/demoGlobals";/);
    }
    if (f !== `${DEMO_DIR}/networkGuard.ts`) {
      if (!shadowed.has("fetch")) assert.ok(!/\bfetch\(/.test(src), `${f} can make a request`);
      assert.ok(!/XMLHttpRequest|sendBeacon|new WebSocket|EventSource|globalThis\.fetch|window\.fetch/.test(src), `${f} can make a request`);
    }
    if (!shadowed.has("navigator")) assert.ok(!/navigator\.(clipboard|share)/.test(src), `${f} shares or copies`);
    if (!shadowed.has("confirm")) assert.ok(!/(?<![.\w])confirm\(/.test(src), `${f} opens a dialog`);
    if (!shadowed.has("alert")) assert.ok(!/(?<![.\w])alert\(/.test(src), `${f} opens a dialog`);
    if (!shadowed.has("window") && f !== `${DEMO_DIR}/networkGuard.ts`) assert.ok(!/window\.(print|open|history|location\.href\s*=)/.test(src), `${f} prints, opens or navigates`);
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src), `${f} touches browser storage`);
    assert.ok(!/useSeenTracker|usePathname/.test(src), `${f} routes or tracks`);
    // Router hooks only ever come from the demo's own stand-in (in-demo
    // navigation); the import walk above already forbids next/navigation.
    if (/\buse(Router|SearchParams)\(/.test(src) && f !== `${DEMO_DIR}/demoRouter.tsx`) {
      assert.match(read(f), /from "\.\/demoRouter"/, `${f} uses a router that isn't the demo's`);
    }
    assert.ok(!/process\.env\.(?!NEXT_PUBLIC_)/.test(src), `${f} reads a server environment variable`);
  }
});

/** Source of one top-level `export function Name(` / `export const Name` in a file. */
function exportSource(src: string, name: string): string {
  const start = src.search(new RegExp(`^export (function|const) ${name}\\b`, "m"));
  assert.ok(start >= 0, `export ${name} not found`);
  const rest = src.slice(start);
  const end = rest.slice(1).search(/^(export |function |const |type |\/\/ ──)/m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test("isolation: the HomeView exports the demo reuses are pure presentation (no API, storage or tracking)", () => {
  const src = read(HOME_VIEW);
  for (const name of HOME_VIEW_EXPORTS) {
    const body = code(exportSource(src, name));
    assert.ok(!/fetch\(|localStorage|useSeenTracker|useEffect|useRouter|Link\b/.test(body), `${name} has a side effect`);
  }
  // The real AnnouncementCard marks updates seen through the API — which
  // is why the demo uses a twin, and why it must never be imported.
  assert.match(src, /function AnnouncementCard[\s\S]*?useSeenTracker\(cardRef/);
  assert.ok(!/export function AnnouncementCard/.test(src));
});

test("isolation: the export-only HomeView change touches nothing but the export keywords", () => {
  const src = read(HOME_VIEW);
  for (const n of ["MobileActivityRow", "RequestsEntryCard", "FundraiserSnapshot"]) {
    assert.match(src, new RegExp(`^export function ${n}\\(`, "m"));
  }
  // HomeContent (the real Home) still renders them exactly as before.
  assert.match(src, /<FundraiserSnapshot\s+slug=\{slug\}\s+raisedCents=\{raisedCents\}/);
  assert.match(src, /\{isHeadCoachViewer && <RequestsEntryCard slug=\{slug\} count=\{pendingRequestCount\} \/>\}/);
  assert.match(src, /<MobileActivityRow key=\{a\.id\} a=\{a\} \/>/);
});

test("isolation: every link and form in the demo is intercepted and messages are same-origin only", () => {
  const demo = code(read(`${DEMO_DIR}/TeamAppDemo.tsx`));
  assert.match(demo, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(demo, /document\.addEventListener\("auxclick", onClick, true\)/);
  assert.match(demo, /document\.addEventListener\("submit", onSubmit, true\)/);
  assert.match(demo, /e\.preventDefault\(\);\s*const href = a\.getAttribute\("href"\) \?\? "";\s*navigate\(href\);/);
  assert.match(demo, /if \(e\.origin !== window\.location\.origin\) return;/);
  assert.match(demo, /window\.parent\.postMessage\(msg, window\.location\.origin\)/);
  const sim = code(read(SIMULATOR));
  assert.match(sim, /e\.origin !== window\.location\.origin \|\| e\.source !== frame\.current\?\.contentWindow/);
  assert.match(sim, /postMessage\(msg, window\.location\.origin\)/);
  assert.ok(!/\bfetch\(|localStorage|sessionStorage/.test(sim));

  assert.equal(demoTabForHref(`/team/${DEMO_SLUG}/home`), "home");
  assert.equal(demoTabForHref(`/team/${DEMO_SLUG}/messages`), "communications");
  assert.equal(demoTabForHref(`/team/${DEMO_SLUG}/communications?tab=updates`), "communications");
  assert.equal(demoTabForHref(`/team/${DEMO_SLUG}/fundraiser`), "fundraiser");
  assert.equal(demoTabForHref(`/team/${DEMO_SLUG}/requests`), null);
  assert.equal(demoTabForHref(`/team/${DEMO_SLUG}/notifications`), null);
  assert.equal(demoTabForHref("https://www.google.com/maps/dir/?api=1"), null);
});

test("the demo page: never indexed, guard first, sample notice when opened on its own", () => {
  const page = read(PAGE);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /<>\s*<script dangerouslySetInnerHTML=\{\{ __html: DEMO_NETWORK_GUARD_SCRIPT \}\} \/>/);
  assert.match(page, /\{!embedded && \([\s\S]*?SAMPLE_NOTICE/);
  assert.match(read("src/app/robots.ts"), /"\/preview"/);
  assert.ok(!read("src/app/sitemap.ts").includes("/preview"));
});

// ── 2. Network guard ────────────────────────────────────────────────────────

function fakeWindow(origin = "https://elf.example") {
  const calls: string[] = [];
  const win = {
    location: { origin, href: `${origin}/preview/team-app?role=coach` },
    fetch: async (input: unknown) => { calls.push(String(typeof input === "string" ? input : (input as { url: string }).url)); return "ok"; },
    XMLHttpRequest: class { open() {} send() { calls.push("xhr"); } },
    navigator: { sendBeacon: () => true },
    WebSocket: class {},
    EventSource: class {},
    console: { warn: () => {} },
    open: () => ({}),
    listeners: {} as Record<string, (e: { target?: unknown; preventDefault: () => void }) => void>,
    document: undefined as unknown,
    URL,
    __ELF_DEMO_BLOCKED__: undefined as string[] | undefined,
  };
  win.document = { addEventListener: (type: string, fn: (e: { target?: unknown; preventDefault: () => void }) => void, capture: boolean) => { assert.equal(capture, true); win.listeners[type] = fn; } };
  return { win, calls };
}

test("network guard (as the inline script): blocks API, app routes, other origins, writes, beacons and sockets", async () => {
  const { win, calls } = fakeWindow();
  runInNewContext(DEMO_NETWORK_GUARD_SCRIPT, { window: win, URL, Promise, TypeError, String });
  // Static files of the page itself load normally.
  assert.equal(await win.fetch("/_next/static/chunks/app.js"), "ok");
  assert.equal(await win.fetch("https://elf.example/marketing/demo/sunridge-comets-logo.svg"), "ok");
  // Everything else is refused.
  for (const url of ["/api/team/sunridge-valley-football-demo/announcements", "/team/x/home", "/preview/team-app?_rsc=1", "https://api.example.com/_next/static/x.js", "https://mzsvbxosoidwhntpjdkf.supabase.co/rest/v1/x"]) {
    await assert.rejects(win.fetch(url), TypeError, url);
  }
  await assert.rejects(win.fetch("/_next/static/x.js", { method: "POST" }), TypeError);
  await assert.rejects(win.fetch({ url: "/api/x", method: "GET" } as unknown as string), TypeError);
  const xhr = new win.XMLHttpRequest() as unknown as { open: (m: string, u: string) => void; send: () => void };
  xhr.open("POST", "/api/team/x/messages");
  assert.throws(() => xhr.send(), TypeError);
  assert.equal(win.navigator.sendBeacon("/api/x"), false);
  assert.throws(() => new (win.WebSocket as unknown as new (u: string) => unknown)("wss://x"), TypeError);
  assert.throws(() => new (win.EventSource as unknown as new (u: string) => unknown)("/api/stream"), TypeError);
  assert.deepEqual(calls, ["/_next/static/chunks/app.js", "https://elf.example/marketing/demo/sunridge-comets-logo.svg"]);
  assert.equal(win.__ELF_DEMO_BLOCKED__!.length, 11);
});

test("guard: before hydration, no link click, middle-click or form submit can navigate, and window.open is refused", () => {
  const { win } = fakeWindow();
  runInNewContext(DEMO_NETWORK_GUARD_SCRIPT, { window: win, URL, Promise, TypeError, String });
  const fire = (type: string, target: unknown) => { let prevented = false; win.listeners[type]({ target, preventDefault: () => { prevented = true; } }); return prevented; };
  const insideLink = { closest: (sel: string) => (sel === "a[href]" ? { href: "/team/x/home" } : null) };
  const plain = { closest: () => null };
  assert.equal(fire("click", insideLink), true);
  assert.equal(fire("auxclick", insideLink), true);
  assert.equal(fire("click", plain), false, "ordinary buttons keep working");
  assert.equal(fire("submit", plain), true);
  assert.equal((win.open as (u: string) => unknown)("https://example.com"), null);
  assert.ok(win.__ELF_DEMO_BLOCKED__!.some((b) => b.startsWith("window.open")));
});

test("network guard: the inlined allow-list matches the exported one", () => {
  const { win } = fakeWindow();
  installDemoNetworkGuard(win);
  assert.match(DEMO_NETWORK_GUARD_SCRIPT, new RegExp(DEMO_STATIC_PREFIXES.map((p) => `"${p.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`).join(",\\s*")));
});

// ── 3. Fidelity: roles ──────────────────────────────────────────────────────

test("roles: the real permission helpers decide what each demo role sees", () => {
  const labels = (r: (typeof DEMO_ROLES)[number]) => buildQuickActions(DEMO_SLUG, DEMO_ACTORS[r]).map((a) => a.label);
  assert.deepEqual(labels("coach"), ["Post Announcement", "Add Event", "Send Message", "Manage Team"]);
  assert.deepEqual(labels("athlete"), ["Send Message", "Manage Team"]);
  assert.deepEqual(labels("parent"), ["Send Message", "Manage Team"]);
  assert.deepEqual(DEMO_ROLES.map((r) => isHeadCoach(DEMO_ACTORS[r])), [true, false, false], "Requests card: head coach only");
  assert.deepEqual(DEMO_ROLES.map((r) => isStaff(DEMO_ACTORS[r])), [true, false, false], "Post / Edit: staff only");
  for (const r of DEMO_ROLES) assert.equal(shouldShowFundraisingNav(true, DEMO_ACTORS[r]), true, "fundraising is on for the demo team");
});

test("roles: announcement audiences follow the app's own visibility rule", () => {
  const all = buildDemoAnnouncements(new Date("2026-10-30T20:00:00Z"));
  const titles = (r: (typeof DEMO_ROLES)[number]) => all.filter((a) => isVisibleToDemoRole(a, r)).map((a) => a.title);
  // The demo's restated rule agrees with the app's own, for every scope.
  for (const scope of ["everyone", "athletes", "parents", "boosters", "athlete_specific"] as const) {
    for (const athleteId of [JORDAN_ELLIS_ID, "someone-else"]) {
      const a = { ...all[0], recipient_scope: scope, recipient_athlete_id: scope === "athlete_specific" ? athleteId : null };
      for (const r of DEMO_ROLES) assert.equal(isVisibleToDemoRole(a, r), isAnnouncementVisibleToActor(a, DEMO_ACTORS[r]), `${scope}/${athleteId}/${r}`);
    }
  }
  assert.equal(titles("coach").length, all.length);
  assert.ok(titles("athlete").some((t) => t.startsWith("Athletes:")) && !titles("athlete").some((t) => t.startsWith("Parents:")));
  assert.ok(titles("parent").some((t) => t.startsWith("Parents:")) && !titles("parent").some((t) => t.startsWith("Athletes:")));
  assert.equal(all.filter((a) => a.priority === "pinned").length, 1);
  // author_role is stored as the label (announcements/route.ts: author_role: authorRole = staffRoleLabel(...)).
  assert.match(read("src/app/api/team/[slug]/announcements/route.ts"), /const authorRole\s+= actor\.kind === "platform_admin" \? platformAdminRoleLabel\(\) : staffRoleLabel\(actor\.session\.role\);/);
  assert.ok(all.every((a) => a.author_role === "Head Coach"));
});

test("roles: the demo shell shows the bell to members only and Partners to every signed-in role, like layout.tsx", () => {
  const demo = read(`${DEMO_DIR}/TeamAppDemo.tsx`);
  assert.match(demo, /isMember=\{actor\.kind === "member"\}/);
  assert.match(demo, /<DemoTeamNav\s+active=\{activeNav\}\s+showSponsors\s+showFundraiser=\{shouldShowFundraisingNav\(true, actor\)\}/);
  const layout = read("src/app/team/[slug]/layout.tsx");
  assert.match(layout, /showBell=\{isMember\}/);
  assert.match(layout, /showSponsors=\{isAuthenticated\}/);
});

// ── 3. Fidelity: chrome and cards ───────────────────────────────────────────

const tabsOf = (src: string) => [...src.matchAll(/\{ href: "([^"]+)",\s*label: "([^"]+)",\s*icon: (\w+)/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}`);

test("bottom nav: the same seven destinations, order, labels and icons as the real TeamNav", () => {
  const real = tabsOf(read("src/app/team/[slug]/_components/TeamNav.tsx"));
  const demo = tabsOf(read(`${DEMO_DIR}/DemoChrome.tsx`));
  assert.equal(real.length, 7);
  assert.deepEqual(demo, real);
  assert.deepEqual(demo.map((t) => t.split("|")[0]), DEMO_TAB_IDS);
});

/** Normalized `prop: value` declarations from every style={{ … }} in a source. */
function styleDecls(src: string): Set<string> {
  const out = new Set<string>();
  let i = 0;
  while ((i = src.indexOf("style={{", i)) >= 0) {
    let depth = 0, j = i + 7;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    const body = src.slice(i + 8, j);
    for (const m of body.matchAll(/([A-Za-z]+):\s*((?:[^,{}()]|\([^()]*\)|\{[^{}]*\})+?)\s*(?=,|$|\n)/g)) {
      out.add(`${m[1]}: ${m[2].replace(/\s+/g, " ").trim()}`);
    }
    i = j;
  }
  return out;
}
const minus = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

test("header twin: every declaration matches the real TeamHeader, NotificationBell and AccountMenu trigger", () => {
  const C = "src/app/team/[slug]/_components";
  const real = new Set([...styleDecls(read(`${C}/TeamHeader.tsx`)), ...styleDecls(read(`${C}/NotificationBell.tsx`)), ...styleDecls(read(`${C}/AccountMenu.tsx`))]);
  const demo = styleDecls(exportSource(read(`${DEMO_DIR}/DemoChrome.tsx`), "DemoTeamHeader"));
  // The trigger's ternaries collapse to their no-photo, light-header branch.
  const collapsed = new Set(["background: \"var(--surface-light-elevated)\"", "border: \"1.5px solid var(--border-app)\"", "color: \"var(--text-primary-app)\""]);
  assert.deepEqual(minus(demo, new Set([...real, ...collapsed])), []);
  // Nothing from the real header's own markup is missing (the initials
  // fallback for a team without a logo and the signed-out settings link
  // don't apply to the demo team).
  const header = styleDecls(read(`${C}/TeamHeader.tsx`));
  const notApplicable = new Set(["fontSize: \".95rem\"", "opacity: .75", "padding: \".3rem\"", "lineHeight: 1", "display: \"flex\"", "textDecoration: \"none\"", "borderRadius: \".4rem\"", "fontWeight: 800", "justifyContent: \"center\"", "width: 44", "height: 44", "background: \"var(--surface-light-elevated)\""]);
  assert.deepEqual(minus(header, new Set([...demo, ...notApplicable])), []);
});

test("nav twin: identical style declarations to the real TeamNav (including the unread badge)", () => {
  const real = styleDecls(read("src/app/team/[slug]/_components/TeamNav.tsx"));
  const demo = styleDecls(exportSource(read(`${DEMO_DIR}/DemoChrome.tsx`), "DemoTeamNav"));
  assert.deepEqual(minus(real, demo), []);
  assert.deepEqual(minus(demo, real), []);
});

test("announcement card twin: the real card's declarations, minus only the attachment link", () => {
  const realSrc = read(HOME_VIEW);
  const realCard = realSrc.slice(realSrc.indexOf("function AnnouncementCard("), realSrc.indexOf("export function UpcomingEventRow"));
  const demoSrc = read(`${DEMO_DIR}/DemoHome.tsx`);
  const demoCard = demoSrc.slice(demoSrc.indexOf("function DemoAnnouncementCard("));
  const attachment = styleDecls(realCard.slice(realCard.indexOf("{att && ("), realCard.indexOf("{canEdit && (")));
  const realDecls = styleDecls(realCard);
  const demoDecls = styleDecls(demoCard);
  assert.deepEqual(minus(demoDecls, realDecls), []);
  assert.deepEqual(minus(new Set(minus(realDecls, demoDecls)), attachment), []);
});

test("quick actions twin: same tile markup as the real QuickActions, plain anchors instead of next/link", () => {
  const real = read("src/app/team/[slug]/home/QuickActions.tsx");
  const demo = read(`${DEMO_DIR}/DemoHome.tsx`);
  assert.match(real, /className=\{`elf-surface-card elf-focus-ring \$\{styles\.actionTile\}`\}/);
  assert.match(demo, /className=\{`elf-surface-card elf-focus-ring \$\{homeStyles\.actionTile\}`\}/);
  const iconLine = /<Icon aria-hidden="true" size=\{22\} strokeWidth=\{2\} color="var\(--team-primary\)" className=\{\w+\.actionIcon\} \/>/;
  assert.match(real, iconLine);
  assert.match(demo, iconLine);
  const labelLine = /<span style=\{\{ fontWeight: 700, fontSize: "var\(--text-sm\)", color: "var\(--text-primary-app\)" \}\}>\{action\.label\}<\/span>/;
  assert.match(real, labelLine);
  assert.match(demo, labelLine);
});

test("home: the real HomeContent's module order and headings", () => {
  const order = (src: string, marks: string[]) => marks.map((m) => { const i = src.indexOf(m); assert.ok(i >= 0, m); return i; });
  const marks = ["<FundraiserSnapshot", "Quick Actions", "<RequestsEntryCard", "Next Up", "Team Update", "Team Communications", "View all updates →", "Recent Activity"];
  const real = read(HOME_VIEW);
  const realHome = code(real.slice(real.indexOf("function HomeContent(")));
  const demo = code(read(`${DEMO_DIR}/DemoHome.tsx`));
  const ri = order(realHome, marks);
  const di = order(demo, marks);
  assert.deepEqual([...ri].sort((a, b) => a - b), ri, "real order");
  assert.deepEqual([...di].sort((a, b) => a - b), di, "demo follows the same order");
  // No greeting, no personal fundraising card on Home, nothing the app lacks.
  assert.ok(!/Good (morning|afternoon|evening)|My fundraising|Donate|RSVP/i.test(code(demo)));
});

// ── Data ────────────────────────────────────────────────────────────────────

test("data: Next Up always has upcoming events, soonest first, on every day of the week", () => {
  for (let d = 0; d < 7; d++) {
    const today = new Date(2026, 10, 2 + d, 9, 0);
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const ev = buildDemoUpcoming(today);
    assert.ok(ev.length >= 3, `day ${d}`);
    assert.ok(ev.every((e) => e.event_date >= iso));
    assert.deepEqual(ev.map((e) => e.event_date), [...ev.map((e) => e.event_date)].sort());
    assert.ok(ev.every((e) => ["practice", "meet", "fundraiser", "team"].includes(e.type)));
  }
});

test("data: the fictional Sunridge program — same people, totals and crest as the other samples, no real records", () => {
  assert.equal(DEMO_TEAM.schoolName, "Sunridge Valley High School");
  assert.equal(DEMO_FUNDRAISER.raisedCents, SAMPLE_CAMPAIGN.raised * 100);
  assert.equal(DEMO_FUNDRAISER.goalCents, SAMPLE_CAMPAIGN.goal * 100);
  assert.deepEqual(DEMO_ROSTER.map((a) => a.name), SAMPLE_ATHLETES.map((a) => a.name));
  assert.ok(existsSync(join(ROOT, "public", DEMO_TEAM.logoUrl)));
  assert.notEqual(DEMO_SLUG, "sunridge-valley-football-2027", "never the QA team's slug");
  const src = code(read(`${DEMO_DIR}/demoData.ts`));
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(src), "no email addresses");
  assert.ok(!/https?:\/\//.test(src), "no URLs");
  assert.match(read(SIMULATOR), /SAMPLE_NOTICE/);
  assert.ok(SAMPLE_NOTICE.includes("fictional"));
});
