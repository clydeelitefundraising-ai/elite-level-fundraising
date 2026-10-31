// Generates the Team App demo's "twins" of real Team App components whose
// only demo-unsafe part is an import: next/link (prefetches real /team
// routes), next/navigation (real router / URL), or a sibling that calls the
// API (ExportMenu, TakeAttendanceLink). Each twin is the real file copied
// verbatim with ONLY its import lines rewritten:
//
//   next/link          → ./DemoLink        (a plain anchor the demo intercepts)
//   next/navigation    → ./demoRouter      (in-demo navigation, no real routes)
//   per-twin swaps     → the demo's own module
//   relative imports   → the same real modules by absolute path
//
// so the component bodies — markup, styles, logic — are the app's own.
// teamAppDemoSchedule.test.ts regenerates every twin and fails if the
// committed file differs (re-run this script after the real file changes):
//
//   node scripts/marketing/generate-team-app-demo-twins.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = "src/components/marketing/team-app-demo";
const T = "src/app/team/[slug]";

export const TWINS = [
  { from: `${T}/calendar/CalendarView.tsx`, to: `${DEMO}/DemoCalendarView.tsx`, swaps: { "@/app/team/[slug]/calendar/ExportMenu": "./DemoExportMenu" } },
  { from: `${T}/team/TeamTabs.tsx`, to: `${DEMO}/DemoTeamTabs.tsx` },
  { from: `${T}/team/RosterTabs.tsx`, to: `${DEMO}/DemoRosterTabs.tsx` },
  { from: `${T}/team/AthleteRosterGrid.tsx`, to: `${DEMO}/DemoAthleteRosterGrid.tsx`, swaps: { "@/app/team/[slug]/team/TakeAttendanceLink": "./DemoTakeAttendanceLink" } },
  { from: `${T}/team/TakeAttendanceLink.tsx`, to: `${DEMO}/DemoTakeAttendanceLink.tsx` },
  { from: `${T}/attendance/AttendanceScreen.tsx`, to: `${DEMO}/DemoAttendanceScreen.tsx` },
];

const GLOBAL_SWAPS = { "next/link": "./DemoLink", "next/navigation": "./demoRouter" };

/** The twin's source for one entry of TWINS, from the real file's text. */
export function generateTwin(twin, realSource) {
  const src = realSource.replace(/\r\n/g, "\n");
  const dir = posix.dirname(twin.from);
  const rewritten = src.replace(/^(import\s[^;]*?\sfrom\s+["'])([^"']+)(["'];?)$/gm, (_m, head, spec, tail) => {
    let s = spec;
    if (s.startsWith(".")) s = "@/" + posix.normalize(posix.join(dir, s)).replace(/^src\//, "").replace(/\.tsx?$/, "");
    s = GLOBAL_SWAPS[s] ?? twin.swaps?.[s] ?? s;
    return head + s + tail;
  });
  const banner =
    `// GENERATED from ${twin.from} by scripts/marketing/generate-team-app-demo-twins.mjs — do not edit.\n` +
    `// Identical to the real component except its import lines (see that script).\n` +
    (/<img\b/.test(src) ? `/* eslint-disable @next/next/no-img-element -- verbatim copy of the real component, which uses <img> */\n` : "");
  const firstLineEnd = rewritten.indexOf("\n") + 1;
  return rewritten.startsWith('"use client";')
    ? rewritten.slice(0, firstLineEnd) + banner + rewritten.slice(firstLineEnd)
    : banner + rewritten;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const twin of TWINS) {
    writeFileSync(twin.to, generateTwin(twin, readFileSync(twin.from, "utf8")));
    console.log(`${twin.from} → ${twin.to}`);
  }
}
