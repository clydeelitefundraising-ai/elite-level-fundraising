"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { CommandCenter } from "./CommandCenter/CommandCenter";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  disabled?: boolean;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

// Routes are unchanged from before this pass — only grouped into logical
// sections with subtle headers for scanability. No hrefs were added, removed,
// or renamed here.
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Main",
    items: [
      { label: "Executive", href: "/admin/executive", icon: "★" },
      { label: "Dashboard",  href: "/admin/dashboard", icon: "◉" },
      { label: "Reports",    href: "/admin/reports",   icon: "📊" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { label: "Operations",    href: "/admin/operations",    icon: "⬡" },
      { label: "Automation",    href: "/admin/automation",    icon: "⚡" },
      { label: "Notifications", href: "/admin/notifications", icon: "🔔" },
      { label: "Audit Log",     href: "/admin/audit",         icon: "☰" },
    ],
  },
  {
    heading: "Campaigns",
    items: [
      { label: "Campaigns",       href: "/admin/campaigns", icon: "◫" },
      { label: "Campaign Editor", href: "/admin/edit",      icon: "⊞" },
      { label: "Team Health",     href: "/admin/health",    icon: "♥" },
    ],
  },
  {
    heading: "Relationships",
    items: [
      { label: "Coach CRM", href: "/admin/crm",      icon: "☎" },
      { label: "Sponsors",  href: "/admin/sponsors",  icon: "🏢" },
    ],
  },
  {
    heading: "Analytics",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: "╱" },
      { label: "Accounts",  href: "/admin/accounts",  icon: "◎" },
      { label: "Exports",   href: "/admin/exports",   icon: "↓" },
    ],
  },
  {
    heading: "System",
    items: [
      { label: "Organization", href: "/admin/organization", icon: "◈" },
      { label: "Demo Center",  href: "/admin/demo",          icon: "▶" },
      { label: "Settings",     href: "#",                    icon: "⊙", disabled: true },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard":      "Dashboard",
  "/admin/executive":      "Executive Dashboard",
  "/admin/reports":        "Reports",
  "/admin/operations":     "Operations Center",
  "/admin/crm":            "Coach CRM",
  "/admin/sponsors":       "Sponsor Directory",
  "/admin/sponsors/intelligence": "Sponsor Intelligence",
  "/admin/notifications":  "Notifications",
  "/admin/health":         "Team Health",
  "/admin/automation":     "Automation",
  "/admin/campaigns":      "Campaigns",
  "/admin/campaigns/new":       "New Campaign",
  "/admin/campaigns/duplicate": "Duplicate Campaign",
  "/admin/exports":             "Exports",
  "/admin/audit":               "Audit Log",
  "/admin/organization":        "Organization Center",
  "/admin/demo":                "Demo Center",
  "/admin/accounts":       "Accounts",
  "/admin/analytics":      "Analytics",
  "/admin/edit":           "Campaign Editor",
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [ccOpen,     setCcOpen]     = useState(false);

  const title = PAGE_TITLES[pathname] ?? "Admin";

  // Global Ctrl+K / ⌘+K shortcut
  const openCC = useCallback(() => setCcOpen(true), []);
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCcOpen(prev => !prev);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f5f5f7", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0, background: "#fff",
        borderRight: "1px solid #e5e7eb",
        display: "flex", flexDirection: "column",
        position: "sticky", top: 0, height: "100vh",
        overflowY: "auto",
      }}>

        {/* Logo */}
        <div style={{ padding: "1.25rem 1rem 1rem", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
            <div style={{ width: 28, height: 28, background: "#0b1e3d", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontSize: ".65rem", fontWeight: 900, letterSpacing: ".03em" }}>ELF</span>
            </div>
            <div>
              <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#1d1d1f", lineHeight: 1.1 }}>Admin Portal</div>
              <div style={{ fontSize: ".6rem", color: "#98989d", fontWeight: 500, letterSpacing: ".03em" }}>Elite Level Fundraising</div>
            </div>
          </div>
        </div>

        {/* Primary nav */}
        <div role="navigation" style={{ padding: ".5rem .5rem 0", flex: 1 }}>
          {NAV_GROUPS.map((group, i) => (
            <div key={group.heading}>
              <NavGroupHeading label={group.heading} first={i === 0} />
              <NavSection items={group.items} pathname={pathname} router={router} />
            </div>
          ))}
        </div>

        {/* Bottom: logout */}
        <div style={{ padding: ".75rem .5rem 1rem", borderTop: "1px solid #f3f4f6" }}>
          <button onClick={logout}
            style={{ width: "100%", textAlign: "left", padding: ".45rem .75rem", background: "none", border: "none", borderRadius: 7, cursor: "pointer", fontSize: ".78rem", color: "#6e6e73", fontWeight: 500, display: "flex", alignItems: "center", gap: ".5rem" }}>
            <span style={{ fontSize: ".85rem", opacity: .7 }}>⎋</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Command Center ───────────────────────────────────────────── */}
      {ccOpen && <CommandCenter onClose={() => setCcOpen(false)} />}

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header bar */}
        <header style={{ height: 52, background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 1.75rem", gap: "1rem", flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
          <h1 style={{ margin: 0, fontSize: ".95rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.01em", flex: 1 }}>{title}</h1>
          <button
            onClick={openCC}
            aria-label="Open Command Center (Ctrl+K)"
            style={{
              display:       "flex",
              alignItems:    "center",
              gap:           ".5rem",
              padding:       ".35rem .75rem",
              background:    "#f8fafc",
              border:        "1px solid #e2e8f0",
              borderRadius:  8,
              cursor:        "pointer",
              fontSize:      ".78rem",
              color:         "#64748b",
              fontFamily:    "inherit",
              whiteSpace:    "nowrap",
            }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#94a3b8"; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e2e8f0"; }}
          >
            <span style={{ fontSize: ".85rem" }}>🔍</span>
            <span>Search…</span>
            <kbd style={{ padding: ".1rem .35rem", background: "#e2e8f0", borderRadius: 4, fontSize: ".65rem", color: "#94a3b8", fontFamily: "inherit", marginLeft: ".1rem" }}>
              {typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘K" : "Ctrl+K"}
            </kbd>
          </button>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavGroupHeading({ label, first = false }: { label: string; first?: boolean }) {
  return (
    <div style={{
      padding: `${first ? ".2rem" : ".85rem"} .75rem .3rem`,
      fontSize: ".62rem", fontWeight: 700, color: "#b9b9bd",
      textTransform: "uppercase", letterSpacing: ".07em",
    }}>
      {label}
    </div>
  );
}

function NavSection({
  items,
  pathname,
  router,
}: {
  items: NavItem[];
  pathname: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {items.map(item => {
        const active = item.href !== "#" && (pathname === item.href || pathname.startsWith(item.href + "/"));
        const isDisabled = item.disabled || item.href === "#";

        return (
          <button
            key={item.href + item.label}
            onClick={() => { if (!isDisabled) router.push(item.href); }}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            style={{
              display: "flex", alignItems: "center", gap: ".55rem",
              padding: ".42rem .75rem",
              background: active ? "#eff0f3" : "none",
              border: "none", borderRadius: 7,
              cursor: isDisabled ? "not-allowed" : "pointer",
              textAlign: "left", width: "100%",
              transition: "background .12s, box-shadow .12s",
              outline: "none",
            }}
            onMouseEnter={e => { if (!active && !isDisabled) (e.currentTarget as HTMLButtonElement).style.background = "#f5f5f7"; }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
            onFocus={e => { if (!isDisabled) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 2px rgba(11,30,61,.25)"; }}
            onBlur={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
          >
            <span style={{ fontSize: ".72rem", width: 14, textAlign: "center", flexShrink: 0, color: active ? "#0b1e3d" : isDisabled ? "#d4d4d8" : "#6e6e73" }}>
              {item.icon}
            </span>
            <span style={{ fontSize: ".8rem", fontWeight: active ? 600 : 500, color: active ? "#0b1e3d" : isDisabled ? "#d4d4d8" : "#1d1d1f", letterSpacing: "-.01em" }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
