import test from "node:test";
import assert from "node:assert/strict";
import {
  generateResetToken,
  hashResetToken,
  resetTokenExpiresAt,
  hashNormalizedEmail,
} from "./passwordReset.ts";

// Phase A33: password recovery. These lock in the properties the security
// review depends on — sufficient token entropy, hash-only comparisons, a
// short expiry window, and a rate-limit key that never carries a raw email.

test("generateResetToken: produces a 32-byte (64 hex char) token", () => {
  const token = generateResetToken();
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]{64}$/);
});

test("generateResetToken: two calls never collide and are not related to each other", () => {
  const a = generateResetToken();
  const b = generateResetToken();
  assert.notEqual(a, b);
});

test("hashResetToken: deterministic sha256, and the hash is never the raw token", () => {
  const token = "abc123";
  const hash1 = hashResetToken(token);
  const hash2 = hashResetToken(token);
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, token);
  assert.equal(hash1.length, 64); // sha256 hex digest length
});

test("hashResetToken: different tokens hash to different values", () => {
  assert.notEqual(hashResetToken("token-a"), hashResetToken("token-b"));
});

test("resetTokenExpiresAt: expires approximately 1 hour from now, not 24 hours like invite tokens", () => {
  const now       = Date.now();
  const expiresAt = new Date(resetTokenExpiresAt()).getTime();
  const deltaMs   = expiresAt - now;
  const oneHourMs = 60 * 60 * 1000;
  // Allow a small tolerance for test execution time.
  assert.ok(Math.abs(deltaMs - oneHourMs) < 5000, `expected ~1 hour, got ${deltaMs}ms`);
});

test("hashNormalizedEmail: normalizes case and whitespace before hashing", () => {
  assert.equal(
    hashNormalizedEmail("  Coach@Example.com  "),
    hashNormalizedEmail("coach@example.com"),
  );
});

test("hashNormalizedEmail: never returns the raw email itself", () => {
  const email = "coach@example.com";
  const hash  = hashNormalizedEmail(email);
  assert.notEqual(hash, email);
  assert.equal(hash.length, 64);
});

test("hashNormalizedEmail: different emails hash to different values", () => {
  assert.notEqual(hashNormalizedEmail("a@example.com"), hashNormalizedEmail("b@example.com"));
});
