import test from "node:test";
import assert from "node:assert/strict";
import { dispatchPush, type PushDispatchInput } from "./pushDispatch.ts";

const INPUT: PushDispatchInput = {
  accountIds: ["acc-1"],
  category: "messages",
  kind: "message",
  ctx: { actorName: "Coach Smith" },
  url: "/team/monroe/messages/thread-1",
};

test("dispatchPush: invokes both APNs and FCM with the same input object", async () => {
  const seen: PushDispatchInput[] = [];
  await dispatchPush(INPUT, {
    apns: async i => { seen.push(i); },
    fcm: async i => { seen.push(i); },
  });
  assert.equal(seen.length, 2);
  assert.ok(seen.every(i => i === INPUT), "the exact same input reaches both providers (contract unchanged)");
});

test("dispatchPush: an APNs rejection does not prevent FCM", async () => {
  let fcmRan = false;
  await assert.doesNotReject(dispatchPush(INPUT, {
    apns: async () => { throw new Error("apns down"); },
    fcm: async () => { fcmRan = true; },
  }));
  assert.equal(fcmRan, true);
});

test("dispatchPush: an FCM rejection does not prevent APNs", async () => {
  let apnsRan = false;
  await assert.doesNotReject(dispatchPush(INPUT, {
    apns: async () => { apnsRan = true; },
    fcm: async () => { throw new Error("fcm down"); },
  }));
  assert.equal(apnsRan, true);
});

test("dispatchPush: a SYNCHRONOUS throw in one provider still lets the other run and never rejects", async () => {
  let fcmRan = false;
  await assert.doesNotReject(dispatchPush(INPUT, {
    apns: () => { throw new Error("sync boom"); },
    fcm: async () => { fcmRan = true; },
  }));
  assert.equal(fcmRan, true);
});

test("dispatchPush: both providers failing still resolves (never propagates into the calling route)", async () => {
  await assert.doesNotReject(dispatchPush(INPUT, {
    apns: async () => { throw new Error("a"); },
    fcm: async () => { throw new Error("b"); },
  }));
});

test("dispatchPush: providers run independently (a slow APNs does not delay FCM starting)", async () => {
  const order: string[] = [];
  await dispatchPush(INPUT, {
    apns: async () => { await new Promise(r => setTimeout(r, 30)); order.push("apns-done"); },
    fcm: async () => { order.push("fcm-done"); },
  });
  assert.deepEqual(order, ["fcm-done", "apns-done"]);
});
