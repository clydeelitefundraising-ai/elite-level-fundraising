import test from "node:test";
import assert from "node:assert/strict";
import { resolveRecentDonations, resolveLeaderboardAthletes } from "./campaignPublicDisplay.ts";

const FABRICATED_DONOR_NAMES = ["Robert T.", "Sarah K.", "Mike & Janet L.", "Coach R."];
const FABRICATED_ATHLETE_NAMES = ["Marcus Johnson", "Aaliyah Rivera", "Tyler Chen", "Sofia Martinez", "Devon Williams"];

test("resolveRecentDonations: zero-donation live campaign renders no fake donations", () => {
  assert.deepEqual(resolveRecentDonations([]), []);
});

test("resolveRecentDonations: missing/malformed API field never falls back to fabricated donors", () => {
  for (const bad of [undefined, null, "not an array", 5, {}]) {
    assert.deepEqual(resolveRecentDonations(bad), []);
  }
});

test("resolveRecentDonations: real donation data renders exactly the real entries", () => {
  const real = [
    { name: "Jane D.", amount: 25, message: "Go team!", time: "just now" },
  ];
  assert.deepEqual(resolveRecentDonations(real), real);
});

test("resolveRecentDonations: no hardcoded testimonial donor ever appears in resolved output", () => {
  const inputs: unknown[] = [undefined, null, [], "bad", 0];
  for (const input of inputs) {
    const result = resolveRecentDonations(input);
    const serialized = JSON.stringify(result);
    for (const name of FABRICATED_DONOR_NAMES) {
      assert.ok(!serialized.includes(name), `resolveRecentDonations(${JSON.stringify(input)}) must not contain "${name}"`);
    }
  }
});

test("resolveLeaderboardAthletes: empty roster renders no fake athletes", () => {
  assert.deepEqual(resolveLeaderboardAthletes([]), []);
});

test("resolveLeaderboardAthletes: missing/malformed API field never falls back to fabricated athletes", () => {
  for (const bad of [undefined, null, "not an array", 5, {}]) {
    assert.deepEqual(resolveLeaderboardAthletes(bad), []);
  }
});

test("resolveLeaderboardAthletes: real roster data renders exactly the real athletes", () => {
  const real = [{ id: "abc-123", name: "Test Athlete One", event: null, class_year: "Junior" }];
  assert.deepEqual(resolveLeaderboardAthletes(real), real);
});

test("resolveLeaderboardAthletes: no hardcoded demo athlete ever appears in resolved output", () => {
  const inputs: unknown[] = [undefined, null, [], "bad", 0];
  for (const input of inputs) {
    const result = resolveLeaderboardAthletes(input);
    const serialized = JSON.stringify(result);
    for (const name of FABRICATED_ATHLETE_NAMES) {
      assert.ok(!serialized.includes(name), `resolveLeaderboardAthletes(${JSON.stringify(input)}) must not contain "${name}"`);
    }
  }
});
