// Generates the Team App demo's "twins" of real Team App components whose
// only demo-unsafe parts are imports or browser globals: next/link
// (prefetches real /team routes), next/navigation (real router / URL), a
// sibling that calls the API, or the API/share/print globals themselves.
// Each twin is the real file copied verbatim with ONLY its import lines
// rewritten:
//
//   next/link          → ./DemoLink        (a plain anchor the demo intercepts)
//   next/navigation    → ./demoRouter      (in-demo navigation, no real routes)
//   per-twin swaps     → the demo's own module (usually another twin)
//   relative imports   → the same real modules by absolute path
//
// plus, when the component uses them, ONE added import line:
//
//   import { fetch, navigator, ... } from "./demoGlobals";
//
// which makes those names inside the unchanged component body the demo's
// stand-ins (in-memory API, preview-only share/copy/print, demo history)
// instead of the browser's. So the component bodies — markup, styles,
// logic — are the app's own. teamAppDemoSchedule.test.ts regenerates every
// twin and fails if the committed file differs (re-run this script after
// the real file changes):
//
//   node scripts/marketing/generate-team-app-demo-twins.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = "src/components/marketing/team-app-demo";
const T = "src/app/team/[slug]";
const A = "@/app/team/[slug]";

export const TWINS = [
  // Phase 3 — Calendar, Team roster, Attendance.
  { from: `${T}/calendar/CalendarView.tsx`, to: `${DEMO}/DemoCalendarView.tsx`, swaps: { [`${A}/calendar/ExportMenu`]: "./DemoExportMenu" } },
  { from: `${T}/team/TeamTabs.tsx`, to: `${DEMO}/DemoTeamTabs.tsx` },
  { from: `${T}/team/RosterTabs.tsx`, to: `${DEMO}/DemoRosterTabs.tsx` },
  { from: `${T}/team/AthleteRosterGrid.tsx`, to: `${DEMO}/DemoAthleteRosterGrid.tsx`, swaps: { [`${A}/team/TakeAttendanceLink`]: "./DemoTakeAttendanceLink" } },
  { from: `${T}/team/TakeAttendanceLink.tsx`, to: `${DEMO}/DemoTakeAttendanceLink.tsx` },
  { from: `${T}/attendance/AttendanceScreen.tsx`, to: `${DEMO}/DemoAttendanceScreen.tsx` },

  // Phase 4 — Fundraiser.
  { from: `${T}/fundraiser/FundraiserTabs.tsx`, to: `${DEMO}/DemoFundraiserTabs.tsx` },
  { from: `${T}/fundraiser/FundraiserView.tsx`, to: `${DEMO}/DemoFundraiserView.tsx` },
  { from: `${T}/fundraiser/TeamDashboards.tsx`, to: `${DEMO}/DemoTeamDashboards.tsx`, swaps: { [`${A}/analytics/AnalyticsView`]: "./DemoAnalyticsView" } },
  { from: `${T}/analytics/AnalyticsView.tsx`, to: `${DEMO}/DemoAnalyticsView.tsx`, swaps: { [`${A}/_components/fileDownload`]: "./demoFiles" } },
  { from: `${T}/fundraiser/FollowUpsWorkspaceView.tsx`, to: `${DEMO}/DemoFollowUpsWorkspaceView.tsx`, swaps: { [`${A}/fundraiser/useFollowUpsWorkspace`]: "./useDemoFollowUpsWorkspace", [`${A}/fundraiser/FollowUpModals`]: "./DemoFollowUpModals" } },
  { from: `${T}/fundraiser/useFollowUpsWorkspace.ts`, to: `${DEMO}/useDemoFollowUpsWorkspace.ts`, swaps: { [`${A}/_components/nativeFileShare`]: "./demoFiles" } },
  { from: `${T}/fundraiser/FollowUpModals.tsx`, to: `${DEMO}/DemoFollowUpModals.tsx`, swaps: { [`${A}/fundraiser/useFollowUpsWorkspace`]: "./useDemoFollowUpsWorkspace" } },
  { from: `${T}/fundraiser/CoachShareButton.tsx`, to: `${DEMO}/DemoCoachShareButton.tsx` },
  { from: `${T}/contacts/ContactsView.tsx`, to: `${DEMO}/DemoContactsView.tsx` },

  // Phase 4 — Team: Overview, Staff, To-Do List, athlete profiles.
  { from: `${T}/team/OverviewView.tsx`, to: `${DEMO}/DemoOverviewView.tsx` },
  { from: `${T}/team/TeamStaffRosterView.tsx`, to: `${DEMO}/DemoTeamStaffRosterView.tsx` },
  {
    from: `${T}/team/TodoListView.tsx`, to: `${DEMO}/DemoTodoListView.tsx`,
    swaps: {
      [`${A}/_components/fileDownload`]: "./demoFiles",
      [`${A}/team/ClearanceView`]: "./DemoClearanceView",
      [`${A}/team/TaskFormModal`]: "./DemoTaskFormModal",
      [`${A}/team/TaskAcknowledgment`]: "./DemoTaskAcknowledgment",
      [`${A}/team/TaskCompletionView`]: "./DemoTaskCompletionView",
    },
  },
  { from: `${T}/team/ClearanceView.tsx`, to: `${DEMO}/DemoClearanceView.tsx`, swaps: { [`${A}/_components/fileDownload`]: "./demoFiles" } },
  { from: `${T}/team/TaskFormModal.tsx`, to: `${DEMO}/DemoTaskFormModal.tsx` },
  { from: `${T}/team/TaskAcknowledgment.tsx`, to: `${DEMO}/DemoTaskAcknowledgment.tsx` },
  { from: `${T}/team/TaskCompletionView.tsx`, to: `${DEMO}/DemoTaskCompletionView.tsx`, swaps: { [`${A}/team/ReportDownloadButton`]: "./DemoReportDownloadButton" } },
  { from: `${T}/team/ReportDownloadButton.tsx`, to: `${DEMO}/DemoReportDownloadButton.tsx`, swaps: { [`${A}/team/reportDownload`]: "./demoReportDownload" } },
  { from: `${T}/team/[id]/CoachAthleteView.tsx`, to: `${DEMO}/DemoCoachAthleteView.tsx`, swaps: { [`${A}/team/[id]/AthleteTaskCompletion`]: "./DemoAthleteTaskCompletion" } },
  { from: `${T}/team/[id]/AthleteTaskCompletion.tsx`, to: `${DEMO}/DemoAthleteTaskCompletion.tsx` },
  { from: `${T}/athlete/[id]/AthleteProfileView.tsx`, to: `${DEMO}/DemoAthleteProfileView.tsx`, swaps: { [`${A}/team/[id]/AthleteTaskCompletion`]: "./DemoAthleteTaskCompletion" } },

  // Phase 4 — Shop and Partners.
  { from: `${T}/shop/ShopView.tsx`, to: `${DEMO}/DemoShopView.tsx` },
  { from: `${T}/sponsors/PartnersView.tsx`, to: `${DEMO}/DemoPartnersView.tsx`, swaps: { [`${A}/sponsors/SponsorsView`]: "./DemoSponsorsView" } },
  { from: `${T}/sponsors/SponsorsView.tsx`, to: `${DEMO}/DemoSponsorsView.tsx` },
];

const GLOBAL_SWAPS = { "next/link": "./DemoLink", "next/navigation": "./demoRouter" };

/** Browser globals a twin may use, answered by ./demoGlobals instead. */
export const DEMO_GLOBALS = ["fetch", "navigator", "confirm", "alert", "window"];

const IMPORT_STATEMENT = /^import\s[^;]*?\sfrom\s+["'][^"']+["'];?$|^import\s+["'][^"']+["'];?$/gm;

/** The globals (of DEMO_GLOBALS) a source file's code uses. */
export function globalsUsed(src) {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/^import\s[^;]*?;$/gm, "");
  const used = [];
  if (/(?<![.\w$])fetch\s*\(/.test(code)) used.push("fetch");
  if (/(?<![.\w$])navigator\b/.test(code)) used.push("navigator");
  if (/(?<![.\w$])confirm\s*\(/.test(code)) used.push("confirm");
  if (/(?<![.\w$])alert\s*\(/.test(code)) used.push("alert");
  if (/(?<![.\w$])window\b/.test(code)) used.push("window");
  return used;
}

/** The twin's source for one entry of TWINS, from the real file's text. */
export function generateTwin(twin, realSource) {
  const src = realSource.replace(/\r\n/g, "\n");
  const dir = posix.dirname(twin.from);
  let rewritten = src.replace(/^(import\s[^;]*?\sfrom\s+["'])([^"']+)(["'];?)$/gm, (_m, head, spec, tail) => {
    let s = spec;
    if (s.startsWith(".")) s = "@/" + posix.normalize(posix.join(dir, s)).replace(/^src\//, "").replace(/\.tsx?$/, "");
    s = GLOBAL_SWAPS[s] ?? twin.swaps?.[s] ?? s;
    return head + s + tail;
  });

  const globals = globalsUsed(src);
  if (globals.length) {
    let lastEnd = -1;
    for (const m of rewritten.matchAll(IMPORT_STATEMENT)) lastEnd = m.index + m[0].length;
    const line = `import { ${globals.join(", ")} } from "./demoGlobals";`;
    rewritten = lastEnd < 0
      ? `${line}\n${rewritten}`
      : `${rewritten.slice(0, lastEnd)}\n${line}${rewritten.slice(lastEnd)}`;
  }

  const banner =
    `// GENERATED from ${twin.from} by scripts/marketing/generate-team-app-demo-twins.mjs — do not edit.\n` +
    `// Identical to the real component except its import lines (see that script).\n` +
    (countUndisabledImgs(src) > 0
      ? `/* eslint-disable @next/next/no-img-element -- verbatim copy of the real component, which uses <img> */\n`
      : "");
  const firstLineEnd = rewritten.indexOf("\n") + 1;
  return /^["']use client["'];/.test(rewritten)
    ? rewritten.slice(0, firstLineEnd) + banner + rewritten.slice(firstLineEnd)
    : banner + rewritten;
}

/** <img> elements in the source not already covered by an eslint-disable
 *  comment on the line before (the real file's own suppressions). */
function countUndisabledImgs(src) {
  const lines = src.split("\n");
  let n = 0;
  lines.forEach((l, i) => {
    if (!/<img\b/.test(l)) return;
    const prev = lines.slice(Math.max(0, i - 2), i).join("\n");
    if (!/eslint-disable-next-line @next\/next\/no-img-element/.test(prev)) n++;
  });
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const twin of TWINS) {
    writeFileSync(twin.to, generateTwin(twin, readFileSync(twin.from, "utf8")));
    console.log(`${twin.from} → ${twin.to}`);
  }
}
