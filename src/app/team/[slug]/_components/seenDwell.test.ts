import test from "node:test";
import assert from "node:assert/strict";
import { qualifiesAsVisible, createDwellTracker, SEEN_DWELL_MS } from "./seenDwell.ts";

// ── qualifiesAsVisible ───────────────────────────────────────────────────────

test("qualifiesAsVisible: at least 50% area visible qualifies", () => {
  assert.equal(qualifiesAsVisible({ intersectionRatio: 0.5, visibleHeightPx: 10 }), true);
  assert.equal(qualifiesAsVisible({ intersectionRatio: 0.9, visibleHeightPx: 10 }), true);
});

test("qualifiesAsVisible: at least 200px visible height qualifies (tall-card fallback)", () => {
  assert.equal(qualifiesAsVisible({ intersectionRatio: 0.05, visibleHeightPx: 200 }), true);
  assert.equal(qualifiesAsVisible({ intersectionRatio: 0.01, visibleHeightPx: 900 }), true);
});

test("qualifiesAsVisible: below both thresholds does not qualify", () => {
  assert.equal(qualifiesAsVisible({ intersectionRatio: 0.2, visibleHeightPx: 50 }), false);
  assert.equal(qualifiesAsVisible({ intersectionRatio: 0, visibleHeightPx: 0 }), false);
});

// ── createDwellTracker ───────────────────────────────────────────────────────

test("createDwellTracker: fires exactly once after the full dwell duration", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fired = 0;
  const dwell = createDwellTracker(() => { fired++; });

  dwell.update(true);
  t.mock.timers.tick(SEEN_DWELL_MS - 1);
  assert.equal(fired, 0, "must not fire before the full duration");

  t.mock.timers.tick(1);
  assert.equal(fired, 1, "must fire once the full duration elapses");

  // Further updates after firing must never fire again.
  dwell.update(false);
  dwell.update(true);
  t.mock.timers.tick(SEEN_DWELL_MS);
  assert.equal(fired, 1, "must not fire a second time");
});

test("createDwellTracker: dropping below threshold before the full duration cancels it", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fired = 0;
  const dwell = createDwellTracker(() => { fired++; });

  dwell.update(true);
  t.mock.timers.tick(400); // well under SEEN_DWELL_MS — a quick scroll-past
  dwell.update(false);
  t.mock.timers.tick(SEEN_DWELL_MS);
  assert.equal(fired, 0, "a quick scroll-past under the dwell threshold must never fire");
});

test("createDwellTracker: re-entry after a cancel restarts from zero, not resumes", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fired = 0;
  const dwell = createDwellTracker(() => { fired++; });

  dwell.update(true);
  t.mock.timers.tick(700);
  dwell.update(false); // cancel with 700ms already elapsed
  dwell.update(true);  // re-enter
  t.mock.timers.tick(700); // if it had "resumed" from 700ms, this would fire (700+700 > 1000)
  assert.equal(fired, 0, "re-entry must restart the full duration, not resume a partial one");

  t.mock.timers.tick(300); // now at 1000ms since the restart
  assert.equal(fired, 1);
});

test("createDwellTracker: redundant true updates while already running do not restart the timer", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fired = 0;
  const dwell = createDwellTracker(() => { fired++; });

  dwell.update(true);
  t.mock.timers.tick(600);
  dwell.update(true); // still qualifying — must not push the deadline further out
  t.mock.timers.tick(400); // total 1000ms since the original start
  assert.equal(fired, 1);
});

test("createDwellTracker: dispose() before the duration elapses prevents firing", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let fired = 0;
  const dwell = createDwellTracker(() => { fired++; });

  dwell.update(true);
  t.mock.timers.tick(500);
  dwell.dispose();
  t.mock.timers.tick(SEEN_DWELL_MS);
  assert.equal(fired, 0);
});
