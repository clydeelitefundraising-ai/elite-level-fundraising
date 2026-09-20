// Exercises the pure overlay-stack logic behind useAndroidBackClose without
// a React renderer (this repo has no jsdom/React Testing Library harness —
// see modalPortals.test.ts for the same constraint). window.addEventListener
// et al only exist inside a real browser/WebView, so a minimal stand-in is
// installed before importing the module under test.
import test from "node:test";
import assert from "node:assert/strict";

type Handler = (...args: unknown[]) => void;
const listeners = new Map<string, Set<Handler>>();

(globalThis as unknown as { window: unknown }).window = {
  addEventListener(type: string, fn: Handler) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(fn);
  },
  removeEventListener(type: string, fn: Handler) {
    listeners.get(type)?.delete(fn);
  },
  __elfHasOpenOverlay: undefined as (() => boolean) | undefined,
};

function fireAndroidBack() {
  for (const fn of listeners.get("elfAndroidBackButton") ?? []) fn();
}

const { registerAndroidBackOverlay } = await import("./useAndroidBackClose.ts");
const win = globalThis as unknown as { window: { __elfHasOpenOverlay?: () => boolean } };

test("registering an overlay makes window.__elfHasOpenOverlay() true, and closing it via elfAndroidBackButton calls onClose", () => {
  let closed = false;
  const unregister = registerAndroidBackOverlay(() => { closed = true; });

  assert.equal(win.window.__elfHasOpenOverlay?.(), true, "overlay should report open once registered");
  fireAndroidBack();
  assert.equal(closed, true, "elfAndroidBackButton must invoke the registered onClose");

  unregister();
  assert.equal(win.window.__elfHasOpenOverlay?.(), false, "overlay should report closed after unregister");
});

test("elfAndroidBackButton closes only the topmost overlay when more than one is registered", () => {
  const closedOrder: string[] = [];
  const unregisterFirst  = registerAndroidBackOverlay(() => closedOrder.push("first"));
  const unregisterSecond = registerAndroidBackOverlay(() => closedOrder.push("second"));

  fireAndroidBack();
  assert.deepEqual(closedOrder, ["second"], "back must close only the most recently registered (topmost) overlay");

  unregisterSecond();
  assert.equal(win.window.__elfHasOpenOverlay?.(), true, "first overlay is still registered after the topmost unregisters");

  fireAndroidBack();
  assert.deepEqual(closedOrder, ["second", "first"], "with the topmost gone, back now closes the next one down");

  unregisterFirst();
  assert.equal(win.window.__elfHasOpenOverlay?.(), false, "no overlays left registered");
});

test("unregister removes exactly its own callback, independent of registration order", () => {
  const closedOrder: string[] = [];
  const unregisterFirst  = registerAndroidBackOverlay(() => closedOrder.push("first"));
  const unregisterSecond = registerAndroidBackOverlay(() => closedOrder.push("second"));

  // Simulates a modal unmounting/closing itself (not via Back) while
  // another overlay is still open underneath it — e.g. a report succeeding
  // and closing its own modal programmatically.
  unregisterFirst();
  assert.equal(win.window.__elfHasOpenOverlay?.(), true, "second overlay is unaffected by the first's cleanup");

  fireAndroidBack();
  assert.deepEqual(closedOrder, ["second"], "remaining overlay still receives back correctly");

  unregisterSecond();
  assert.equal(win.window.__elfHasOpenOverlay?.(), false);
});

test("elfAndroidBackButton with no registered overlay does nothing (no throw, nothing to call)", () => {
  assert.doesNotThrow(() => fireAndroidBack());
});
