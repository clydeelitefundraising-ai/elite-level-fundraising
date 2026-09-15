// QA fix: AccountMenu (mounted in DesktopSidebar, at the LEFT edge of the
// screen on desktop) was clipping off the left side of the viewport —
// its position math anchored the panel's right edge to the trigger
// button's right edge assuming a roughly-fixed panel width, so a button
// near the left edge produced a computed left edge that went negative.
// These are pure-function tests of the shared clamping helper
// (computeClampedMenuPosition) used by both AccountMenu.tsx and
// TeamSwitcher.tsx, independent of React/DOM — cheap and exhaustive to
// verify the actual math without a rendering harness.
import test from "node:test";
import assert from "node:assert/strict";
import { computeClampedMenuPosition, MENU_VIEWPORT_PADDING } from "./menuPositioning.ts";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT  = { width: 375, height: 667 };

test("computeClampedMenuPosition: normal case (button comfortably inside the viewport) needs no clamping — right-aligns to the trigger", () => {
  const trigger = { top: 20, bottom: 60, left: 1350, right: 1400 };
  const panel = { width: 230, height: 400 };
  const pos = computeClampedMenuPosition(trigger, panel, DESKTOP_VIEWPORT);
  assert.equal(pos.top, 68); // bottom + 8
  assert.equal(pos.left, 1400 - 230); // right-aligned, well within viewport
});

test("computeClampedMenuPosition: reproduces and fixes the reported AccountMenu bug — trigger near the LEFT edge (DesktopSidebar) with a wide panel no longer produces a negative left", () => {
  // AccountMenu's actual desktop mounting point: DesktopSidebar sits at
  // the left edge, so the trigger button's own rect.right is small.
  const trigger = { top: 800, bottom: 834, left: 20, right: 54 };
  const panel = { width: 260, height: 420 }; // wider than the trigger's own right offset
  const pos = computeClampedMenuPosition(trigger, panel, DESKTOP_VIEWPORT);
  assert.ok(pos.left >= MENU_VIEWPORT_PADDING, `left (${pos.left}) must never be less than the viewport padding`);
  assert.ok(pos.left + panel.width <= DESKTOP_VIEWPORT.width - MENU_VIEWPORT_PADDING, "panel must not overflow the right edge either");
});

test("computeClampedMenuPosition: trigger near the RIGHT edge with a wide panel is clamped so the right edge doesn't overflow", () => {
  const trigger = { top: 20, bottom: 60, left: DESKTOP_VIEWPORT.width - 40, right: DESKTOP_VIEWPORT.width - 10 };
  const panel = { width: 300, height: 400 };
  const pos = computeClampedMenuPosition(trigger, panel, DESKTOP_VIEWPORT);
  assert.ok(pos.left + panel.width <= DESKTOP_VIEWPORT.width - MENU_VIEWPORT_PADDING, "panel right edge must stay inside the viewport");
  assert.ok(pos.left >= MENU_VIEWPORT_PADDING);
});

test("computeClampedMenuPosition: works at mobile widths — trigger near the left edge with a panel almost as wide as the screen", () => {
  const trigger = { top: 10, bottom: 44, left: 12, right: 46 };
  const panel = { width: 320, height: 500 }; // nearly the full 375px viewport
  const pos = computeClampedMenuPosition(trigger, panel, MOBILE_VIEWPORT);
  assert.ok(pos.left >= MENU_VIEWPORT_PADDING);
  assert.ok(pos.left + panel.width <= MOBILE_VIEWPORT.width - MENU_VIEWPORT_PADDING);
});

test("computeClampedMenuPosition: a panel taller than the viewport is clamped vertically too, never starting above the top padding", () => {
  const trigger = { top: 600, bottom: 634, left: 20, right: 54 };
  const panel = { width: 230, height: 900 }; // taller than the 667px mobile viewport
  const pos = computeClampedMenuPosition(trigger, panel, MOBILE_VIEWPORT);
  assert.ok(pos.top >= MENU_VIEWPORT_PADDING);
});

test("computeClampedMenuPosition: respects a custom padding argument", () => {
  const trigger = { top: 10, bottom: 40, left: 5, right: 35 };
  const panel = { width: 200, height: 300 };
  const pos = computeClampedMenuPosition(trigger, panel, MOBILE_VIEWPORT, 20);
  assert.equal(pos.left, 20);
});
