"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { CommandCenter } from "./CommandCenter/CommandCenter";
import {
  ADMIN_DESKTOP_MEDIA_QUERY,
  ADMIN_DRAWER_ID,
  DRAWER_FOCUSABLE_SELECTOR,
  lockDocumentScroll,
  wrapFocusIndex,
} from "./adminDrawer";

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
      { label: "Team Health",     href: "/admin/health",    icon: "♥" },
    ],
  },
  {
    heading: "Relationships",
    items: [
      { label: "Coach CRM",             href: "/admin/crm",                icon: "☎" },
      { label: "Sponsors",              href: "/admin/sponsors",           icon: "🏢" },
      // Phase 2.2A — platform-wide advertising partners, distinct from the
      // Sponsors CRM above (per-team sponsor relationships). Requires a
      // real Platform Admin session in addition to this portal's own
      // password gate — see src/app/admin/community-partners/page.tsx.
      { label: "ELF Community Partners", href: "/admin/community-partners", icon: "🤝" },
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
  "/admin/community-partners":   "ELF Community Partners",
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

  // ── Mobile navigation drawer (below 900px; see adminResponsive.css) ──
  // On desktop the menu button is hidden, so mobileOpen never becomes true
  // there and the sidebar renders exactly as before.
  const drawerRef     = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef    = useRef(false);
  const closeDrawer   = useCallback(() => setMobileOpen(false), []);

  // Close on any route change, including ones the drawer didn't start
  // (Command Center, in-page links). Adjusting state during render is
  // React's recommended pattern for resetting state when a value changes.
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setMobileOpen(false);
  }

  // Close if the window grows to desktop width while the drawer is open.
  useEffect(() => {
    const mq = window.matchMedia(ADMIN_DESKTOP_MEDIA_QUERY);
    const onChange = (e: MediaQueryListEvent) => { if (e.matches) setMobileOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // While open: lock page scroll, move focus into the drawer, trap Tab
  // inside it, and close on Escape. On close, return focus to the menu button.
  useEffect(() => {
    if (!mobileOpen) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        menuButtonRef.current?.focus();
      }
      return;
    }
    wasOpenRef.current = true;
    const unlock = lockDocumentScroll(document);
    const drawer = drawerRef.current;
    const focusables = () =>
      drawer ? Array.from(drawer.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR)) : [];
    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      const next = wrapFocusIndex(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
      if (next !== null) {
        e.preventDefault();
        items[next].focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlock();
    };
  }, [mobileOpen]);

  // Global Ctrl+K / ⌘+K shortcut
  const openCC = useCallback(() => setCcOpen(true), []);
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setMobileOpen(false);
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
    <div className="adm-shell" data-drawer-open={mobileOpen ? "true" : "false"} style={{ display: "flex", minHeight: "100vh", background: "#f5f5f7", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Mobile drawer backdrop (hidden on desktop by adminResponsive.css) ── */}
      {mobileOpen && <div className="adm-backdrop" aria-hidden="true" onClick={closeDrawer} />}

      {/* ── Sidebar (permanent on desktop, drawer below 900px) ───────── */}
      <aside
        ref={drawerRef}
        id={ADMIN_DRAWER_ID}
        className="adm-sidebar"
        aria-label="Admin navigation"
        {...(mobileOpen ? { role: "dialog", "aria-modal": true } : {})}
        style={{
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
            <button type="button" className="adm-drawer-close" aria-label="Close navigation menu" onClick={closeDrawer}>
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>

        {/* Primary nav */}
        <div role="navigation" aria-label="Admin sections" style={{ padding: ".5rem .5rem 0", flex: 1 }}>
          {NAV_GROUPS.map((group, i) => (
            <div key={group.heading}>
              <NavGroupHeading label={group.heading} first={i === 0} />
              <NavSection items={group.items} pathname={pathname} router={router} onNavigate={closeDrawer} />
            </div>
          ))}
        </div>

        {/* Bottom: logout */}
        <div style={{ padding: ".75rem .5rem 1rem", borderTop: "1px solid #f3f4f6" }}>
          <button onClick={logout} className="adm-nav-item"
            style={{ width: "100%", textAlign: "left", padding: ".45rem .75rem", background: "none", border: "none", borderRadius: 7, cursor: "pointer", fontSize: ".78rem", color: "#6e6e73", fontWeight: 500, display: "flex", alignItems: "center", gap: ".5rem" }}>
            <span style={{ fontSize: ".85rem", opacity: .7 }}>⎋</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Command Center ───────────────────────────────────────────── */}
      {ccOpen && <CommandCenter onClose={() => setCcOpen(false)} />}

      {/* ── Main content ─────────────────────────────────────────────── */}
      {/* inert while the mobile drawer is open, so only the drawer is reachable. */}
      <div inert={mobileOpen} style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header bar */}
        <header className="adm-header" style={{ height: 52, background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 1.75rem", gap: "1rem", flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
          <button
            ref={menuButtonRef}
            type="button"
            className="adm-menu-btn"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            aria-controls={ADMIN_DRAWER_ID}
            onClick={() => setMobileOpen(true)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </button>
          <h1 className="adm-header-title" style={{ margin: 0, fontSize: ".95rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.01em", flex: 1 }}>{title}</h1>
          <button
            onClick={openCC}
            className="adm-search-btn"
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
            <span className="adm-search-label">Search…</span>
            <kbd className="adm-search-kbd" style={{ padding: ".1rem .35rem", background: "#e2e8f0", borderRadius: 4, fontSize: ".65rem", color: "#94a3b8", fontFamily: "inherit", marginLeft: ".1rem" }}>
              {typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘K" : "Ctrl+K"}
            </kbd>
          </button>
        </header>

        {/* Page content */}
        <main className="adm-main" style={{ flex: 1, overflowY: "auto" }}>
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
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  router: ReturnType<typeof useRouter>;
  onNavigate: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {items.map(item => {
        const active = item.href !== "#" && (pathname === item.href || pathname.startsWith(item.href + "/"));
        const isDisabled = item.disabled || item.href === "#";

        return (
          <button
            key={item.href + item.label}
            onClick={() => { if (!isDisabled) { onNavigate(); router.push(item.href); } }}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-current={active ? "page" : undefined}
            className="adm-nav-item"
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
