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
// Phase 2.1 — user-facing label only. href stays "sponsors": the route
// and existing deep links are unchanged; only the visible tab text
// becomes "Partners" ahead of the route's own two-tab Partners experience.
const STAFF_TAB: Omit<TabConfig, "badgeCount"> = { href: "sponsors", label: "Partners", icon: Handshake };

export default function TeamNav({
  slug,
  showSponsors = false,
  // Phase F1b — computed once in layout.tsx via permissions.ts's
  // shouldShowFundraisingNav(), the same shared decision
  // desktopNavItems.ts's buildDesktopNavItems() uses. Defaults to true so
  // this never silently hides the tab for a caller that hasn't been
  // updated to pass it explicitly.
  showFundraiser = true,
  badgeCounts = {},
}: {
  slug: string;
  showSponsors?: boolean;
  showFundraiser?: boolean;
  badgeCounts?: Record<string, number>;
}) {
  const pathname = usePathname();
  // Visible to every authenticated team role (coaches, boosters, parents,
  // athletes) — Sponsors is view-only for non-coach roles, not hidden from
  // them entirely. Write access is enforced separately (isCoachOnly) inside
  // the page and API routes.
  const baseTabs = showFundraiser ? BASE_TABS : BASE_TABS.filter(t => t.href !== "fundraiser");
  const tabs = showSponsors ? [...baseTabs, STAFF_TAB] : baseTabs;

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
