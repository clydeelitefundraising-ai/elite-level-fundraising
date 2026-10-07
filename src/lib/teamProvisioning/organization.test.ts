import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// organization.ts imports real (non-type-only) runtime values from
// "@/lib/platform/_client" — needs the shared loader to resolve that alias
// under plain `node --test`, same reason every route test in this repo
// registers it. Only slugifyOrganizationName (pure) is exercised here;
// resolveOrCreateOrganizationId's DB-dependent behavior is covered by the
// /api/team-onboarding/create route tests instead of duplicating a second
// fetch-mock harness for it here.
register(new URL("../testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { slugifyOrganizationName } = await import("./organization.ts");

test("slugifyOrganizationName: lowercases and hyphenates", () => {
  assert.equal(slugifyOrganizationName("Riverside High School"), "riverside-high-school");
});

test("slugifyOrganizationName: collapses punctuation/apostrophes into single hyphens", () => {
  assert.equal(slugifyOrganizationName("St. Mary's Academy"), "st-mary-s-academy");
});

test("slugifyOrganizationName: no leading or trailing hyphens", () => {
  assert.equal(slugifyOrganizationName("  Riverside!!  "), "riverside");
});

test("slugifyOrganizationName: caps length at 80 characters", () => {
  const long = "A".repeat(200);
  assert.ok(slugifyOrganizationName(long).length <= 80);
});
