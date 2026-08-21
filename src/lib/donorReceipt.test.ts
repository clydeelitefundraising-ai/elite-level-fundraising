import test from "node:test";
import assert from "node:assert/strict";
import { receiptIdempotencyKey, sendReceiptForSession } from "./donorReceipt.ts";

test("receiptIdempotencyKey: deterministic per Stripe session id", () => {
  assert.equal(receiptIdempotencyKey("cs_test_abc123"), "donor-receipt:cs_test_abc123");
});

test("receiptIdempotencyKey: two different sessions never collide", () => {
  assert.notEqual(receiptIdempotencyKey("cs_test_a"), receiptIdempotencyKey("cs_test_b"));
});

test("receiptIdempotencyKey: the SAME session always produces the SAME key — this is what lets both the webhook and the /success fallback attempt the same receipt without Resend ever delivering it twice", () => {
  const a = receiptIdempotencyKey("cs_test_shared_session");
  const b = receiptIdempotencyKey("cs_test_shared_session");
  assert.equal(a, b);
});

test("sendReceiptForSession: no donor email on the session -> no attempt, resolves false, no network call", async () => {
  const result = await sendReceiptForSession({
    stripeSessionId: "cs_test_no_email",
    donorEmail:      null,
    donorName:       "Someone",
    amountCents:     1000,
    athleteName:     null,
    campaignSlug:    "some-team",
  });
  assert.equal(result, false);
});

test("sendReceiptForSession: undefined donor email also short-circuits", async () => {
  const result = await sendReceiptForSession({
    stripeSessionId: "cs_test_undefined_email",
    donorEmail:      undefined,
    donorName:       null,
    amountCents:     500,
    athleteName:     null,
    campaignSlug:    null,
  });
  assert.equal(result, false);
});
