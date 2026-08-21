import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentCopyrightYear } from "./copyrightYear.ts";

// Regression coverage for pilot-hardening P1 #3: three public campaign
// footers hardcoded "© 2025 Elite Level Fundraising". currentCopyrightYear()
// is the single dynamic source of truth now used in all of them.

test("currentCopyrightYear: derives the year from the given date", () => {
  // (year, monthIndex, day) constructor — an ISO date-only string like
  // "2031-01-01" parses as UTC midnight and reads back a year early in any
  // timezone behind UTC, which is a test-fixture bug, not a real one.
  assert.equal(currentCopyrightYear(new Date(2026, 7, 21)), 2026);
  assert.equal(currentCopyrightYear(new Date(2031, 0, 1)), 2031);
});

test("currentCopyrightYear: defaults to the real current year when called with no argument", () => {
  assert.equal(currentCopyrightYear(), new Date().getFullYear());
});

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("no public campaign footer hardcodes a literal copyright year", () => {
  for (const file of [
    "src/app/campaign/_shared/CampaignPageClient.tsx",
    "src/app/campaign/_shared/PremiumLayout.tsx",
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /©\s*\d{4}/, `${file} must not hardcode a literal year next to ©`);
    assert.match(src, /currentCopyrightYear\(\)/, `${file} must render the copyright year via currentCopyrightYear()`);
  }
});
