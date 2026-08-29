import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMessages, isOptimisticMessageId, hasNewServerMessages } from "./reconcileMessages.ts";

test("isOptimisticMessageId: true only for the client-generated opt- prefix", () => {
  assert.equal(isOptimisticMessageId("opt-1700000000000"), true);
  assert.equal(isOptimisticMessageId("a1b2c3d4-real-uuid"), false);
  assert.equal(isOptimisticMessageId(""), false);
});

test("reconcileMessages: server list alone, no local optimistic entries — passes through unchanged, order preserved", () => {
  const server = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];
  const result = reconcileMessages(server, server);
  assert.deepEqual(result, server);
});

test("reconcileMessages: a still-pending optimistic entry not yet in the server list is preserved, appended after", () => {
  const server = [{ id: "m1" }];
  const local  = [{ id: "m1" }, { id: "opt-999" }];
  const result = reconcileMessages(server, local);
  assert.deepEqual(result.map(m => m.id), ["m1", "opt-999"]);
});

test("reconcileMessages: an unrelated optimistic id is NOT matched to a same-content real message — it has no way to know they're the same send", () => {
  // This function only ever compares BY ID. An optimistic id
  // ("opt-999") and the real server-assigned id for that same send
  // ("real-123") are different strings — reconcileMessages cannot and
  // does not try to infer they refer to the same logical message.
  // Eliminating that specific duplicate is the job of the SENDER's own
  // POST-response handler (which replaces "opt-999" with "real-123" by
  // id once its request resolves) — reconcileMessages just needs to not
  // duplicate an id that's already resolved on both sides, which this
  // case isn't yet. In ThreadView, the sendingRef gate prevents a
  // poll-triggered refresh from ever reaching this function while
  // this exact client's own send is still in flight, which is what
  // keeps this scenario from occurring in practice for the sender's own
  // message — this test documents the function's actual (narrower)
  // contract, not a claim that it resolves cross-id identity.
  const server = [{ id: "real-123" }];
  const local  = [{ id: "opt-999" }];
  const result = reconcileMessages(server, local);
  assert.deepEqual(result.map(m => m.id), ["real-123", "opt-999"]);
});

test("reconcileMessages: never duplicates a message the server already has, even if it's also (incorrectly) still in local state", () => {
  const server = [{ id: "m1" }, { id: "m2" }];
  const local  = [{ id: "m1" }, { id: "m2" }];
  const result = reconcileMessages(server, local);
  assert.equal(result.length, 2);
});

test("reconcileMessages: multiple still-pending optimistic entries are all preserved", () => {
  const server = [{ id: "m1" }];
  const local  = [{ id: "m1" }, { id: "opt-1" }, { id: "opt-2" }];
  const result = reconcileMessages(server, local);
  assert.deepEqual(result.map(m => m.id), ["m1", "opt-1", "opt-2"]);
});

test("reconcileMessages: empty server list with a pending optimistic entry keeps just the optimistic entry", () => {
  const result = reconcileMessages([], [{ id: "opt-1" }]);
  assert.deepEqual(result.map(m => m.id), ["opt-1"]);
});

test("reconcileMessages: a custom isOptimisticId predicate is respected instead of the default", () => {
  const server = [{ id: "m1" }];
  const local  = [{ id: "m1" }, { id: "draft-abc" }];
  const result = reconcileMessages(server, local, id => id.startsWith("draft-"));
  assert.deepEqual(result.map(m => m.id), ["m1", "draft-abc"]);
});

// ─── Phase 5b: idle-poll read/dispatch suppression ─────────────────────────────

test("hasNewServerMessages: identical set -> false (idle poll must not trigger a read write)", () => {
  const previous = [{ id: "m1" }, { id: "m2" }];
  const incoming = [{ id: "m1" }, { id: "m2" }];
  assert.equal(hasNewServerMessages(previous, incoming), false);
});

test("hasNewServerMessages: same set, different order -> false", () => {
  const previous = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];
  const incoming = [{ id: "m3" }, { id: "m1" }, { id: "m2" }];
  assert.equal(hasNewServerMessages(previous, incoming), false);
});

test("hasNewServerMessages: one genuinely new server message -> true", () => {
  const previous = [{ id: "m1" }];
  const incoming = [{ id: "m1" }, { id: "m2" }];
  assert.equal(hasNewServerMessages(previous, incoming), true);
});

test("hasNewServerMessages: empty previous, empty incoming -> false", () => {
  assert.equal(hasNewServerMessages([], []), false);
});

test("hasNewServerMessages: an optimistic id in `previous` is never mistaken for a previously-seen real message", () => {
  // The viewer has an in-flight optimistic bubble locally; the server's
  // fresh list already contains that same send's REAL id (a different
  // string). This must count as genuinely new — the optimistic id must
  // not be treated as if it already "covers" the real id.
  const previous = [{ id: "m1" }, { id: "opt-999" }];
  const incoming = [{ id: "m1" }, { id: "real-123" }];
  assert.equal(hasNewServerMessages(previous, incoming), true);
});

test("hasNewServerMessages: optimistic-only previous with no matching real server id yet -> false", () => {
  // Nothing genuinely NEW from the server's point of view — the server
  // list is identical to the only real id already known.
  const previous = [{ id: "m1" }, { id: "opt-999" }];
  const incoming = [{ id: "m1" }];
  assert.equal(hasNewServerMessages(previous, incoming), false);
});

test("hasNewServerMessages: a custom isOptimisticId predicate is respected", () => {
  const previous = [{ id: "m1" }, { id: "draft-abc" }];
  const incoming = [{ id: "m1" }];
  assert.equal(hasNewServerMessages(previous, incoming, id => id.startsWith("draft-")), false);
});
