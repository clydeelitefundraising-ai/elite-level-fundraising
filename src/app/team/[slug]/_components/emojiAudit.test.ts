// Apple-review UI polish: the authenticated ELF Team app's UI used to use
// hardcoded pictographic emoji (🔔👤⚙️🚫🗑️📎🎥📄 etc.) as faux-icons
// instead of the lucide-react icon library already used everywhere else
// (TeamNav, DesktopSidebar). This is a static source guard against that
// regression — it scans every .tsx source file under
// src/app/team/[slug]/** for genuine pictographic emoji and fails if one
// reappears in a hardcoded string/JSX literal.
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

const ROOT = join(process.cwd(), "src/app/team/[slug]");

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

test("no hardcoded pictographic emoji remain as UI icons anywhere under the authenticated team app", () => {
  const files: string[] = [];
  walk(ROOT, files);
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
