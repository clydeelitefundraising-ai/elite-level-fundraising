// QA fix: the athlete fundraising leaderboard/list used to conditionally
// render an individual "X% of goal" progress bar per row whenever
// entry.goalCents was a positive number. Since goal_cents is only ever
// populated when the coach Add/Edit Athlete form's optional "Fundraising
// Goal" field was actually filled in (reachable for a manually-added
// athlete, or one created by approving an "I don't see my name" join
// request) — and bulk admin-imported rosters never populate that field —
// otherwise-identical rows looked inconsistent purely based on how the
// athlete record was created, not any real difference the leaderboard
// should surface.
//
// This is a static source-level guard — this codebase has no jsdom/React
// Testing Library harness to literally render these components (see
// settingsAccess.test.ts's identical note) — but it still catches the
// exact regression class a future edit could reintroduce: the per-row
// bar/percentage text reappearing in any of the three leaderboard/athlete-
// progress row renderers, regardless of which athlete-creation path
// happens to have left goal_cents set on a given row.
//
// Deliberately does NOT touch (and is not testing) goal_cents itself:
// LeaderboardEntry.goalCents and AthleteProgress.pct/goalCents stay wired
// through exactly as before — only the per-row UI that displayed them is
// gone. The guard below explicitly re-asserts the data plumbing is intact.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const LEADERBOARD_FILES = [
  "src/app/team/[slug]/fundraiser/FundraiserView.tsx",
  "src/app/team/[slug]/fundraiser/page.tsx",
  "src/app/team/[slug]/analytics/AnalyticsView.tsx",
];

for (const file of LEADERBOARD_FILES) {
  test(`${file}: no "% of goal" text — no per-athlete leaderboard row shows an individual progress percentage`, () => {
    const source = read(file);
    assert.ok(!source.includes("% of goal"), `${file} must not render "X% of goal" text on any leaderboard/athlete-progress row`);
  });
}

test("FundraiserView.tsx's LeaderboardSection no longer computes a per-row pct from entry.goalCents (removed, not just hidden)", () => {
  const source = read("src/app/team/[slug]/fundraiser/FundraiserView.tsx");
  assert.ok(!/const pct = entry\.goalCents/.test(source), "the per-row pct computation must be removed from LeaderboardSection");
});

test("fundraiser/page.tsx's inline Team Leaderboard no longer computes a per-row pctEntry from entry.goalCents (removed, not just hidden)", () => {
  const source = read("src/app/team/[slug]/fundraiser/page.tsx");
  assert.ok(!/const pctEntry = entry\.goalCents/.test(source), "the per-row pctEntry computation must be removed from the Team Leaderboard block");
});

test("AnalyticsView.tsx's Athlete Progress card no longer renders a progress bar conditioned on a.pct", () => {
  const source = read("src/app/team/[slug]/analytics/AnalyticsView.tsx");
  assert.ok(!/a\.pct !== null &&/.test(source), "the Athlete Progress card must not conditionally render a bar based on a.pct");
});

// Guard against accidentally deleting the underlying data plumbing while
// removing the UI — goalCents/pct fields, and other display-only features
// (the athlete's own dedicated dashboard card, the TEAM-level goal
// progress bar) are all explicitly out of scope for this fix and must be
// unchanged.
test("LeaderboardEntry.goalCents and buildLeaderboard()'s goalCents assignment are untouched — this was a display-only fix, not a data change", () => {
  const fundraiserView = read("src/app/team/[slug]/fundraiser/FundraiserView.tsx");
  assert.ok(/goalCents:\s*number \| null;/.test(fundraiserView), "LeaderboardEntry must still carry goalCents in its type");

  const page = read("src/app/team/[slug]/fundraiser/page.tsx");
  assert.ok(/goalCents:\s*a\.goal_cents\s*\?\?\s*null,/.test(page), "buildLeaderboard() must still populate goalCents from the athlete row, unchanged");
});

test("the athlete's own dedicated fundraiser dashboard card (AthleteView, a different feature from the leaderboard list) still shows its own progress bar — out of scope for this fix", () => {
  const source = read("src/app/team/[slug]/fundraiser/FundraiserView.tsx");
  assert.ok(source.includes("<ProgressBar pct={pct} color={primary} />"), "AthleteView's own personal progress card must be unchanged");
});

test("the TEAM-level goal progress bar (a different feature from per-athlete rows) still shows \"% funded\" on both the fundraiser page and analytics view — out of scope for this fix", () => {
  const page = read("src/app/team/[slug]/fundraiser/page.tsx");
  assert.ok(page.includes("% funded"), "the team-level funded percentage must be unchanged");

  const analytics = read("src/app/team/[slug]/analytics/AnalyticsView.tsx");
  assert.ok(analytics.includes("% funded"), "the team-level funded percentage in Analytics must be unchanged");
});
