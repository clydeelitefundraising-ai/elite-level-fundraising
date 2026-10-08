import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 2.1 correction — ELF Community Partners became the default tab at
// /team/[slug]/sponsors, so Home's existing "Our Sponsors" links must
// point at ?tab=team to keep landing users directly on Team Sponsors, not
// the new default. No rendering harness exists in this repo (established
// pattern — see TeamNav.test.ts/deprecatedTeamAppRoutes.test.ts), so this
// asserts directly on the real source text of both Home files.
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("HomeView.tsx: both 'Our Sponsors' links point at /sponsors?tab=team", () => {
  const src = read("src/app/team/[slug]/home/HomeView.tsx");
  const matches = [...src.matchAll(/\/team\/\$\{slug\}\/sponsors(\?tab=team)?/g)];
  assert.ok(matches.length >= 2, "expected at least the 'View All' link and the per-sponsor fallback href");
  for (const m of matches) {
    assert.ok(m[0].endsWith("?tab=team"), `expected "${m[0]}" to end with ?tab=team`);
  }
});

test("CoachDashboard.tsx: both 'Our Sponsors' links point at /sponsors?tab=team", () => {
  const src = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  const matches = [...src.matchAll(/\/team\/\$\{slug\}\/sponsors(\?tab=team)?/g)];
  assert.ok(matches.length >= 2, "expected at least the 'View All' link and the per-sponsor fallback href");
  for (const m of matches) {
    assert.ok(m[0].endsWith("?tab=team"), `expected "${m[0]}" to end with ?tab=team`);
  }
});
