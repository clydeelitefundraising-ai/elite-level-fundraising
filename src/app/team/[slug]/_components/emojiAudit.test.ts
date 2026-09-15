// Apple-review UI polish: the ELF Team app's UI used to use hardcoded
// pictographic emoji (🔔👤⚙️🚫🗑️📎🎥📄🏅🔗👋 etc.) as faux-icons instead
// of the lucide-react icon library already used everywhere else (TeamNav,
// DesktopSidebar). This is a static source guard against that
// regression — it scans every .tsx source file under each of ELF_TEAM_ROOTS
// below for genuine pictographic emoji and fails if one reappears in a
// hardcoded string/JSX literal.
//
// ELF_TEAM_ROOTS is every screen a signed-in (or signing-in) ELF Team user
// actually passes through — login/entry, Choose Your Team, add/join team,
// and the full authenticated team app — desktop and mobile alike (the same
// components render both). It deliberately does NOT include src/app/admin,
// src/app/platform-admin, src/app/campaign, or the (marketing) route
// group: those are Elite's internal ops tooling and the public donor
// site — a different audience/product than "ELF Team" (see
// capacitor.config.ts's appName), not screens an Apple reviewer signed in
// as a coach/athlete/parent/booster would ever reach. If a future export
// of the ELF Team app onboards more entry screens, add their root here.
//
// Deliberately narrow to the "real emoji" Unicode ranges (the main
// pictograph blocks, misc symbols, and dingbats) — NOT the broader
// arrow/misc-technical ranges, which is where plain typographic
// characters this app intentionally keeps live (→ used as an inline text
// arrow, ✓/✕ as compact glyphs, etc.). Those are a deliberate design
// choice, not an emoji-as-icon regression, and are excluded by scoping
// only to ranges that are overwhelmingly colorful pictographs.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ELF_TEAM_ROOTS = [
  "src/app/team/[slug]",  // authenticated team app (all roles)
  "src/app/teams",        // Choose Your Team / team selector
  "src/app/join",         // add/join team (legacy compatibility route)
  "src/app/enter-code",   // add/join team (canonical route)
  "src/app/coach-login",  // coach login
  "src/app/login",        // account login
  "src/app/forgot-password",
  "src/app/reset-password",
  "src/app/staff-invite",  // staff invite acceptance (authenticated transition)
].map(root => join(process.cwd(), root));

// U+1F300–1FAFF: the main modern emoji blocks (faces, objects, symbols,
// supplemental symbols/pictographs). U+2600–27BF: misc symbols + dingbats
// (☀️✂️✈️❤️ etc.) — excludes U+2190–21FF (arrows) entirely.
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

// Plain typographic glyphs that happen to fall inside the dingbat range
// but are NOT "emoji used as an icon" — checkmarks/x-marks used as
// compact inline indicators (e.g. a "current team" badge), which this
// app deliberately keeps as-is (see settingsAccess/modalPortals tests'
// own conventions for the same "leave plain symbols alone" rule).
const TYPOGRAPHIC_EXCEPTIONS = new Set(["✓", "✔", "✕", "✖", "✗"]);

// A tiny set of intentionally-kept exceptions, reviewed and approved —
// not "we didn't get to it," but "this one is fine." Empty on purpose:
// every hit found in the original audit was either fixed or was already
// a typographic character outside EMOJI_PATTERN's range. Add an entry
// here (with a comment explaining why) only for a deliberate, reviewed
// exception — never to silence a hit you haven't actually looked at.
const ALLOWED: Record<string, true> = {};

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
}

test("no hardcoded pictographic emoji remain as UI icons anywhere in the ELF Team app (login/entry, Choose Your Team, join, authenticated team UI)", () => {
  const files: string[] = [];
  for (const root of ELF_TEAM_ROOTS) walk(root, files);
  assert.ok(files.length > 50, "sanity check: this should have found a substantial number of .tsx files");

  const offenders: { file: string; line: number; match: string }[] = [];
  for (const file of files) {
    const rel = file.slice(join(process.cwd()).length + 1);
    if (ALLOWED[rel]) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Skip comment-only lines — a comment can legitimately mention an
      // emoji character while explaining history (e.g. "used to be 🔔"),
      // same convention as settingsAccess.test.ts's "Coach Access Only"
      // guard. Only a real code/JSX line is a genuine regression.
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      const matches = [...line.matchAll(EMOJI_PATTERN)].map(m => m[0]).filter(ch => !TYPOGRAPHIC_EXCEPTIONS.has(ch));
      if (matches.length > 0) offenders.push({ file: rel, line: i + 1, match: matches.join(" ") });
    });
  }

  assert.deepEqual(
    offenders, [],
    `Found pictographic emoji used as UI icons — replace with a lucide-react icon:\n${offenders.map(o => `  ${o.file}:${o.line} (${o.match})`).join("\n")}`,
  );
});

// The specific regression QA reported on "Choose Your Team": a medal emoji
// beside the Head Coach role badge, and a lightbulb emoji in the "Need
// another team?" footer. Named separately from the broad scan above so a
// future regression on this exact screen fails with a message that points
// straight at it, not just "some file somewhere."
test("Choose Your Team (TeamsView.tsx) uses lucide-react icons, not medal/lightbulb emoji, for the Head Coach badge and the \"Need another team?\" footer", () => {
  const source = readFileSync(join(process.cwd(), "src/app/teams/TeamsView.tsx"), "utf8");
  assert.ok(!/🏅|💡/.test(source), "medal (🏅) and lightbulb (💡) emoji must not appear in TeamsView.tsx");
  assert.ok(source.includes('import { Footprints, Medal, ClipboardList, Users, Handshake, Star, User, Settings as SettingsIcon, HelpCircle, LogOut, Ban, Clock, School, Lightbulb'), "must import the lucide-react icons that replaced the removed emoji");
  assert.ok(/head_coach:\s*Medal/.test(source), "Head Coach role badge must use the Medal icon");
  assert.ok(source.includes("<Lightbulb"), "the \"Need another team?\" footer must render the Lightbulb icon");
});
