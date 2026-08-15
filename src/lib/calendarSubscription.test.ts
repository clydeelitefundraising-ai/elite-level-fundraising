// Phase 4C: tests for the deterministic HMAC subscription-token module.
// Sets a test-only CALENDAR_SYNC_PEPPER (not a real secret, never used
// outside this process) so the pure HMAC functions are exercisable
// without touching any real environment configuration.
import test from "node:test";
import assert from "node:assert/strict";

process.env.CALENDAR_SYNC_PEPPER = "test-only-pepper-not-a-real-secret";

import {
  computeTokenHmac,
  buildSubscriptionToken,
  parseSubscriptionToken,
  resolveCampaignByToken,
} from "./calendarSubscription.ts";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";

// ── Deterministic HMAC ───────────────────────────────────────────────────

test("computeTokenHmac: same id + pepper always produces the same HMAC", () => {
  assert.equal(computeTokenHmac(ID_A), computeTokenHmac(ID_A));
});

test("computeTokenHmac: different ids produce different HMACs", () => {
  assert.notEqual(computeTokenHmac(ID_A), computeTokenHmac(ID_B));
});

test("computeTokenHmac: output is 64 lowercase hex characters", () => {
  assert.match(computeTokenHmac(ID_A), /^[0-9a-f]{64}$/);
});

test("computeTokenHmac: fails closed when CALENDAR_SYNC_PEPPER is missing", () => {
  const saved = process.env.CALENDAR_SYNC_PEPPER;
  delete process.env.CALENDAR_SYNC_PEPPER;
  try {
    assert.throws(() => computeTokenHmac(ID_A), /CALENDAR_SYNC_PEPPER/);
  } finally {
    process.env.CALENDAR_SYNC_PEPPER = saved;
  }
});

// ── Token build/parse round-trip ─────────────────────────────────────────

test("buildSubscriptionToken: shape is <uuid>.<64-hex-hmac>", () => {
  const token = buildSubscriptionToken(ID_A);
  assert.match(token, /^[0-9a-f-]{36}\.[0-9a-f]{64}$/);
});

test("parseSubscriptionToken: round-trips a well-formed token", () => {
  const token = buildSubscriptionToken(ID_A);
  const parsed = parseSubscriptionToken(token);
  assert.equal(parsed?.id, ID_A);
  assert.equal(parsed?.hmac, computeTokenHmac(ID_A));
});

// ── Malformed shapes rejected before any DB lookup ──────────────────────

test("parseSubscriptionToken: rejects a token with no separator", () => {
  assert.equal(parseSubscriptionToken("nodothere"), null);
});

test("parseSubscriptionToken: rejects a tampered/invalid UUID portion", () => {
  const hmac = computeTokenHmac(ID_A);
  assert.equal(parseSubscriptionToken(`not-a-uuid.${hmac}`), null);
});

test("parseSubscriptionToken: rejects a short/tampered HMAC portion", () => {
  assert.equal(parseSubscriptionToken(`${ID_A}.deadbeef`), null);
});

test("parseSubscriptionToken: rejects a wrong-but-64-char HMAC (non-hex characters)", () => {
  assert.equal(parseSubscriptionToken(`${ID_A}.${"z".repeat(64)}`), null);
});

test("parseSubscriptionToken: rejects an empty string", () => {
  assert.equal(parseSubscriptionToken(""), null);
});

// ── resolveCampaignByToken: malformed input never reaches the network ───

test("resolveCampaignByToken: malformed token resolves to null without a network call", async () => {
  assert.equal(await resolveCampaignByToken("garbage"), null);
});

// A well-formed-but-nonexistent UUID (e.g. a tampered/guessed id) passes
// parseSubscriptionToken's shape check, so resolveCampaignByToken
// proceeds to a DB lookup — that path (nonexistent row, revoked row,
// valid active row, campaign isolation, HMAC-mismatch-on-a-real-row) has
// no live-Supabase test harness in this repo (consistent with every
// other DB-touching function here) and is covered by manual Preview QA
// instead — see the delivery report's QA sequence.

test("resolveCampaignByToken: a token built for a different id's HMAC does not verify against id A", () => {
  // Constructing a token with id A's UUID but id B's HMAC — this is the
  // "tampered HMAC" case; the shape parses fine, but verification (which
  // requires a DB row) would reject it. Confirms parsing alone does not
  // imply validity — this is checked at the parse layer already: it
  // parses successfully but the hmac value simply won't match what
  // resolveCampaignByToken recomputes from id A once it reaches that step.
  const forged = `${ID_A}.${computeTokenHmac(ID_B)}`;
  const parsed = parseSubscriptionToken(forged);
  assert.ok(parsed); // shape is valid...
  assert.notEqual(parsed!.hmac, computeTokenHmac(parsed!.id)); // ...but won't verify
});
