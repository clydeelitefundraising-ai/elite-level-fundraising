"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabConfig = {
  href: string;
  label: string;
  icon: string;
  badgeCount?: number;
};

const TABS: Omit<TabConfig, "badgeCount">[] = [
  { href: "home",       label: "Home",       icon: "🏠" },
  { href: "roster",     label: "Roster",     icon: "👥" },
  { href: "calendar",   label: "Calendar",   icon: "📅" },
  { href: "files",      label: "Updates",    icon: "📢" },
  { href: "fundraiser", label: "Fundraiser", icon: "💰" },
  { href: "sponsors",   label: "Sponsors",   icon: "🤝" },
  { href: "shop",       label: "Shop",       icon: "🛍️" },
  { href: "analytics",  label: "Stats",      icon: "📊" },
];

export default function TeamNav({
  slug,
  primaryColor,
  badgeCounts = {},
}: {
  slug: string;
  primaryColor: string;
  badgeCounts?: Record<string, number>;
}) {
  const pathname = usePathname();

  return (
    <div role="navigation" style={{
      position: "fixed",
      bottom: 0,
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(430px, 100%)",
      background: "#fff",
      borderTop: "1px solid #e5e7eb",
      display: "flex",
      zIndex: 50,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {TABS.map((tab) => {
        const href = `/team/${slug}/${tab.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const badge = badgeCounts[tab.href] ?? 0;

        return (
          <Link
            key={tab.href}
            href={href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: ".5rem .25rem .55rem",
              textDecoration: "none",
              color: active ? primaryColor : "#9ca3af",
              transition: "color .12s",
              minWidth: 0,
              position: "relative",
            }}
          >
            {/* Active indicator — centered pill at top */}
            {active && (
              <div style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 28,
                height: 2,
                background: primaryColor,
                borderRadius: 1,
              }} />
            )}
            {/* Icon with optional badge */}
            <div style={{ position: "relative", lineHeight: 1.3 }}>
              <span style={{ fontSize: "1.15rem" }}>{tab.icon}</span>
              {badge > 0 && (
                <span style={{
                  position: "absolute",
                  top: -4,
                  right: -7,
                  background: "#dc2626",
                  color: "#fff",
                  borderRadius: 100,
                  fontSize: ".52rem",
                  fontWeight: 700,
                  padding: ".1rem .28rem",
                  lineHeight: 1.4,
                  minWidth: 14,
                  textAlign: "center",
                }}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </div>
            <span style={{
              fontSize: ".6rem",
              fontWeight: active ? 700 : 500,
              letterSpacing: ".01em",
              marginTop: ".1rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
