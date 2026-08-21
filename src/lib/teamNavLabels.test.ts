import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regression coverage for pilot-hardening P1 #4: manual QA at 390px found
// the bottom-nav "Communications" label CSS-ellipsis-truncated to
// "Communi…" (it's the longest of the six/seven tab labels and the tab's
// flex width can't fit it at small phone widths with the row's fixed
// .6rem font size). Fixed by shortening just the tab label to "Comms" —
// the page itself is still titled "Communications" elsewhere.

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("bottom nav: no tab label is long enough to ellipsis-truncate at narrow widths", () => {
  const src = read("src/app/team/[slug]/_components/TeamNav.tsx");
  const labelMatches = [...src.matchAll(/label:\s*"([^"]+)"/g)].map(m => m[1]);
  assert.ok(labelMatches.length >= 6, "expected to find the nav's tab labels");
  for (const label of labelMatches) {
    // "Fundraising" (11 chars) was already the longest label that rendered
    // without truncating in manual QA — anything longer is a regression risk.
    assert.ok(label.length <= 11, `nav label "${label}" (${label.length} chars) is longer than "Fundraising" and risks truncating again`);
  }
  assert.ok(!labelMatches.includes("Communications"), "the full word \"Communications\" must not be used as a nav-tab label again");
});
