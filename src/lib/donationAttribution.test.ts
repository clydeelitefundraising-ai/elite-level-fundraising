import test from "node:test";
import assert from "node:assert/strict";
import { attributeDonationsToAthletes } from "./donationAttribution.ts";

function athlete(id: string, name: string) {
  return { id, name } as import("./teamData.ts").TeamAthleteRow;
}

function donation(overrides: Partial<import("./supabase.ts").DonationRow>) {
  return {
    id: "d", stripe_session_id: "s", donor_name: "Donor", amount_cents: 1000,
    athlete_name: null, athlete_id: null, donation_message: null, created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  } as import("./supabase.ts").DonationRow;
}

test("attributeDonationsToAthletes: every roster athlete is pre-seeded at zero", () => {
  const athletes = [athlete("a1", "Mason Brooks"), athlete("a2", "Abby Cooper")];
  const result = attributeDonationsToAthletes(athletes, []);
  assert.deepEqual(result.totalsCents, { a1: 0, a2: 0 });
  assert.deepEqual(result.donorCounts, { a1: 0, a2: 0 });
  assert.deepEqual(result.lastDonationAt, { a1: null, a2: null });
});

test("attributeDonationsToAthletes: id-first attribution", () => {
  const athletes = [athlete("a1", "Mason Brooks")];
  const donations = [donation({ athlete_id: "a1", amount_cents: 2500 })];
  const result = attributeDonationsToAthletes(athletes, donations);
  assert.equal(result.totalsCents.a1, 2500);
  assert.equal(result.donorCounts.a1, 1);
});

test("attributeDonationsToAthletes: legacy athlete_name fallback when athlete_id is null", () => {
  const athletes = [athlete("a1", "Mason Brooks")];
  const donations = [donation({ athlete_id: null, athlete_name: "Mason Brooks", amount_cents: 500 })];
  const result = attributeDonationsToAthletes(athletes, donations);
  assert.equal(result.totalsCents.a1, 500);
});

test("attributeDonationsToAthletes: multiple donations accumulate and lastDonationAt keeps the first-seen (donation-order) value", () => {
  const athletes = [athlete("a1", "Mason Brooks")];
  const donations = [
    donation({ athlete_id: "a1", amount_cents: 1000, created_at: "2026-08-01T00:00:00Z" }),
    donation({ athlete_id: "a1", amount_cents: 2000, created_at: "2026-08-05T00:00:00Z" }),
  ];
  const result = attributeDonationsToAthletes(athletes, donations);
  assert.equal(result.totalsCents.a1, 3000);
  assert.equal(result.donorCounts.a1, 2);
  assert.equal(result.lastDonationAt.a1, "2026-08-01T00:00:00Z");
});

test("attributeDonationsToAthletes: a donation with no matching athlete (unknown id, unmatched name) is silently dropped, not thrown", () => {
  const athletes = [athlete("a1", "Mason Brooks")];
  const donations = [
    donation({ athlete_id: "does-not-exist", amount_cents: 999 }),
    donation({ athlete_id: null, athlete_name: "Nobody Here", amount_cents: 999 }),
  ];
  const result = attributeDonationsToAthletes(athletes, donations);
  assert.equal(result.totalsCents.a1, 0);
});

test("attributeDonationsToAthletes: a roster athlete with zero donations remains present at zero (not absent)", () => {
  const athletes = [athlete("a1", "Mason Brooks"), athlete("a2", "Abby Cooper")];
  const donations = [donation({ athlete_id: "a2", amount_cents: 100 })];
  const result = attributeDonationsToAthletes(athletes, donations);
  assert.equal(result.totalsCents.a1, 0);
  assert.equal("a1" in result.totalsCents, true);
});
