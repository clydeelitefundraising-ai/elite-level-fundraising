// QA fix: AccountMenu and TeamSwitcher both portal their dropdown panel to
// document.body (see their own comments for why) and position it with
// `position: fixed` computed from the trigger button's real screen
// coordinates. AccountMenu is mounted inside DesktopSidebar, which sits at
// the LEFT edge of the screen on desktop — the original position math
// anchored the panel's `right` edge to the button's right edge assuming a
// roughly-fixed panel width, so a button near the left edge produced a
// `right` distance so large that the panel's computed left edge (viewport
// width - right - panel width) went negative, clipping its own left side
// and any name/label/icon that started near it. This computes the panel's
// position from its OWN measured width/height (not an assumed constant)
// and clamps it to stay fully inside the viewport at any trigger position,
// any panel content length, and any screen width — desktop or mobile.
export type MenuPosition = { top: number; left: number };

export const MENU_VIEWPORT_PADDING = 12;

export function computeClampedMenuPosition(
  triggerRect: { top: number; bottom: number; left: number; right: number },
  panelSize: { width: number; height: number },
  viewport: { width: number; height: number },
  padding: number = MENU_VIEWPORT_PADDING,
): MenuPosition {
  // Right-align the panel to the trigger by default (its usual visual
  // alignment), then clamp so it can never sit closer to either edge than
  // `padding`, however far off the ideal position that pushes it.
  const idealLeft = triggerRect.right - panelSize.width;
  const maxLeft = Math.max(padding, viewport.width - padding - panelSize.width);
  const left = Math.min(Math.max(idealLeft, padding), maxLeft);

  const idealTop = triggerRect.bottom + 8;
  const maxTop = Math.max(padding, viewport.height - padding - panelSize.height);
  const top = Math.min(Math.max(idealTop, padding), maxTop);

  return { top, left };
}
