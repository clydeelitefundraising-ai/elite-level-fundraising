import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// fundraisingInquiries.ts imports real (non-type-only) runtime values from
// "./_client" via an extensionless relative specifier, which plain Node ESM
// resolution can't resolve outside the Next build — the same reason every
// route test in this repo registers this loader. Needed here even though
// this file only exercises one pure function with no database access.
register(new URL("../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { isValidInquiryStatusTransition } = await import("./fundraisingInquiries.ts");

// Phase F1d — pure status-transition rule, tested directly (no database):
// new -> contacted/resolved allowed; contacted -> resolved allowed;
// resolved is terminal (no transition allowed, including back to contacted
// or new); same-status "transitions" are also rejected.

test("new -> contacted is allowed", () => {
  assert.equal(isValidInquiryStatusTransition("new", "contacted"), true);
});

test("new -> resolved is allowed", () => {
  assert.equal(isValidInquiryStatusTransition("new", "resolved"), true);
});

test("contacted -> resolved is allowed", () => {
  assert.equal(isValidInquiryStatusTransition("contacted", "resolved"), true);
});

test("resolved -> contacted is rejected (terminal)", () => {
  assert.equal(isValidInquiryStatusTransition("resolved", "contacted"), false);
});

// "resolved -> new" isn't representable in the function's own target type
// (only "contacted" | "resolved" are ever requestable targets — "new" is
// create-only, never a PATCH target) — the type system itself prevents a
// caller from even attempting it. The route-level test suite still proves
// the API rejects a raw "new" in the request body (400, invalid status).

test("resolved -> resolved is rejected (terminal, no-op not allowed)", () => {
  assert.equal(isValidInquiryStatusTransition("resolved", "resolved"), false);
});

test("contacted -> contacted (same-status) is rejected", () => {
  assert.equal(isValidInquiryStatusTransition("contacted", "contacted"), false);
});
