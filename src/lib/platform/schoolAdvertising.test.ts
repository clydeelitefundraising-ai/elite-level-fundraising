import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// schoolAdvertising.ts imports real (non-type-only) runtime values from
// "./_client" (extensionless) — needs the shared loader to resolve that
// under plain `node --test`, same reason communityPartners.test.ts registers
// it. Only the pure id-validation function is exercised here; the DB-backed
// get/set functions are covered by the route test instead.
register(new URL("../testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { isValidOrganizationId } = await import("./schoolAdvertising.ts");

test("isValidOrganizationId: accepts a well-formed UUID", () => {
  assert.equal(isValidOrganizationId("11111111-1111-1111-1111-111111111111"), true);
});

test("isValidOrganizationId: accepts uppercase hex", () => {
  assert.equal(isValidOrganizationId("1A2B3C4D-1A2B-1A2B-1A2B-1A2B3C4D5E6F"), true);
});

test("isValidOrganizationId: rejects a non-UUID string", () => {
  assert.equal(isValidOrganizationId("not-a-uuid"), false);
});

test("isValidOrganizationId: rejects an empty string", () => {
  assert.equal(isValidOrganizationId(""), false);
});

test("isValidOrganizationId: rejects a non-string value", () => {
  assert.equal(isValidOrganizationId(123), false);
  assert.equal(isValidOrganizationId(null), false);
  assert.equal(isValidOrganizationId(undefined), false);
});

test("isValidOrganizationId: rejects a UUID with wrong segment lengths", () => {
  assert.equal(isValidOrganizationId("1111111-1111-1111-1111-111111111111"), false);
});
