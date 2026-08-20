import test from "node:test";
import assert from "node:assert/strict";
import { createSeenWriteState } from "./seenWriteState.ts";

test("attemptMarkSeen: successful send marks the id as successfully seen", async () => {
  const state = createSeenWriteState();
  let sendCalls = 0;
  await state.attemptMarkSeen("a1", async () => { sendCalls++; return true; });
  assert.equal(sendCalls, 1);
  assert.equal(state.isAlreadyHandled("a1"), true);
});

test("attemptMarkSeen: local dedupe — a second attempt for an already-successful id never sends again", async () => {
  const state = createSeenWriteState();
  let sendCalls = 0;
  const send = async () => { sendCalls++; return true; };

  await state.attemptMarkSeen("a1", send);
  await state.attemptMarkSeen("a1", send); // e.g. re-entering the viewport later in the session
  assert.equal(sendCalls, 1, "must not POST a second time once successfully marked");
});

test("attemptMarkSeen: in-flight guard prevents duplicate simultaneous sends", async () => {
  const state = createSeenWriteState();
  let sendCalls = 0;
  let resolveSend!: (ok: boolean) => void;
  const send = () => {
    sendCalls++;
    return new Promise<boolean>(resolve => { resolveSend = resolve; });
  };

  const first = state.attemptMarkSeen("a1", send);
  // A second dwell-completion firing while the first request is still in
  // flight (e.g. the same card observed from two mounted surfaces) must
  // not start a second request.
  const second = state.attemptMarkSeen("a1", send);

  assert.equal(sendCalls, 1, "a concurrent attempt while one is in flight must not send again");
  resolveSend(true);
  await Promise.all([first, second]);
  assert.equal(state.isAlreadyHandled("a1"), true);
});

test("attemptMarkSeen: a failed send does not permanently mark the id — a later retry can succeed", async () => {
  const state = createSeenWriteState();
  let attempt = 0;
  const send = async () => {
    attempt++;
    return attempt > 1; // fails first time, succeeds on retry
  };

  await state.attemptMarkSeen("a1", send);
  assert.equal(state.isAlreadyHandled("a1"), false, "a failed attempt must not be treated as successfully seen");

  await state.attemptMarkSeen("a1", send); // e.g. a later viewport re-entry
  assert.equal(attempt, 2, "a prior failure must allow a later retry to actually send again");
  assert.equal(state.isAlreadyHandled("a1"), true);
});

test("attemptMarkSeen: a send that throws is treated the same as a failure (no permanent suppression)", async () => {
  const state = createSeenWriteState();
  let attempt = 0;
  const send = async () => {
    attempt++;
    if (attempt === 1) throw new Error("network error");
    return true;
  };

  await state.attemptMarkSeen("a1", send);
  assert.equal(state.isAlreadyHandled("a1"), false);

  await state.attemptMarkSeen("a1", send);
  assert.equal(state.isAlreadyHandled("a1"), true);
});

test("distinct ids are tracked independently", async () => {
  const state = createSeenWriteState();
  await state.attemptMarkSeen("a1", async () => true);
  assert.equal(state.isAlreadyHandled("a1"), true);
  assert.equal(state.isAlreadyHandled("a2"), false);
});
