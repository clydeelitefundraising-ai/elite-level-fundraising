import test from "node:test";
import assert from "node:assert/strict";
import { buildSeasonOptions, defaultSeasonOption } from "./seasonOptions.ts";

test("buildSeasonOptions: for 2026, returns 2025 through 2029", () => {
  assert.deepEqual(buildSeasonOptions(2026), ["2025", "2026", "2027", "2028", "2029"]);
});

test("buildSeasonOptions: always returns exactly 5 options", () => {
  assert.equal(buildSeasonOptions(2030).length, 5);
});

test("buildSeasonOptions: every value is a four-digit string (O2-compatible format)", () => {
  for (const year of buildSeasonOptions(2026)) {
    assert.match(year, /^\d{4}$/);
  }
});

test("buildSeasonOptions: stays within O2's [2000, 2099] range for any realistic current year", () => {
  // The year-3/+1 window only risks leaving [2000, 2099] at the extreme
  // edges of that range itself (e.g. currentYear=2001 or currentYear=2098)
  // — not for any real "today". Confirms the helper doesn't need its own
  // clamping for realistic input, without changing O2's own bounds.
  const options = buildSeasonOptions(2026).map(Number);
  assert.ok(options.every(y => y >= 2000 && y <= 2099));
});

test("defaultSeasonOption: returns the current year as a string, matching defaultSeasonLabel's convention", () => {
  assert.equal(defaultSeasonOption(2026), "2026");
});

test("defaultSeasonOption: is always included in buildSeasonOptions' own output for the same year", () => {
  const year = 2027;
  assert.ok(buildSeasonOptions(year).includes(defaultSeasonOption(year)));
});
