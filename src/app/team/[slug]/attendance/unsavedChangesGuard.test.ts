// Team Management Phase 5-4 — the unsaved-changes guard: which link clicks
// are confirmed first, and the Back-button history bookkeeping (with a
// fake history, so it's checked without a browser).
import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryGuard, guardedNavigationTarget, type GuardRequest, type LinkClick } from "./unsavedChangesGuard.ts";

const HERE = "https://app.example.test/team/wolves/attendance?date=2026-10-20";
const click = (href: string | null, extra: Partial<LinkClick> = {}): LinkClick => ({
  href, target: null, download: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...extra,
});

test("in-app links are confirmed first", () => {
  assert.equal(guardedNavigationTarget(click("/team/wolves/team"), HERE), "/team/wolves/team");
  assert.equal(guardedNavigationTarget(click("home"), HERE), "/team/wolves/home");
  assert.equal(guardedNavigationTarget(click("https://app.example.test/team/wolves/calendar?x=1#top"), HERE), "/team/wolves/calendar?x=1#top");
  assert.equal(guardedNavigationTarget(click("/team/wolves/attendance?date=2026-10-19"), HERE), "/team/wolves/attendance?date=2026-10-19");
});

test("left alone: new tab/window clicks, downloads, other sites, non-web links, same-page anchors, handled clicks", () => {
  for (const c of [
    click("/team/wolves/team", { metaKey: true }),
    click("/team/wolves/team", { ctrlKey: true }),
    click("/team/wolves/team", { shiftKey: true }),
    click("/team/wolves/team", { altKey: true }),
    click("/team/wolves/team", { button: 1 }),
    click("/team/wolves/team", { target: "_blank" }),
    click("/team/wolves/report.csv", { download: true }),
    click("/team/wolves/team", { defaultPrevented: true }),
    click("https://elsewhere.example/"),
    click("mailto:coach@example.test"),
    click("tel:5551234"),
    click("#summary"),
    click(HERE),
    click(null),
  ]) {
    assert.equal(guardedNavigationTarget(c, HERE), null, JSON.stringify(c));
  }
});

function fakeHost() {
  const stack = ["previous", "page"];
  let index = 1;
  const listeners = new Set<() => void>();
  const host = {
    pushSameUrl() { stack.splice(index + 1); stack.push("extra"); index++; },
    go(delta: number) {
      index = Math.max(0, index + delta);
      // popstate fires asynchronously in browsers; synchronously is enough here.
      for (const l of [...listeners]) l();
    },
    onPopState(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  /** The user presses Back. */
  const back = () => host.go(-1);
  return { host, stack, back, at: () => stack.slice(0, index + 1), listeners };
}

test("Back with unsaved changes: stays on the page and asks; Discard leaves past the extra entry", () => {
  const h = fakeHost();
  const requests: GuardRequest[] = [];
  const guard = createHistoryGuard(h.host);
  guard.setOnRequest(r => requests.push(r));

  guard.activate();
  assert.deepEqual(h.at(), ["previous", "page", "extra"]);
  guard.activate();
  assert.deepEqual(h.at(), ["previous", "page", "extra"], "only one extra entry");

  h.back();
  assert.deepEqual(requests, [{ kind: "back" }]);
  assert.deepEqual(h.at(), ["previous", "page", "extra"], "still here, protected again");

  guard.leaveBack();
  assert.deepEqual(h.at(), ["previous"], "moved back past both entries");
  assert.equal(requests.length, 1, "leaving doesn't ask again");
});

test("saved or discarded while staying: the extra entry is removed and Back works normally", () => {
  const h = fakeHost();
  const requests: GuardRequest[] = [];
  const guard = createHistoryGuard(h.host);
  guard.setOnRequest(r => requests.push(r));
  guard.activate();
  guard.release();
  assert.deepEqual(h.at(), ["previous", "page"]);
  assert.deepEqual(requests, [], "removing our own entry isn't a request to leave");
  assert.equal(guard.state.bypass, false);
  // Inactive: Back is not intercepted.
  h.back();
  assert.deepEqual(requests, []);
});

test("Discard on a link replaces the extra entry (Back from the new page returns here once)", () => {
  const h = fakeHost();
  const guard = createHistoryGuard(h.host);
  guard.activate();
  assert.equal(guard.leaveTo(), "replace");
  assert.equal(guard.state.extraEntry, false);
  const fresh = createHistoryGuard(fakeHost().host);
  assert.equal(fresh.leaveTo(), "push", "no extra entry: a normal push");
});

test("dispose removes the listener", () => {
  const h = fakeHost();
  const guard = createHistoryGuard(h.host);
  guard.activate();
  assert.equal(h.listeners.size, 1);
  guard.dispose();
  assert.equal(h.listeners.size, 0);
});
