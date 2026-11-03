// Platform Admin navigation — the single source of truth for the admin
// shell's sidebar/drawer and every section hub page, so navigation stays
// consistent everywhere. Zero imports: unit-tested directly.
//
// Stage 1 of the admin consolidation: sections link to the existing tools.
// Tools still living in the legacy /admin portal are marked `legacy` (shown
// with a "Legacy admin" label); a signed-in Platform Admin opens them
// without the shared password (src/lib/adminAccess.ts). Nothing here grants
// access by itself — every page and API checks authorization on its own.

export type AdminNavItem = {
  label: string;
  href: string;
  description: string;
  /** Lives in the legacy /admin portal (not yet migrated). */
  legacy?: boolean;
};

export type AdminNavSection = {
  id: string;
  label: string;
  /** Where the section's nav entry goes (its hub or its main page). */
  href: string;
  /** Short glyph shown beside the label (decorative). */
  icon: string;
  summary: string;
  items: AdminNavItem[];
};

export const PLATFORM_ADMIN_HOME = "/platform-admin";

export const ADMIN_NAV: readonly AdminNavSection[] = [
  {
    id: "dashboard", label: "Dashboard", href: "/platform-admin", icon: "◉",
    summary: "Platform overview and day-to-day operations.",
    items: [
      { label: "Executive overview", href: "/admin/executive", description: "Platform totals, revenue estimate and momentum.", legacy: true },
      { label: "Operations dashboard", href: "/admin/dashboard", description: "Today's numbers, health and queues at a glance.", legacy: true },
      { label: "Operations", href: "/admin/operations", description: "Needs-attention list and pending items.", legacy: true },
      { label: "Automation", href: "/admin/automation", description: "Automation events and rule runs.", legacy: true },
      { label: "Notifications", href: "/admin/notifications", description: "Notification queue and delivery failures.", legacy: true },
      { label: "Audit log", href: "/admin/audit", description: "Who changed what, and when.", legacy: true },
    ],
  },
  {
    id: "schools", label: "Schools", href: "/platform-admin/schools", icon: "▣",
    summary: "School directory, school links, school profiles and Organization Center.",
    items: [
      { label: "School directory", href: "/platform-admin/schools", description: "Every school, its teams and Community Partner advertising." },
      { label: "School links", href: "/platform-admin/school-links", description: "Link team-seasons to schools, including completed seasons." },
      { label: "Organization Center", href: "/admin/organization", description: "School profile, communication templates and sponsor packages.", legacy: true },
    ],
  },
  {
    id: "teams", label: "Teams & Onboarding", href: "/platform-admin/teams", icon: "◫",
    summary: "Campaigns, new teams, team health and demos.",
    items: [
      { label: "Campaigns", href: "/admin/campaigns", description: "Every team-season, its Control Center, roster, coaches and registration.", legacy: true },
      { label: "New campaign", href: "/admin/campaigns/new", description: "Set up a new team-season.", legacy: true },
      { label: "Team health", href: "/admin/health", description: "Health scores and at-risk teams.", legacy: true },
      { label: "Demo Center", href: "/admin/demo", description: "Create, reset and launch demo teams.", legacy: true },
    ],
  },
  {
    id: "fundraising", label: "Fundraising", href: "/platform-admin/fundraising", icon: "$",
    summary: "Fundraising requests and campaign fundraising data.",
    items: [
      { label: "Fundraising inquiries", href: "/platform-admin/fundraising-inquiries", description: "Teams asking to turn fundraising on." },
      { label: "Campaign fundraising settings", href: "/admin/campaigns", description: "Goals, fund uses and coach fundraisers per campaign (in the Control Center).", legacy: true },
      { label: "Donation exports", href: "/admin/exports", description: "Download donations and campaign data.", legacy: true },
    ],
  },
  {
    id: "partners", label: "Partners & Sponsors", href: "/platform-admin/partners", icon: "◇",
    summary: "ELF Community Partners and sponsor relationships.",
    items: [
      { label: "ELF Community Partners", href: "/admin/community-partners", description: "Partner listings shown in the Team App and on campaign pages.", legacy: true },
      { label: "Sponsor directory", href: "/admin/sponsors", description: "Sponsor businesses, relationships and activity.", legacy: true },
      { label: "Sponsor intelligence", href: "/admin/sponsors/intelligence", description: "Top sponsors, insights and renewals.", legacy: true },
    ],
  },
  {
    id: "sales", label: "Sales & CRM", href: "/platform-admin/sales", icon: "☎",
    summary: "Coach pipeline and demo requests.",
    items: [
      { label: "Coach CRM", href: "/admin/crm", description: "Coach contacts, pipeline, follow-ups and demo requests.", legacy: true },
    ],
  },
  {
    id: "moderation", label: "Moderation", href: "/platform-admin/moderation", icon: "⚑",
    summary: "Reported content across every team.",
    items: [
      { label: "Moderation queue", href: "/platform-admin/moderation", description: "Review reports and remove content." },
    ],
  },
  {
    id: "analytics", label: "Reports & Analytics", href: "/platform-admin/analytics", icon: "▤",
    summary: "Business reports, analytics and exports.",
    items: [
      { label: "Reports", href: "/admin/reports", description: "Business reports across campaigns.", legacy: true },
      { label: "Analytics", href: "/admin/analytics", description: "Per-campaign and per-athlete performance.", legacy: true },
      { label: "Exports", href: "/admin/exports", description: "CSV exports of campaigns, contacts, donations and registration.", legacy: true },
    ],
  },
  {
    id: "settings", label: "Settings", href: "/platform-admin/settings", icon: "⚙",
    summary: "Your admin account, your own teams and platform accounts.",
    items: [
      { label: "My Teams", href: "/platform-admin/my-teams", description: "Teams you belong to as a coach, parent or member." },
      { label: "Accounts", href: "/admin/accounts", description: "ELF account directory.", legacy: true },
    ],
  },
];

export function navSection(id: string): AdminNavSection {
  const s = ADMIN_NAV.find(x => x.id === id);
  if (!s) throw new Error(`unknown admin nav section ${id}`);
  return s;
}

/** The section a /platform-admin path belongs to (for highlighting). */
export function activeSectionId(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === PLATFORM_ADMIN_HOME) return "dashboard";
  if (!path.startsWith(`${PLATFORM_ADMIN_HOME}/`)) return null;
  const owned: Array<[string, string]> = [];
  for (const s of ADMIN_NAV) {
    if (s.href !== PLATFORM_ADMIN_HOME) owned.push([s.href, s.id]);
    for (const i of s.items) if (i.href.startsWith(`${PLATFORM_ADMIN_HOME}/`)) owned.push([i.href, s.id]);
  }
  owned.sort((a, b) => b[0].length - a[0].length);
  const hit = owned.find(([href]) => path === href || path.startsWith(`${href}/`));
  return hit ? hit[1] : null;
}
