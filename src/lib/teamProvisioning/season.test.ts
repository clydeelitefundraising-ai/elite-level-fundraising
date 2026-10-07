import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSelfServiceSeason, MIN_SELF_SERVICE_SEASON_YEAR, MAX_SELF_SERVICE_SEASON_YEAR,
} from "./season.ts";

// Phase O2 correction — canonical season/year validation, SELF-SERVICE
// ONBOARDING ONLY. These tests lock in: exact four-digit-year format
// after trimming, no silent coercion of ambiguous input, and the
// [2000, 2099] range.

test("'2026' is accepted", () => {
  const result = validateSelfServiceSeason("2026");
  assert.equal(result.ok, true);
  assert.equal((result as { ok: true; season: string }).season, "2026");
});

test("'2027' is accepted", () => {
  assert.equal(validateSelfServiceSeason("2027").ok, true);
});

test("' 2027 ' is accepted and normalized (trimmed) to '2027'", () => {
  const result = validateSelfServiceSeason(" 2027 ");
  assert.equal(result.ok, true);
  assert.equal((result as { ok: true; season: string }).season, "2027");
});

test("'26' is rejected (not four digits)", () => {
  assert.equal(validateSelfServiceSeason("26").ok, false);
});

test("'26-27' is rejected", () => {
  assert.equal(validateSelfServiceSeason("26-27").ok, false);
});

test("'2026-27' is rejected", () => {
  assert.equal(validateSelfServiceSeason("2026-27").ok, false);
});

test("'Fall 2026' is rejected, never silently coerced to '2026'", () => {
  assert.equal(validateSelfServiceSeason("Fall 2026").ok, false);
});

test("'Spring 2027' is rejected, never silently coerced to '2027'", () => {
  assert.equal(validateSelfServiceSeason("Spring 2027").ok, false);
});

test("'abcd' is rejected", () => {
  assert.equal(validateSelfServiceSeason("abcd").ok, false);
});

test("'0000' is rejected (outside the allowed calendar-year range)", () => {
  assert.equal(validateSelfServiceSeason("0000").ok, false);
});

test("'9999' is rejected (outside the allowed calendar-year range)", () => {
  assert.equal(validateSelfServiceSeason("9999").ok, false);
});

test("the documented bounds are exactly 2000 and 2099", () => {
  assert.equal(MIN_SELF_SERVICE_SEASON_YEAR, 2000);
  assert.equal(MAX_SELF_SERVICE_SEASON_YEAR, 2099);
  assert.equal(validateSelfServiceSeason(String(MIN_SELF_SERVICE_SEASON_YEAR)).ok, true);
  assert.equal(validateSelfServiceSeason(String(MAX_SELF_SERVICE_SEASON_YEAR)).ok, true);
  assert.equal(validateSelfServiceSeason(String(MIN_SELF_SERVICE_SEASON_YEAR - 1)).ok, false);
  assert.equal(validateSelfServiceSeason(String(MAX_SELF_SERVICE_SEASON_YEAR + 1)).ok, false);
});
