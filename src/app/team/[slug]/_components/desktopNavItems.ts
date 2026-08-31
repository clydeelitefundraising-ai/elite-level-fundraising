// Pure helpers for the Phase D1 desktop sidebar — extracted so nav item
// construction, permission gating, and active-route matching are directly
// unit-testable without any component-render infrastructure (this repo has
// none — see attachmentClient.ts/reconcileMessages.ts for the same pattern).
// DesktopSidebar.tsx is the only consumer; it renders exactly what these
// functions compute and nothing more.

export type DesktopNavItem = {
  key: string;
  href: string;
  label: string;
  icon: string;
  badge?: number;
};

/** Builds the desktop sidebar's nav item list. Permission gating uses the
 *  SAME booleans the layout already computes from the centralized
 *  permissions.ts helpers (isHeadCoach/isStaff) — this function never
 *  re-implements or duplicates that authorization logic, it only decides
 *  which items to render given the caller's already-authoritative answer.
 *  `showRequests` being true for a platform admin is a consequence of
 *  isHeadCoach() already treating platform_admin as head-coach-equivalent
 *  (see permissions.ts/permissions.test.ts) — nothing here special-cases
 *  platform admin separately, matching the rest of the codebase's pattern. */
export function buildDesktopNavItems(params: {
  showSponsors: boolean;
  showRequests: boolean;
  communicationsBadge: number;
  messagesBadge: number;
  donorCount: number;
  pendingRequestCount: number;
}): DesktopNavItem[] {
  const items: DesktopNavItem[] = [
    { key: "home", href: "home", label: "Home", icon: "🏠" },
    { key: "team", href: "team", label: "Team", icon: "👥" },
    { key: "calendar", href: "calendar", label: "Calendar", icon: "📅" },
    { key: "communications", href: "communications", label: "Communications", icon: "📣", badge: params.communicationsBadge },
    { key: "messages", href: "messages", label: "Messages", icon: "💬", badge: params.messagesBadge },
    { key: "fundraiser", href: "fundraiser", label: "Fundraising", icon: "💰", badge: params.donorCount },
  ];

  if (params.showSponsors) {
    items.push({ key: "sponsors", href: "sponsors", label: "Sponsors", icon: "🤝" });
  }
  if (params.showRequests) {
    items.push({ key: "requests", href: "requests", label: "Requests", icon: "📋", badge: params.pendingRequestCount });
  }

  items.push({ key: "settings", href: "settings", label: "Settings", icon: "⚙️" });

  return items;
}

/** Whether a given pathname counts as "on" this nav item's destination —
 *  exact match OR a nested route under it (matches TeamNav.tsx's existing
 *  mobile bottom-nav active-matching convention exactly, so desktop and
 *  mobile never disagree about what "active" means for the same route).
 *  This is what makes /team/[slug]/team/[id] mark Team active and
 *  /team/[slug]/messages/[threadId] (and the attachment viewer nested
 *  under it, /messages/attachments/[id]/view) mark Messages active,
 *  without any route-specific special-casing — both are just nested
 *  paths under the item's own href. */
export function isDesktopNavItemActive(pathname: string, slug: string, itemHref: string): boolean {
  const href = `/team/${slug}/${itemHref}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}
