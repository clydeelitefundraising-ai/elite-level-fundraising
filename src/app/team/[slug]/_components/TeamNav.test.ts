import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 2.1 — TeamNav.tsx has no existing rendering-test harness (this
// repo has none, per the established pattern — see
// deprecatedTeamAppRoutes.test.ts/identityCompatibility.test.ts for the
// same source-text-assertion technique) and nothing in it is a pure
// extractable function the way desktopNavItems.ts's buildDesktopNavItems
// is. This asserts directly on the real source: the visible label changed
// to "Partners" while href/route stay "sponsors" — unchanged.
const SOURCE = readFileSync(join(process.cwd(), "src/app/team/[slug]/_components/TeamNav.tsx"), "utf8");

test("TeamNav.tsx: the Partners tab's href stays 'sponsors' — no route change", () => {
  assert.match(SOURCE, /STAFF_TAB:.*=\s*\{\s*href:\s*"sponsors"/);
});

test("TeamNav.tsx: the Partners tab's visible label is 'Partners', not 'Sponsors'", () => {
  assert.match(SOURCE, /STAFF_TAB:.*=\s*\{\s*href:\s*"sponsors",\s*label:\s*"Partners"/);
});
