import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase: Home Screen Cleanup — Team Sponsors was deliberately removed
// from the Home Screen (both mobile HomeView.tsx and desktop
// CoachDashboard.tsx); it remains available exclusively on the Partners
// page (/team/[slug]/sponsors?tab=team). No rendering harness exists in
// this repo (established pattern — see the now-deleted
// sponsorsLinks.test.ts, TeamNav.test.ts, deprecatedTeamAppRoutes.test.ts),
// so this asserts directly on the real source text, guarding against the
// section being silently reintroduced by a future edit.
function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

// Checks for real structural facts (an import line, a type field
// declaration, a specific component/class name) rather than loose
// substrings — explanatory prose in this repo's own comments (including
// this cleanup's own commit/comment text) legitimately mentions words
// like "sponsors" or "getTeamSponsors" in passing, which a bare
// `includes()`/broad regex would false-positive on.

test("HomeView.tsx: no SponsorRow import, SponsorRow-typed field, or 'Our Sponsors' heading remain", () => {
  const src = read("src/app/team/[slug]/home/HomeView.tsx");
  assert.ok(!src.includes("Our Sponsors"), "the 'Our Sponsors' Home Screen section heading must not be reintroduced");
  assert.ok(!/import\s+type\s*\{[^}]*\bSponsorRow\b/.test(src), "HomeView.tsx must not import the SponsorRow type");
  assert.ok(!/\bsponsors\??:\s*SponsorRow/.test(src), "no sponsors: SponsorRow[] field should remain in HomeView.tsx");
});

test("CoachDashboard.tsx: no SponsorsStrip, SponsorRow import/field, or 'Our Sponsors' heading remain", () => {
  const src = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  assert.ok(!src.includes("SponsorsStrip"), "the SponsorsStrip component must not be reintroduced");
  assert.ok(!src.includes("Our Sponsors"), "the 'Our Sponsors' Home Screen section heading must not be reintroduced");
  assert.ok(!/import\s+type\s*\{[^}]*\bSponsorRow\b/.test(src), "CoachDashboard.tsx must not import the SponsorRow type");
  assert.ok(!/\bsponsors\??:\s*SponsorRow/.test(src), "no sponsors: SponsorRow[] field should remain in CoachDashboard.tsx");
});

test("Home.module.css: no sponsorsArea class or a standalone sponsors grid-template-areas row remain", () => {
  const src = read("src/app/team/[slug]/home/Home.module.css");
  assert.ok(!/\.sponsorsArea\s*\{/.test(src), "the sponsorsArea CSS class must not be reintroduced");
  // A quoted grid-template-areas row that is exactly "sponsors" or
  // "sponsors sponsors" on its own line — distinct from any comment
  // prose that merely mentions the word, and distinct from
  // "communityPartners", which must remain untouched.
  assert.ok(!/^\s*"sponsors(\s+sponsors)?"\s*$/m.test(src), "no standalone sponsors grid-template-areas row should remain");
});

test("home/page.tsx: getTeamSponsors is no longer imported for the Home Screen", () => {
  const src = read("src/app/team/[slug]/home/page.tsx");
  assert.ok(!/import\s*\{[^}]*\bgetTeamSponsors\b/.test(src), "Home's page.tsx must not import getTeamSponsors anymore");
  assert.ok(!/\bgetTeamSponsors\(/.test(src.replace(/\/\/.*$/gm, "")), "Home's page.tsx must not call getTeamSponsors(...) outside of comments");
});

test("the ELF Community Partners grid area and component are still present (this cleanup must not touch it)", () => {
  const homeView = read("src/app/team/[slug]/home/HomeView.tsx");
  const coachDashboard = read("src/app/team/[slug]/home/CoachDashboard.tsx");
  const css = read("src/app/team/[slug]/home/Home.module.css");
  assert.ok(homeView.includes("CommunityPartnerGrid"), "HomeView.tsx must still render the Community Partners grid");
  assert.ok(coachDashboard.includes("CommunityPartnerGrid"), "CoachDashboard.tsx must still render the Community Partners grid");
  assert.ok(css.includes(".communityPartnersArea"), "the communityPartnersArea CSS class must remain untouched");
});
