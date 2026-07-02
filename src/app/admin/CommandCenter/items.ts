import type { CmdItem } from "./types";

// ─── Static page navigation items ────────────────────────────────────────────

export const PAGE_ITEMS: CmdItem[] = [
  { id: "page-dashboard",    kind: "page",   label: "Dashboard",           icon: "◉", href: "/admin/dashboard",    group: "PAGES" },
  { id: "page-executive",    kind: "page",   label: "Executive Dashboard", icon: "★", href: "/admin/executive",   group: "PAGES" },
  { id: "page-operations",   kind: "page",   label: "Operations Center",   icon: "⬡", href: "/admin/operations",   group: "PAGES" },
  { id: "page-crm",          kind: "page",   label: "Coach CRM",           icon: "☎", href: "/admin/crm",          group: "PAGES" },
  { id: "page-sponsors",     kind: "page",   label: "Sponsor Directory",   icon: "🏢", href: "/admin/sponsors",     group: "PAGES" },
  { id: "page-sponsor-intel", kind: "page",  label: "Sponsor Intelligence", icon: "🎯", href: "/admin/sponsors/intelligence", group: "PAGES" },
  { id: "page-health",       kind: "page",   label: "Team Health",         icon: "♥", href: "/admin/health",       group: "PAGES" },
  { id: "page-automation",   kind: "page",   label: "Automation",          icon: "⚡", href: "/admin/automation",   group: "PAGES" },
  { id: "page-campaigns",    kind: "page",   label: "Campaigns",           icon: "◫", href: "/admin/campaigns",    group: "PAGES" },
  { id: "page-accounts",     kind: "page",   label: "Accounts",            icon: "◎", href: "/admin/accounts",     group: "PAGES" },
  { id: "page-analytics",    kind: "page",   label: "Analytics",           icon: "╱", href: "/admin/analytics",    group: "PAGES" },
  { id: "page-exports",      kind: "page",   label: "Exports",             icon: "↓", href: "/admin/exports",      group: "PAGES" },
  { id: "page-audit",        kind: "page",   label: "Audit Log",           icon: "☰", href: "/admin/audit",        group: "PAGES" },
  { id: "page-organization", kind: "page",   label: "Organization Center", icon: "◈", href: "/admin/organization", group: "PAGES" },
  { id: "page-demo",         kind: "demo",   label: "Demo Center",         icon: "▶", href: "/admin/demo",         group: "PAGES" },
];

// ─── Action items (action fn attached at runtime by CommandCenter) ────────────
// Actions with hrefs navigate directly. Actions without hrefs call the fn.

export const ACTION_ITEM_DEFS: Omit<CmdItem, "action">[] = [
  { id: "action-new-campaign",  kind: "action", label: "Create Campaign",        icon: "➕", href: "/admin/campaigns/new",       group: "ACTIONS" },
  { id: "action-duplicate",     kind: "action", label: "Duplicate Campaign",     icon: "⧉",  href: "/admin/campaigns/duplicate",  group: "ACTIONS" },
  { id: "action-export-don",    kind: "action", label: "Export Donations",       icon: "📤", href: "/admin/exports",              group: "ACTIONS" },
  { id: "action-export-reg",    kind: "action", label: "Export Registration",    icon: "📄", href: "/admin/exports",              group: "ACTIONS" },
  { id: "action-new-demo",      kind: "demo",   label: "Open Demo Center",       icon: "▶",  href: "/admin/demo",                 group: "ACTIONS" },
  { id: "action-init-demo",     kind: "demo",   label: "Initialize Demo",        icon: "🔄",                                      group: "ACTIONS" },
  { id: "action-reset-demo",    kind: "demo",   label: "Reset Demo Data",        icon: "🔄",                                      group: "ACTIONS" },
  { id: "action-executive",     kind: "action", label: "Open Executive Dashboard", icon: "★", href: "/admin/executive",          group: "ACTIONS" },
  { id: "action-operations",    kind: "action", label: "Open Operations Center",  icon: "⬡", href: "/admin/operations",          group: "ACTIONS" },
  { id: "action-crm",           kind: "action", label: "Open Coach CRM",          icon: "☎", href: "/admin/crm",                 group: "ACTIONS" },
  { id: "action-sponsors",      kind: "action", label: "Open Sponsor Directory",  icon: "🏢", href: "/admin/sponsors",            group: "ACTIONS" },
  { id: "action-sponsor-intel", kind: "action", label: "Open Sponsor Intelligence", icon: "🎯", href: "/admin/sponsors/intelligence", group: "ACTIONS" },
  { id: "action-health",        kind: "action", label: "Open Team Health",        icon: "♥", href: "/admin/health",              group: "ACTIONS" },
  { id: "action-automation",    kind: "action", label: "Open Automation",         icon: "⚡", href: "/admin/automation",          group: "ACTIONS" },
  { id: "action-organization",  kind: "action", label: "Open Organization Center",icon: "◈", href: "/admin/organization",        group: "ACTIONS" },
  { id: "action-analytics",     kind: "action", label: "Open Analytics",         icon: "╱", href: "/admin/analytics",            group: "ACTIONS" },
  { id: "action-audit",         kind: "action", label: "Open Audit Log",         icon: "☰", href: "/admin/audit",                group: "ACTIONS" },
];

// Actions that require a runtime callback (id → callback key)
export const ASYNC_ACTION_IDS = new Set(["action-init-demo", "action-reset-demo"]);
