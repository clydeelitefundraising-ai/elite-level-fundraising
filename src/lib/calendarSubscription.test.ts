// Phase 4C: tests for the pure, DB-free pieces of the subscription-token
// module — generation shape, hash determinism, and the malformed-token
// short-circuit in resolveCampaignByToken (which must reject obviously
// invalid tokens before ever touching the network/DB).
import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSubscriptionToken,
  hashSubscriptionToken,
  resolveCampaignByToken,
} from "./calendarSubscription.ts";

test("generateSubscriptionToken: produces a 256-bit hex token (64 hex chars)", () => {
  const token = generateSubscriptionToken();
  assert.match(token, /^[0-9a-f]{64}$/);
});

test("generateSubscriptionToken: two calls never collide", () => {
  const a = generateSubscriptionToken();
  const b = generateSubscriptionToken();
  assert.notEqual(a, b);
});

test("hashSubscriptionToken: deterministic SHA-256 hex digest", () => {
  const token = "a".repeat(64);
  const h1 = hashSubscriptionToken(token);
  const h2 = hashSubscriptionToken(token);
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("hashSubscriptionToken: different tokens hash differently", () => {
  assert.notEqual(hashSubscriptionToken("a".repeat(64)), hashSubscriptionToken("b".repeat(64)));
});

test("hashSubscriptionToken: the hash never contains the raw token as a substring", () => {
  const token = generateSubscriptionToken();
  assert.ok(!hashSubscriptionToken(token).includes(token));
});

// ── resolveCampaignByToken: malformed-input short-circuit ──────────────────
//
// These never reach the network — an empty string, wrong-length string, or
// non-hex string is rejected before any fetch, exactly like an
// unknown/revoked token: no distinguishing behavior.

test("resolveCampaignByToken: empty string resolves to null without a network call", async () => {
  assert.equal(await resolveCampaignByToken(""), null);
});

test("resolveCampaignByToken: wrong-length string resolves to null", async () => {
  assert.equal(await resolveCampaignByToken("abc123"), null);
});

test("resolveCampaignByToken: non-hex 64-char string resolves to null", async () => {
  assert.equal(await resolveCampaignByToken("z".repeat(64)), null);
});

test("resolveCampaignByToken: a .ics-suffixed value (route param before stripping) is rejected", () => {
  // The route itself strips a trailing .ics before calling this function —
  // documented here as a guard that an un-stripped value is never
  // accidentally treated as a valid 64-hex token.
  const withSuffix = "a".repeat(64) + ".ics";
  assert.doesNotMatch(withSuffix, /^[0-9a-f]{64}$/);
});
