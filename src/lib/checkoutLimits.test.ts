import test from "node:test";
import assert from "node:assert/strict";
import { getDonationAmountError, MIN_DONATION_CENTS, MAX_DONATION_CENTS } from "./checkoutLimits.ts";

test("getDonationAmountError: rejects missing/zero/negative/non-numeric amounts", () => {
  assert.equal(getDonationAmountError(undefined), "Minimum donation is $1.");
  assert.equal(getDonationAmountError(null), "Minimum donation is $1.");
  assert.equal(getDonationAmountError(0), "Minimum donation is $1.");
  assert.equal(getDonationAmountError(-500), "Minimum donation is $1.");
  assert.equal(getDonationAmountError("100"), "Minimum donation is $1.");
});

test("getDonationAmountError: rejects below the minimum", () => {
  assert.equal(getDonationAmountError(MIN_DONATION_CENTS - 1), "Minimum donation is $1.");
});

test("getDonationAmountError: accepts exactly the minimum", () => {
  assert.equal(getDonationAmountError(MIN_DONATION_CENTS), null);
});

test("getDonationAmountError: accepts a typical mid-range amount", () => {
  assert.equal(getDonationAmountError(5000), null);
});

test("getDonationAmountError: accepts exactly the maximum", () => {
  assert.equal(getDonationAmountError(MAX_DONATION_CENTS), null);
});

test("getDonationAmountError: rejects above the maximum", () => {
  const err = getDonationAmountError(MAX_DONATION_CENTS + 1);
  assert.match(err ?? "", /Maximum donation is \$10,000/);
});

test("getDonationAmountError: rejects an obviously fat-fingered extra zero", () => {
  const err = getDonationAmountError(MAX_DONATION_CENTS * 10);
  assert.match(err ?? "", /Maximum donation/);
});
