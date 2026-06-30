import type { CmdItem } from "./types";

// ─── Static page navigation items ────────────────────────────────────────────

export const PAGE_ITEMS: CmdItem[] = [
  { id: "page-dashboard",    kind: "page",   label: "Dashboard",           icon: "◉", href: "/admin/dashboard",    group: "PAGES" },
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
  { id: "action-organization",  kind: "action", label: "Open Organization Center",icon: "◈", href: "/admin/organization",        group: "ACTIONS" },
  { id: "action-analytics",     kind: "action", label: "Open Analytics",         icon: "╱", href: "/admin/analytics",            group: "ACTIONS" },
  { id: "action-audit",         kind: "action", label: "Open Audit Log",         icon: "☰", href: "/admin/audit",                group: "ACTIONS" },
];

// Actions that require a runtime callback (id → callback key)
export const ASYNC_ACTION_IDS = new Set(["action-init-demo", "action-reset-demo"]);
