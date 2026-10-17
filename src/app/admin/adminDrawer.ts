// Phase 1B — responsive Admin Portal shell. Pure helpers for the mobile
// navigation drawer in AdminShell.tsx. Deliberately import-free (same
// convention as src/lib/teamOrder.ts) so Node's native test runner can load
// it directly.

/** Width at which the permanent desktop sidebar returns. Must match the
 *  `@media (max-width: 899.98px)` blocks in adminResponsive.css. */
export const ADMIN_DESKTOP_MIN_WIDTH_PX = 900;
export const ADMIN_DESKTOP_MEDIA_QUERY = `(min-width: ${ADMIN_DESKTOP_MIN_WIDTH_PX}px)`;

export const ADMIN_DRAWER_ID = "admin-nav-drawer";

/** Everything inside the drawer that can take keyboard focus. */
export const DRAWER_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focus-trap decision for a Tab keypress inside the open drawer.
 *  `current` is the index of the focused element among the drawer's
 *  focusable elements (-1 when focus is outside the drawer). Returns the
 *  index to move focus to, or null to let the browser handle Tab normally. */
export function wrapFocusIndex(current: number, count: number, backwards: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  if (backwards && current === 0) return count - 1;
  if (!backwards && current === count - 1) return 0;
  return null;
}

type StyleTarget = { style: { overflow: string } };

/** Locks page scrolling behind the open drawer and returns a function that
 *  restores the previous inline overflow values exactly. */
export function lockDocumentScroll(doc: { documentElement: StyleTarget; body: StyleTarget }): () => void {
  const prevHtml = doc.documentElement.style.overflow;
  const prevBody = doc.body.style.overflow;
  doc.documentElement.style.overflow = "hidden";
  doc.body.style.overflow = "hidden";
  return () => {
    doc.documentElement.style.overflow = prevHtml;
    doc.body.style.overflow = prevBody;
  };
}
