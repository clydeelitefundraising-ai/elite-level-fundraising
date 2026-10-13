import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 2.2D-3 — structural regression tests for facts that can't be
// unit-tested at the pure-function level (pickFeaturedPartner's own
// fairness/independence is covered directly in
// communityPartnerRotation.test.ts). No rendering harness exists in this
// repo (established pattern — see noTeamSponsorsOnHome.test.ts), so this
// asserts on the real source text, checking structural facts (import
// lines, single call sites) rather than loose substrings.
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

// Comments in this file legitimately mention function names in prose
// (e.g. explaining why a call isn't duplicated) — strip // line comments
// before counting actual call sites, so explanatory text can't inflate
// the count and false-positive the assertion.
function stripLineComments(src: string): string {
  return src.replace(/\/\/.*$/gm, "");
}

test("home/page.tsx: the featured-partner selection is computed exactly once and passed to HomeView", () => {
  const src = stripLineComments(read("src/app/team/[slug]/home/page.tsx"));
  const callCount = (src.match(/pickFeaturedPartner\(/g) ?? []).length;
  assert.equal(callCount, 1, "pickFeaturedPartner must be called exactly once per request — mobile and desktop share this single result, never recompute their own");
  assert.ok(/featuredPartner=\{featuredPartner\}/.test(src), "the resolved featuredPartner must be threaded through to <HomeView>");
});

test("home/page.tsx: the featured-partner query reuses the existing school-advertising lookup, not a duplicate one", () => {
  const src = stripLineComments(read("src/app/team/[slug]/home/page.tsx"));
  const callCount = (src.match(/getSchoolAdvertisingSetting\(/g) ?? []).length;
  assert.equal(callCount, 1, "getSchoolAdvertisingSetting must be called exactly once — shared by the grid and the featured-partner banner, never duplicated");
});

test("HomeView.tsx: FeaturedPartnerBanner is imported and rendered, placed before FundraiserSnapshot in source order", () => {
  const src = read("src/app/team/[slug]/home/HomeView.tsx");
  assert.ok(src.includes("import FeaturedPartnerBanner"), "HomeView.tsx must import FeaturedPartnerBanner");
  const bannerIndex = src.indexOf("<FeaturedPartnerBanner");
  const fundraiserIndex = src.indexOf("<FundraiserSnapshot");
  assert.ok(bannerIndex !== -1, "FeaturedPartnerBanner must be rendered in HomeView.tsx");
  assert.ok(fundraiserIndex !== -1, "FundraiserSnapshot must still be rendered (unmodified) in HomeView.tsx");
  assert.ok(bannerIndex < fundraiserIndex, "the Featured Partner banner must render above Fundraiser Snapshot, per the approved placement decision");
});

test("CoachDashboard.tsx: FeaturedPartnerBanner is imported and rendered, placed before FundraisingCard in source order", () => {
  const src = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  assert.ok(src.includes("import FeaturedPartnerBanner"), "CoachDashboard.tsx must import FeaturedPartnerBanner");
  const bannerIndex = src.indexOf("<FeaturedPartnerBanner");
  const fundraisingCardIndex = src.indexOf("<FundraisingCard");
  assert.ok(bannerIndex !== -1, "FeaturedPartnerBanner must be rendered in CoachDashboard.tsx");
  assert.ok(fundraisingCardIndex !== -1, "FundraisingCard must still be rendered (unmodified) in CoachDashboard.tsx");
  assert.ok(bannerIndex < fundraisingCardIndex, "the Featured Partner banner must render above FundraisingCard, per the approved placement decision");
});

test("Home.module.css: featuredBannerArea is a distinct grid area from fundraising/communityPartners, in both breakpoint templates", () => {
  const src = read("src/app/team/[slug]/home/Home.module.css");
  assert.ok(/\.featuredBannerArea\s*\{[^}]*grid-area:\s*featuredBanner/.test(src), "featuredBannerArea must map to its own grid-area");
  assert.ok(/"featuredBanner featuredBanner"/.test(src), "the desktop (>=1280px) template must include the featuredBanner row");
  assert.ok(/"featuredBanner"\s*\n\s*"fundraising"/.test(src), "the single-column (<1280px) template must place featuredBanner immediately before fundraising");
});

test("FeaturedPartnerBanner.tsx and CommunityPartnerGrid.tsx share no imports or types — fully independent components", () => {
  // Checks real structural facts (import statements, the field name a
  // type would have to carry) — the banner's own code comments
  // legitimately reference CommunityPartnerGrid.tsx by name to explain
  // shared design conventions, which a bare substring check would
  // wrongly flag as a violation.
  const banner = read("src/app/team/[slug]/home/FeaturedPartnerBanner.tsx");
  assert.ok(!/import\s+type\s*\{[^}]*\bGridSlot\b/.test(banner), "FeaturedPartnerBanner.tsx must never import the grid's GridSlot type");
  assert.ok(!banner.includes("locked_position"), "FeaturedPartnerBanner.tsx must have no awareness of locked_position");
  assert.ok(!/import\s+(?:type\s*)?(?:\{[^}]*\})?\s*(?:,\s*)?CommunityPartnerGrid|from\s+["']\.\/CommunityPartnerGrid["']/.test(banner), "FeaturedPartnerBanner.tsx must not import CommunityPartnerGrid");
});

test("the existing Community Partners grid and Team Sponsors separation are both still intact", () => {
  const homeView = read("src/app/team/[slug]/home/HomeView.tsx");
  const coachDashboard = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  // Grid preserved exactly as Phase 2.2D-2 left it.
  assert.ok(homeView.includes("CommunityPartnerGrid"), "HomeView.tsx must still render the Community Partners grid, unmodified by this phase");
  assert.ok(coachDashboard.includes("CommunityPartnerGrid"), "CoachDashboard.tsx must still render the Community Partners grid, unmodified by this phase");
  // Team Sponsors removal (prior phase) must not have been reverted.
  assert.ok(!homeView.includes("SponsorsStrip") && !homeView.includes("Our Sponsors"), "Team Sponsors must remain removed from HomeView.tsx");
  assert.ok(!coachDashboard.includes("SponsorsStrip"), "Team Sponsors must remain removed from CoachDashboard.tsx");
});
