"use client";

import { Home, Megaphone, Calendar, DollarSign, ShoppingBag, Users, Handshake, Bell, type LucideIcon } from "lucide-react";
import ElfMark from "@/app/team/[slug]/_components/ElfMark";
import { DEMO_SLUG, DEMO_TEAM } from "./demoData";

// The Team App's mobile chrome, reproduced for the demo.
//
// The real TeamHeader and TeamNav can't be mounted here: they use
// next/link (which prefetches real /team routes), usePathname, the live
// notification bell and the account drawer. These twins copy their markup
// and inline styles exactly — teamAppDemo.test.ts compares the style
// declarations against the real components so the two can't drift — and
// render plain anchors whose clicks TeamAppDemo intercepts.

// ── Header (twin of _components/TeamHeader.tsx) ─────────────────────────────

function initialsOf(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

export function DemoTeamHeader({ accountName, isMember, onAccount }: { accountName: string; isMember: boolean; onAccount: () => void }) {
  const sport  = [DEMO_TEAM.mascot, DEMO_TEAM.sportName].filter(Boolean).join(" · ");
  const season = DEMO_TEAM.season;
  const initial = initialsOf(accountName);

  return (
    <div id="elf-team-header" style={{ background: "var(--canvas)", color: "var(--text-primary-app)", borderBottom: "1px solid var(--border-app)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div style={{ padding: ".55rem 1rem .85rem", display: "flex", alignItems: "center", gap: ".85rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexShrink: 0 }}>
          <ElfMark />
          {/* eslint-disable-next-line @next/next/no-img-element -- same plain <img> as TeamHeader's team logo */}
          <img
            src={DEMO_TEAM.logoUrl}
            alt={DEMO_TEAM.schoolName}
            style={{ width: 44, height: 44, objectFit: "contain", flexShrink: 0, borderRadius: "50%", background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)", padding: 3 }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.02rem", lineHeight: 1.2, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {DEMO_TEAM.schoolName}
          </div>
          {(sport || season) && (
            <div style={{ fontSize: ".74rem", color: "var(--text-muted-app)", marginTop: ".15rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {[sport, season].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: ".4rem", flexShrink: 0, alignItems: "center" }}>
          {/* Twin of NotificationBell (members only, as in layout.tsx's showBell={isMember}). */}
          {isMember && (
            <a
              href={`/team/${DEMO_SLUG}/notifications`}
              aria-label="Notifications"
              className="elf-focus-ring"
              style={{
                position: "relative",
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "var(--surface-light-elevated)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                flexShrink: 0,
                textDecoration: "none",
                transition: "background .18s ease",
              }}
            >
              <Bell aria-hidden="true" size={17} strokeWidth={2.1} />
            </a>
          )}
          {/* Twin of AccountMenu's trigger button (the drawer itself is not part of the demo). */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={onAccount}
              aria-label="Account menu"
              className="elf-focus-ring"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "var(--surface-light-elevated)",
                border: "1.5px solid var(--border-app)",
                color: "var(--text-primary-app)",
                fontWeight: 800,
                fontSize: initial ? ".65rem" : ".9rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                letterSpacing: ".01em",
                lineHeight: 1,
                overflow: "hidden",
                padding: 0,
              }}
            >
              {initial}
            </button>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--team-secondary)", height: 3 }} />
    </div>
  );
}

// ── Bottom navigation (twin of _components/TeamNav.tsx) ─────────────────────

type TabConfig = { href: string; label: string; icon: LucideIcon; labelFontSize?: string };

/** Same tabs, order, labels and icons as TeamNav's BASE_TABS + STAFF_TAB. */
export const DEMO_BASE_TABS: TabConfig[] = [
  { href: "home",           label: "Home",           icon: Home },
  { href: "communications", label: "Comms",          icon: Megaphone },
  { href: "calendar",       label: "Calendar",       icon: Calendar },
  { href: "fundraiser",     label: "Fundraiser",     icon: DollarSign, labelFontSize: ".54rem" },
  { href: "shop",           label: "Shop",           icon: ShoppingBag },
  { href: "team",           label: "Team",           icon: Users },
];
export const DEMO_STAFF_TAB: TabConfig = { href: "sponsors", label: "Partners", icon: Handshake };

export function DemoTeamNav({
  active: activeHref,
  showSponsors,
  showFundraiser,
  badgeCounts = {},
}: {
  active: string;
  showSponsors: boolean;
  showFundraiser: boolean;
  badgeCounts?: Record<string, number>;
}) {
  const baseTabs = showFundraiser ? DEMO_BASE_TABS : DEMO_BASE_TABS.filter(t => t.href !== "fundraiser");
  const tabs = showSponsors ? [...baseTabs, DEMO_STAFF_TAB] : baseTabs;

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
        const href = `/team/${DEMO_SLUG}/${tab.href}`;
        const active = tab.href === activeHref;
        const badge = badgeCounts[tab.href] ?? 0;

        return (
          <a
            key={tab.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="elf-focus-ring"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: ".5rem .25rem .55rem",
              textDecoration: "none",
              color: active ? "var(--team-primary)" : "var(--text-muted-app)",
              transition: "color .12s",
              minWidth: 0,
              position: "relative",
              borderRadius: ".4rem",
            }}
          >
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
          </a>
        );
      })}
    </div>
  );
}
