import test from "node:test";
import assert from "node:assert/strict";
import { shareCoachFundraiser } from "./coachShare.ts";

const intent = { title: "Support Coach Owens", text: "Support Coach Owens and Monroe Valley Track & Field this season!", url: "https://app.elitelevelfundraising.com/campaign/monroe-valley?coach=coach-123" };

test("shareCoachFundraiser: uses navigator.share with the exact title/text/url when available", async () => {
  let received: unknown = null;
  const target = {
    share: async (data: typeof intent) => { received = data; },
  };
  const outcome = await shareCoachFundraiser(target, intent);
  assert.equal(outcome, "shared");
  assert.deepEqual(received, intent);
});

test("shareCoachFundraiser: a cancelled native share sheet (rejection) is a no-op, not a fallback to clipboard", async () => {
  let clipboardCalled = false;
  const target = {
    share:     async () => { throw new DOMException("cancelled", "AbortError"); },
    clipboard: { writeText: async () => { clipboardCalled = true; } },
  };
  const outcome = await shareCoachFundraiser(target, intent);
  assert.equal(outcome, "noop");
  assert.equal(clipboardCalled, false);
});

test("shareCoachFundraiser: falls back to copying the URL to the clipboard when navigator.share is unavailable", async () => {
  let copiedText: string | null = null;
  const target = {
    clipboard: { writeText: async (text: string) => { copiedText = text; } },
  };
  const outcome = await shareCoachFundraiser(target, intent);
  assert.equal(outcome, "copied");
  assert.equal(copiedText, intent.url);
});

test("shareCoachFundraiser: neither share nor clipboard available resolves to noop, never throws", async () => {
  const outcome = await shareCoachFundraiser({}, intent);
  assert.equal(outcome, "noop");
});
