// Account drawer (AccountMenu.tsx) — the pure parts of its behavior, kept
// DOM-free so they're unit-testable without a renderer (same pattern as
// desktopNavItems.ts / seenDwell.ts): sizing, animation timing with the
// reduced-motion fallback, and the keyboard rule (Escape closes; Tab and
// Shift+Tab wrap inside the drawer so focus never escapes behind the
// overlay).

/** ~88% of the screen on phones, capped on wider screens. */
export const DRAWER_WIDTH = "min(88vw, 380px)";

export const DRAWER_TRANSITION_MS = 240;

/** CSS transition for the sliding panel or the fading overlay. Reduced
 *  motion: no animation at all — the drawer simply appears/disappears. */
export function drawerTransition(property: "transform" | "opacity", reducedMotion: boolean): string {
  if (reducedMotion) return "none";
  return property === "transform"
    ? `transform ${DRAWER_TRANSITION_MS}ms cubic-bezier(.25,.46,.45,.94)`
    : `opacity ${DRAWER_TRANSITION_MS}ms ease`;
}

/** How long the drawer stays mounted after closing starts, so the slide-out
 *  can finish. Immediate under reduced motion. */
export function drawerCloseDelayMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : DRAWER_TRANSITION_MS;
}

/** Everything inside the drawer that can take keyboard focus. */
export const DRAWER_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DrawerKeyAction = { type: "close" } | { type: "focus"; index: number } | null;

/** Keyboard handling while the drawer is open. `activeIndex` is the focused
 *  element's position among the drawer's focusable elements (-1 when focus
 *  is outside them). Returns null when the browser's default is right —
 *  Tab between two inner elements moves normally. */
export function drawerKeyAction(key: string, shiftKey: boolean, activeIndex: number, focusableCount: number): DrawerKeyAction {
  if (key === "Escape") return { type: "close" };
  if (key !== "Tab" || focusableCount <= 0) return null;
  const last = focusableCount - 1;
  if (activeIndex < 0) return { type: "focus", index: shiftKey ? last : 0 };
  if (shiftKey && activeIndex === 0) return { type: "focus", index: last };
  if (!shiftKey && activeIndex === last) return { type: "focus", index: 0 };
  return null;
}
