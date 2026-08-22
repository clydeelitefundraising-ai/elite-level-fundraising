import test from "node:test";
import assert from "node:assert/strict";
import { defaultSeasonLabel } from "./campaignSeason.ts";

// Regression coverage for pilot-hardening P1 #2: a brand-new campaign that
// left Season blank during onboarding showed the literal "2025 Season"
// forever (a hardcoded React useState initial value on the public campaign
// page that was never overwritten, since the fetch only assigns when the
// real value is a non-empty string). defaultSeasonLabel() replaces that
// literal with a value computed from the actual current year.
//
// Dates below use the (year, monthIndex, day) constructor, not ISO date
// strings — "2030-01-01" parses as UTC midnight and would read back as
// Dec 31, 2029 in any timezone behind UTC, which is a test-fixture bug,
// not a real one.

test("defaultSeasonLabel: derives the label from the given date's year", () => {
  assert.equal(defaultSeasonLabel(new Date(2026, 7, 21)), "2026 Season");
  assert.equal(defaultSeasonLabel(new Date(2030, 0, 1)), "2030 Season");
});

test("defaultSeasonLabel: never hardcodes 2025 regardless of input year", () => {
  assert.equal(defaultSeasonLabel(new Date(2025, 0, 1)).startsWith("2025"), true, "2025 itself is a legitimate output when the actual year is 2025");
  assert.notEqual(defaultSeasonLabel(new Date(2027, 5, 15)), "2025 Season");
  assert.notEqual(defaultSeasonLabel(new Date(2030, 5, 15)), "2025 Season");
});

test("defaultSeasonLabel: defaults to the real current year when called with no argument", () => {
  const expectedYear = new Date().getFullYear();
  assert.equal(defaultSeasonLabel(), `${expectedYear} Season`);
});
