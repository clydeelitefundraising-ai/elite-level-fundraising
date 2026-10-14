import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isAthleteFundraisingVisible } from "../../../../lib/fundraiserAccess.ts";

// Bug fix — Home Screen Fundraiser/Team Progress card visibility.
//
// isAthleteFundraisingVisible's own correctness (active/disabled/archived/
// legacy-absent/missing-settings precedence) is already exhaustively
// covered by fundraiserAccess.test.ts — this file does not duplicate that.
// What's specific to THIS fix, and not covered anywhere else:
//   1. page.tsx reuses that exact function (no new "active" definition)
//      and threads its result to HomeView as `hasActiveFundraiser`.
//   2. HomeView.tsx (mobile) and CoachDashboard.tsx (desktop) both gate
//      their fundraiser card on that prop, not on raisedCents.
//   3. CoachDashboard's grid drops the "fundraising" row entirely when
//      hidden, rather than leaving a blank reserved area next to Quick
//      Actions.
//   4. raised-amount is structurally incapable of influencing visibility,
//      since isAthleteFundraisingVisible's own type never accepts it.
//
// No component-rendering harness exists in this repo (established
// pattern — see noTeamSponsorsOnHome.test.ts / featuredPartnerPlacement.
// test.ts) — these assert on real source text and structural facts.

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function stripLineComments(src: string): string {
  return src.replace(/\/\/.*$/gm, "");
}

// ── 1. page.tsx wiring ──────────────────────────────────────────────────

test("home/page.tsx: hasActiveFundraiser is computed via isAthleteFundraisingVisible(settings), reusing the existing Phase 1.2 definition", () => {
  const src = stripLineComments(read("src/app/team/[slug]/home/page.tsx"));
  assert.ok(src.includes("import { isAthleteFundraisingVisible } from \"@/lib/fundraiserAccess\";"), "page.tsx must import the existing Phase 1.2 helper, not invent a new eligibility check");
  assert.ok(/hasActiveFundraiser\s*=\s*isAthleteFundraisingVisible\(settings\)/.test(src), "hasActiveFundraiser must be derived directly from isAthleteFundraisingVisible(settings)");
  const callCount = (src.match(/isAthleteFundraisingVisible\(/g) ?? []).length;
  assert.equal(callCount, 1, "isAthleteFundraisingVisible must be called exactly once per request — computed once and threaded through, never recomputed per component");
});

test("home/page.tsx: hasActiveFundraiser is threaded through to <HomeView>", () => {
  const src = stripLineComments(read("src/app/team/[slug]/home/page.tsx"));
  assert.ok(/hasActiveFundraiser=\{hasActiveFundraiser\}/.test(src), "the resolved hasActiveFundraiser must be passed as a prop to <HomeView>");
});

test("home/page.tsx: hasActiveFundraiser is derived from the per-request `settings` fetch, not any module-level or cached value", () => {
  const src = read("src/app/team/[slug]/home/page.tsx");
  // settings comes from the Promise.all'd getCampaignSettings(slug) call inside
  // the same async function body — confirms per-team/per-request resolution
  // (team switching = a fresh server render for the new slug, same function).
  assert.ok(/const \[.*settings.*\] = await Promise\.all/.test(src.replace(/\n/g, " ")), "settings must come from the per-request Promise.all, proving each team navigation recomputes it fresh");
});

// ── 2. Mobile (HomeView.tsx) gating ─────────────────────────────────────

test("HomeView.tsx: FundraiserSnapshot is only rendered when hasActiveFundraiser is true", () => {
  const src = read("src/app/team/[slug]/home/HomeView.tsx");
  assert.ok(/\{hasActiveFundraiser\s*&&\s*\(\s*<FundraiserSnapshot/.test(src), "FundraiserSnapshot must be gated on hasActiveFundraiser");
});

test("HomeView.tsx: FundraiserSnapshot's own raisedCents/goalCents $0 presentation branch is untouched", () => {
  const src = read("src/app/team/[slug]/home/HomeView.tsx");
  assert.ok(src.includes("const hasRaised = raisedCents > 0;"), "the internal $0-raised presentation logic must be preserved exactly, not folded into the visibility gate");
  assert.ok(src.includes('isStaffViewer ? "Ready to start raising?" : "Fundraising is just getting started."'), "the existing $0-raised copy must be preserved exactly");
});

// ── 3. Desktop (CoachDashboard.tsx) gating ──────────────────────────────

test("CoachDashboard.tsx: FundraisingCard and its .fundraisingArea wrapper are only rendered when hasActiveFundraiser is true", () => {
  const src = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  assert.ok(/\{hasActiveFundraiser\s*&&\s*\(\s*<div className=\{styles\.fundraisingArea\}>/.test(src), "the fundraisingArea wrapper (not just the inner card) must be gated on hasActiveFundraiser, so no empty grid cell is ever mounted");
});

test("CoachDashboard.tsx: FundraisingCard's own raisedCents $0 presentation branch is untouched", () => {
  const src = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  assert.ok(src.includes("const hasRaised = raisedCents > 0;"), "the internal $0-raised presentation logic must be preserved exactly, not folded into the visibility gate");
  assert.ok(src.includes("Ready to start raising?"), "the existing $0-raised staff copy must be preserved exactly");
});

test("CoachDashboard.tsx: the mainGrid className switches to the no-fundraising variant based on hasActiveFundraiser", () => {
  const src = stripLineComments(read("src/app/team/[slug]/home/CoachDashboard.tsx"));
  assert.ok(/hasActiveFundraiser \? styles\.mainGrid : .*styles\.mainGridNoFundraising/.test(src), "the grid wrapper must swap in the no-fundraising layout variant when hasActiveFundraiser is false");
});

// ── 4. Desktop grid template (Home.module.css) ──────────────────────────

test("Home.module.css: a mainGridNoFundraising variant exists and drops the fundraising row at both breakpoints", () => {
  const src = read("src/app/team/[slug]/home/Home.module.css");
  const occurrences = (src.match(/\.mainGridNoFundraising\s*\{/g) ?? []).length;
  assert.equal(occurrences, 2, "mainGridNoFundraising must be defined for both the >=1280px and <1280px templates");

  // Isolate each .mainGridNoFundraising block body and assert neither
  // contains the word "fundraising" as a grid-template-areas token.
  const blocks = [...src.matchAll(/\.mainGridNoFundraising\s*\{([^}]*)\}/g)].map(m => m[1]);
  assert.equal(blocks.length, 2, "expected exactly two mainGridNoFundraising rule bodies");
  for (const block of blocks) {
    assert.ok(!/"[^"]*\bfundraising\b[^"]*"/.test(block), "mainGridNoFundraising must not reserve a fundraising row/area in its grid-template-areas");
    assert.ok(/"[^"]*\bactions\b[^"]*"/.test(block), "mainGridNoFundraising must still place the actions area");
  }
});

test("Home.module.css: the actions area spans the full row width in the >=1280px no-fundraising template", () => {
  const src = read("src/app/team/[slug]/home/Home.module.css");
  assert.ok(/"actions actions"/.test(src), "at >=1280px (two columns), the no-fundraising template must give actions both columns so Quick Actions occupies the full row, not a single orphaned column");
});

// ── 5. Raised amount cannot influence visibility (structural guarantee) ─

test("isAthleteFundraisingVisible's signature structurally cannot accept a raised amount, so a stale/non-zero raisedCents can never leak into the visibility decision", () => {
  // Calling with only the settings shape it declares — if raisedCents were
  // ever part of this decision, it would have to be a parameter here.
  assert.equal(isAthleteFundraisingVisible({ fundraising_enabled: false }), false, "disabled fundraising must hide the card regardless of any raised amount, by construction — this function has no raisedCents parameter to consult");
  assert.equal(isAthleteFundraisingVisible({ archived: true, fundraising_enabled: true }), false, "an archived campaign must hide the card regardless of any raised amount");
});

// ── 6. Unrelated functionality preserved ────────────────────────────────

test("the Community Partners grid, Featured Partner banner, and Team Sponsors removal remain intact and independent of this fix", () => {
  const homeView = read("src/app/team/[slug]/home/HomeView.tsx");
  const coachDashboard = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  assert.ok(homeView.includes("CommunityPartnerGrid"), "HomeView.tsx must still render the Community Partners grid, unmodified by this fix");
  assert.ok(coachDashboard.includes("CommunityPartnerGrid"), "CoachDashboard.tsx must still render the Community Partners grid, unmodified by this fix");
  assert.ok(homeView.includes("FeaturedPartnerBanner") && coachDashboard.includes("FeaturedPartnerBanner"), "the Featured Partner banner must remain, unaffected by this fix");
  assert.ok(!homeView.includes("SponsorsStrip") && !homeView.includes("Our Sponsors"), "Team Sponsors must remain removed from HomeView.tsx");
  assert.ok(!coachDashboard.includes("SponsorsStrip"), "Team Sponsors must remain removed from CoachDashboard.tsx");
});
