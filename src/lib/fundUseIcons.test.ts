import test from "node:test";
import assert from "node:assert/strict";
import {
  FUND_USE_ICON_OPTIONS,
  DEFAULT_FUND_USE_ICON_ID,
  normalizeFundUseIconId,
  resolveFundUseIcon,
} from "./fundUseIcons.ts";

test("FUND_USE_ICON_OPTIONS is a curated 15-25 item library with unique ids", () => {
  assert.ok(FUND_USE_ICON_OPTIONS.length >= 15 && FUND_USE_ICON_OPTIONS.length <= 25);
  const ids = FUND_USE_ICON_OPTIONS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("DEFAULT_FUND_USE_ICON_ID is itself a valid option", () => {
  assert.ok(FUND_USE_ICON_OPTIONS.some((o) => o.id === DEFAULT_FUND_USE_ICON_ID));
});

test("normalizeFundUseIconId passes through a modern identifier unchanged", () => {
  assert.equal(normalizeFundUseIconId("plane"), "plane");
  assert.equal(normalizeFundUseIconId("shirt"), "shirt");
});

test("normalizeFundUseIconId maps known legacy emoji to the correct identifier", () => {
  assert.equal(normalizeFundUseIconId("✈️"), "plane");
  assert.equal(normalizeFundUseIconId("🚌"), "bus");
  assert.equal(normalizeFundUseIconId("👟"), "shoe");
  assert.equal(normalizeFundUseIconId("🎽"), "shirt");
  assert.equal(normalizeFundUseIconId("👕"), "shirt");
  assert.equal(normalizeFundUseIconId("🏆"), "trophy");
  assert.equal(normalizeFundUseIconId("🥇"), "medal");
  assert.equal(normalizeFundUseIconId("💪"), "dumbbell");
  assert.equal(normalizeFundUseIconId("🏋️"), "dumbbell");
  assert.equal(normalizeFundUseIconId("🧊"), "snowflake");
  assert.equal(normalizeFundUseIconId("🍽️"), "utensils");
  assert.equal(normalizeFundUseIconId("🍱"), "utensils");
  assert.equal(normalizeFundUseIconId("🏟️"), "building");
  assert.equal(normalizeFundUseIconId("📋"), "clipboard");
  assert.equal(normalizeFundUseIconId("🧢"), "shirt");
  assert.equal(normalizeFundUseIconId("💰"), "coins");
  assert.equal(normalizeFundUseIconId("🎯"), "target");
  assert.equal(normalizeFundUseIconId("📚"), "graduation-cap");
  assert.equal(normalizeFundUseIconId("🛡️"), "shield");
  assert.equal(normalizeFundUseIconId("❤️"), "heart");
});

test("normalizeFundUseIconId maps every ball-sport emoji to the generic activity icon", () => {
  for (const emoji of ["🏃", "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐"]) {
    assert.equal(normalizeFundUseIconId(emoji), "activity");
  }
});

test("normalizeFundUseIconId falls back safely for unknown or missing values", () => {
  assert.equal(normalizeFundUseIconId("🦄"), DEFAULT_FUND_USE_ICON_ID);
  assert.equal(normalizeFundUseIconId(""), DEFAULT_FUND_USE_ICON_ID);
  assert.equal(normalizeFundUseIconId(null), DEFAULT_FUND_USE_ICON_ID);
  assert.equal(normalizeFundUseIconId(undefined), DEFAULT_FUND_USE_ICON_ID);
});

test("resolveFundUseIcon returns a real component for a modern id, a legacy emoji, and an unknown value", () => {
  // lucide-react icons are React.forwardRef components, so typeof is
  // "object" (not "function") — assert truthiness/shape rather than a
  // specific typeof, so this doesn't overfit to lucide's internals.
  for (const value of ["plane", "✈️", "🦄", null]) {
    const Icon = resolveFundUseIcon(value);
    assert.ok(Icon, `resolveFundUseIcon(${JSON.stringify(value)}) should return a truthy component`);
  }
});

test("resolveFundUseIcon resolves a legacy emoji to the same component as its mapped modern id", () => {
  assert.equal(resolveFundUseIcon("✈️"), resolveFundUseIcon("plane"));
  assert.equal(resolveFundUseIcon("🏆"), resolveFundUseIcon("trophy"));
});
