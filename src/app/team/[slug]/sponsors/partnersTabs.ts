// Phase 2.1 — Partners two-tab shell. Pure, directly unit-testable (this
// repo has no component-rendering test framework — see
// desktopNavItems.ts/fundraiserAccess.ts for the same pattern: the real
// decision lives in a plain function, the component just calls it).
//
// Phase 2.2C — both the tab LIST and the resolved tab now depend on each
// school's `show_community_partners` setting. When it's off, "community"
// must never appear at all (per the approved decision: completely hide
// the ELF Community Partners tab, keep Team Sponsors fully visible) —
// not grayed out, not selectable, not a tab a stale `?tab=community` link
// could still land on.
export type PartnersTabKey = "community" | "team";

export function getPartnersTabs(showCommunityPartners: boolean): { key: PartnersTabKey; label: string }[] {
  return showCommunityPartners
    ? [
        { key: "community", label: "ELF Community Partners" },
        { key: "team",       label: "Team Sponsors" },
      ]
    : [
        { key: "team", label: "Team Sponsors" },
      ];
}

/** Resolves the initial active tab from an optional raw ?tab= value (used
 *  only to support a future deep link, e.g. from Home — PartnersView
 *  reads this exactly once on mount via useState's lazy initializer, never
 *  on every render, and tab switching thereafter is local component state
 *  only, never a URL/router change).
 *
 *  When `showCommunityPartners` is false, ALWAYS resolves to "team" —
 *  regardless of what rawTab says. This is what makes a stale
 *  `?tab=community` link (e.g. bookmarked from before an admin turned
 *  advertising off) degrade gracefully to Team Sponsors instead of
 *  resolving to a tab that no longer exists in the tab list.
 *
 *  When true: anything other than exactly "team" falls back to the
 *  approved default ("community") — a missing, stale, or malformed value
 *  never leaves the page in a blank state. */
export function resolveActivePartnersTab(
  rawTab: string | null | undefined,
  showCommunityPartners: boolean,
): PartnersTabKey {
  if (!showCommunityPartners) return "team";
  return rawTab === "team" ? "team" : "community";
}
