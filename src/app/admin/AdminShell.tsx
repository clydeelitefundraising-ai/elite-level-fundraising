"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  disabled?: boolean;
  accent?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",    href: "/admin/dashboard",  icon: "◉" },
  { label: "Campaigns",    href: "/admin/campaigns",  icon: "◫" },
  { label: "Accounts",     href: "/admin/accounts",   icon: "◎" },
  { label: "Analytics",    href: "/admin/analytics",  icon: "╱" },
  { label: "Exports",      href: "/admin/exports",    icon: "↓" },
];

const NAV_SECONDARY: NavItem[] = [
  { label: "Branding",     href: "#",                 icon: "◈", disabled: true },
  { label: "Demo Center",  href: "#",                 icon: "▶", disabled: true, accent: true },
  { label: "Audit Log",    href: "/admin/audit",      icon: "☰" },
  { label: "Settings",     href: "#",                 icon: "⊙", disabled: true },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard":      "Dashboard",
  "/admin/campaigns":      "Campaigns",
  "/admin/campaigns/new":       "New Campaign",
  "/admin/campaigns/duplicate": "Duplicate Campaign",
  "/admin/exports":             "Exports",
  "/admin/audit":               "Audit Log",
  "/admin/accounts":       "Accounts",
  "/admin/analytics":      "Analytics",
  "/admin/edit":           "Campaign Editor",
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const title = PAGE_TITLES[pathname] ?? "Admin";

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
          <NavSection items={NAV_ITEMS} pathname={pathname} router={router} />

          <div style={{ margin: ".75rem .5rem", height: 1, background: "#f3f4f6" }} />

          <NavSection items={NAV_SECONDARY} pathname={pathname} router={router} />

          {/* Legacy editor link */}
          <div style={{ margin: ".75rem .5rem", height: 1, background: "#f3f4f6" }} />
          <NavSection
            items={[{ label: "Campaign Editor", href: "/admin/edit", icon: "⊞" }]}
            pathname={pathname}
            router={router}
            muted
          />
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

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Header bar */}
        <header style={{ height: 52, background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 1.75rem", flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>
          <h1 style={{ margin: 0, fontSize: ".95rem", fontWeight: 700, color: "#1d1d1f", letterSpacing: "-.01em" }}>{title}</h1>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavSection({
  items,
  pathname,
  router,
  muted = false,
}: {
  items: NavItem[];
  pathname: string;
  router: ReturnType<typeof useRouter>;
  muted?: boolean;
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
            style={{
              display: "flex", alignItems: "center", gap: ".55rem",
              padding: ".42rem .75rem",
              background: active ? "#eff0f3" : "none",
              border: "none", borderRadius: 7,
              cursor: isDisabled ? "default" : "pointer",
              textAlign: "left", width: "100%",
              transition: "background .12s",
            }}
            onMouseEnter={e => { if (!active && !isDisabled) (e.currentTarget as HTMLButtonElement).style.background = "#f5f5f7"; }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <span style={{ fontSize: ".72rem", width: 14, textAlign: "center", flexShrink: 0, color: active ? "#0b1e3d" : isDisabled || muted ? "#c7c7cc" : "#6e6e73" }}>
              {item.icon}
            </span>
            <span style={{ fontSize: ".8rem", fontWeight: active ? 600 : 500, color: active ? "#0b1e3d" : isDisabled || muted ? "#c7c7cc" : "#1d1d1f", letterSpacing: "-.01em" }}>
              {item.label}
            </span>
            {item.disabled && (
              <span style={{ marginLeft: "auto", fontSize: ".58rem", fontWeight: 600, color: "#c7c7cc", letterSpacing: ".04em", textTransform: "uppercase" }}>
                Soon
              </span>
            )}
            {item.accent && !item.disabled && (
              <span style={{ marginLeft: "auto", fontSize: ".6rem", fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: ".1rem .4rem", borderRadius: 4 }}>
                New
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
