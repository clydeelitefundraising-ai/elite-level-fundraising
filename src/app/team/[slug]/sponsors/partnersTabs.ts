// Phase 2.1 — Partners two-tab shell. Pure, directly unit-testable (this
// repo has no component-rendering test framework — see
// desktopNavItems.ts/fundraiserAccess.ts for the same pattern: the real
// decision lives in a plain function, the component just calls it).
export type PartnersTabKey = "community" | "team";

export const PARTNERS_TABS: { key: PartnersTabKey; label: string }[] = [
  { key: "community", label: "ELF Community Partners" },
  { key: "team",      label: "Team Sponsors" },
];

export const DEFAULT_PARTNERS_TAB: PartnersTabKey = "community";

/** Resolves the initial active tab from an optional raw ?tab= value (used
 *  only to support a future deep link, e.g. from Home — PartnersView
 *  reads this exactly once on mount via useState's lazy initializer, never
 *  on every render, and tab switching thereafter is local component state
 *  only, never a URL/router change). Anything other than exactly "team"
 *  falls back to the approved default ("community") — a missing, stale,
 *  or malformed value never leaves the page in a blank state. */
export function resolveActivePartnersTab(rawTab: string | null | undefined): PartnersTabKey {
  return rawTab === "team" ? "team" : DEFAULT_PARTNERS_TAB;
}
