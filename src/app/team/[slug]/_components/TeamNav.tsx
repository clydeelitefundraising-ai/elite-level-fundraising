"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Megaphone, Calendar, DollarSign, ShoppingBag, Users, Handshake, type LucideIcon } from "lucide-react";

type TabConfig = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeCount?: number;
  // Per-tab override for the shared .6rem label size below — only
  // "Fundraiser" needs this (9 chars is one more than "Fundraising" was
  // wide enough to almost fit, but at 320-390px it still clips to
  // "Fundrai…" without a touch more headroom). Every other tab keeps the
  // shared size untouched.
  labelFontSize?: string;
};

// Final Phase 4 revision: Lucide icons, no emoji, one consistent icon
// family across mobile/desktop nav + Quick Actions (see coachDashboardHelpers.ts,
// desktopNavItems.ts). Destination COUNT is deliberately unchanged here —
// a 5-primary-plus-"More" restructure was evaluated (per the product
// direction) but not implemented this pass; see the Phase 4 final report
// for why and what a follow-up navigation phase would need to do.
const BASE_TABS: Omit<TabConfig, "badgeCount">[] = [
  { href: "home",           label: "Home",           icon: Home },
  // "Communications" (14 chars) doesn't fit this tab's flex width at
  // 320-390px without CSS ellipsis truncating it to "Communi…" — the page
  // itself is still titled "Communications" (see communications/page.tsx);
  // this is only the short nav-tab label.
  { href: "communications", label: "Comms",          icon: Megaphone },
  { href: "calendar",       label: "Calendar",       icon: Calendar },
  { href: "fundraiser",     label: "Fundraiser",     icon: DollarSign, labelFontSize: ".54rem" },
  { href: "shop",           label: "Shop",           icon: ShoppingBag },
  { href: "team",           label: "Team",           icon: Users },
];
const STAFF_TAB: Omit<TabConfig, "badgeCount"> = { href: "sponsors", label: "Sponsors", icon: Handshake };

export default function TeamNav({
  slug,
  showSponsors = false,
  badgeCounts = {},
}: {
  slug: string;
  showSponsors?: boolean;
  badgeCounts?: Record<string, number>;
}) {
  const pathname = usePathname();
  // Visible to every authenticated team role (coaches, boosters, parents,
  // athletes) — Sponsors is view-only for non-coach roles, not hidden from
  // them entirely. Write access is enforced separately (isCoachOnly) inside
  // the page and API routes.
  const tabs = showSponsors ? [...BASE_TABS, STAFF_TAB] : BASE_TABS;

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
      {tabs.map((tab) => {
        const href = `/team/${slug}/${tab.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const badge = badgeCounts[tab.href] ?? 0;

        return (
          <Link
            key={tab.href}
            href={href}
            className="elf-focus-ring"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: ".5rem .25rem .55rem",
              textDecoration: "none",
              // Resolved via the shell root's CSS vars (set by
              // resolveTeamTheme() in layout.tsx) — already respects
              // branding_customized, never reads primary_color raw.
              color: active ? "var(--team-primary)" : "var(--text-muted-app)",
              transition: "color .12s",
              minWidth: 0,
              position: "relative",
              borderRadius: ".4rem",
            }}
          >
            {/* Active indicator — small centered underline, not a filled
                pill background (per the "restrained accent" rule). */}
            {active && (
              <div style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 28,
                height: 2,
                background: "var(--team-primary)",
                borderRadius: 1,
              }} />
            )}
            {/* Icon with optional badge */}
            <div style={{ position: "relative", lineHeight: 1.3 }}>
              <tab.icon aria-hidden="true" size={21} strokeWidth={active ? 2.3 : 2} />
              {badge > 0 && (
                <span style={{
                  position: "absolute",
                  top: -4,
                  right: -7,
                  background: "var(--color-error)",
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
              fontSize: tab.labelFontSize ?? ".6rem",
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
