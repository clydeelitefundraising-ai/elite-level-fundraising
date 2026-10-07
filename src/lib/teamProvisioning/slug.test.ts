import test from "node:test";
import assert from "node:assert/strict";
import { generateCampaignSlug, isValidCampaignSlugFormat, CAMPAIGN_SLUG_RE, MIN_CAMPAIGN_SLUG_LENGTH } from "./slug.ts";

// Phase O2 — this module is a byte-identical extraction of the slug logic
// that previously lived only inside NewCampaignWizard.tsx. These tests
// lock in the exact same behavior that logic already had in production
// (filler-word stripping, hyphen joining, 60-char cap) so both the legacy
// admin flow and the new self-service flow stay provably in sync.

test("generateCampaignSlug: joins school-sport-year with hyphens", () => {
  assert.equal(generateCampaignSlug("Riverside", "Track", "2026"), "riverside-track-2026");
});

test("generateCampaignSlug: strips common filler words from the school name", () => {
  assert.equal(generateCampaignSlug("Riverside High School", "Football", "2026"), "riverside-football-2026");
});

test("generateCampaignSlug: strips gendered/level filler words from the sport name", () => {
  assert.equal(generateCampaignSlug("Riverside", "Boys Varsity Soccer", "2026"), "riverside-soccer-2026");
});

test("generateCampaignSlug: non-alphanumeric characters become hyphens, collapsed", () => {
  assert.equal(generateCampaignSlug("St. Mary's Academy", "Track & Field", "2026"), "st-mary-s-track-field-2026");
});

test("generateCampaignSlug: empty parts are dropped, not left as empty segments", () => {
  assert.equal(generateCampaignSlug("Riverside", "", "2026"), "riverside-2026");
});

test("generateCampaignSlug: result is capped at 60 characters", () => {
  const slug = generateCampaignSlug(
    "A Very Long School Name That Goes On And On And On High School",
    "Championship Track And Field Program",
    "2026",
  );
  assert.ok(slug.length <= 60);
});

test("generateCampaignSlug: never ends in a trailing hyphen even after truncation", () => {
  const slug = generateCampaignSlug("A".repeat(60), "B".repeat(60), "2026");
  assert.equal(slug.endsWith("-"), false);
});

test("isValidCampaignSlugFormat: accepts a well-formed slug", () => {
  assert.equal(isValidCampaignSlugFormat("riverside-track-2026"), true);
});

test("isValidCampaignSlugFormat: rejects anything shorter than the minimum length", () => {
  assert.equal(isValidCampaignSlugFormat("ab"), false);
  assert.equal("ab".length < MIN_CAMPAIGN_SLUG_LENGTH, true);
});

test("isValidCampaignSlugFormat: rejects a slug starting with a hyphen", () => {
  assert.equal(isValidCampaignSlugFormat("-riverside"), false);
});

test("isValidCampaignSlugFormat: rejects uppercase and other disallowed characters", () => {
  assert.equal(isValidCampaignSlugFormat("Riverside"), false);
  assert.equal(isValidCampaignSlugFormat("riverside_track"), false);
});

test("CAMPAIGN_SLUG_RE matches the exact format every existing slug-accepting route already enforces", () => {
  assert.equal(CAMPAIGN_SLUG_RE.test("riverside-track-2026"), true);
  assert.equal(CAMPAIGN_SLUG_RE.test(""), false);
});
