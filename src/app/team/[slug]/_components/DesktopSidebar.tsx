"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CampaignSettings } from "@/lib/supabase";
import type { TeamSummary } from "@/lib/accountSession";
import AccountMenu from "./AccountMenu";
import { buildDesktopNavItems, isDesktopNavItemActive } from "./desktopNavItems";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

/** Phase D1 desktop shell sidebar — visible only at desktop widths (see
 *  TeamShell.module.css's `.desktopOnly`, always mounted, CSS-hidden on
 *  mobile). Deliberately visually distinct from the two unrelated admin
 *  shells (src/app/admin/AdminShell.tsx, src/app/team-app-admin/
 *  AdminSidebar.tsx) — this belongs to ELF Team, not to either admin
 *  panel, and shares no code with them.
 *
 *  Team identity + switching reuses AccountMenu verbatim — the SAME
 *  component TeamHeader already renders on mobile, fed the SAME
 *  accountTeams/accountName/profilePhotoUrl the layout already fetches.
 *  No new data source, no second team-switching implementation. */
export default function DesktopSidebar({
  slug,
  settings,
  showSponsors,
  showRequests,
  communicationsBadge,
  messagesBadge,
  donorCount,
  pendingRequestCount,
  accountTeams,
  accountName,
  profilePhotoUrl,
  isAuthenticated,
}: {
  slug: string;
  settings: CampaignSettings;
  showSponsors: boolean;
  showRequests: boolean;
  communicationsBadge: number;
  messagesBadge: number;
  donorCount: number;
  pendingRequestCount: number;
  accountTeams: TeamSummary[];
  accountName?: string;
  profilePhotoUrl?: string | null;
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const sport = [settings.mascot, settings.sport_name].filter(Boolean).join(" · ");

  const items = buildDesktopNavItems({
    showSponsors,
    showRequests,
    communicationsBadge,
    messagesBadge,
    donorCount,
    pendingRequestCount,
  });

  return (
    // role="navigation" (not the implicit landmark from <aside> alone) is
    // deliberate: it matches TeamNav.tsx's own convention exactly, and is
    // what the EXISTING print rules in Calendar/Settings/FollowUps
    // (`[role="navigation"] { display: none !important; }`) already key
    // off of — this sidebar is hidden at print time for free, with zero
    // changes to any of those three files.
    <aside
      role="navigation"
      aria-label="Team Hub navigation"
      style={{
        // D1b: 264 -> 268 (within the approved 250-270px range) plus
        // tighter identity-row spacing below — together these gave the
        // school/team name meaningfully more room before truncating,
        // per 1440px QA ("Monroe Valley ..." truncating too aggressively).
        width: 268,
        flexShrink: 0,
        minHeight: "100vh",
        background: "#0b1e3d",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
      }}
    >
      {/* D1b: horizontal padding and gap trimmed slightly (1rem->.85rem,
          .65rem->.5rem) purely to reclaim width for the identity text
          column below — avatar size, AccountMenu, and TeamSwitcher
          behavior are all unchanged. */}
      <div style={{
        padding: "1.25rem .85rem",
        display: "flex",
        alignItems: "center",
        gap: ".5rem",
        borderBottom: "1px solid rgba(255,255,255,.14)",
      }}>
        {(settings.team_photo || settings.logo_url) ? (
          <img
            src={settings.team_photo || settings.logo_url}
            alt={settings.school_name}
            style={{
              width: 44, height: 44, objectFit: "contain", flexShrink: 0,
              borderRadius: "50%", background: "rgba(255,255,255,.16)",
              border: "2px solid rgba(255,255,255,.3)", padding: 3,
            }}
          />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,.16)", border: "2px solid rgba(255,255,255,.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: ".85rem", flexShrink: 0,
          }}>
            {initials(settings.school_name)}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: ".92rem", lineHeight: 1.2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {settings.school_name}
          </div>
          {sport && (
            <div style={{ fontSize: ".7rem", opacity: .75, marginTop: ".1rem" }}>
              {sport}
            </div>
          )}
        </div>

        {isAuthenticated && (
          <AccountMenu
            currentSlug={slug}
            teams={accountTeams}
            accountName={accountName}
            profilePhotoUrl={profilePhotoUrl}
          />
        )}
      </div>

      <nav aria-label="Team Hub sections" style={{
        flex: 1, padding: ".75rem .6rem", display: "flex", flexDirection: "column", gap: ".15rem",
      }}>
        {items.map(item => {
          const href = `/team/${slug}/${item.href}`;
          const active = isDesktopNavItemActive(pathname, slug, item.href);
          const badge = item.badge ?? 0;

          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? "page" : undefined}
              style={{
                display: "flex", alignItems: "center", gap: ".65rem",
                padding: ".78rem .7rem", borderRadius: ".55rem", minHeight: 44,
                textDecoration: "none",
                color: active ? "#0b1e3d" : "rgba(255,255,255,.85)",
                background: active ? "#fff" : "transparent",
                fontWeight: active ? 700 : 500,
                fontSize: ".88rem",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: "1.05rem", width: 20, textAlign: "center", flexShrink: 0 }}>
                {item.icon}
              </span>
              <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.label}
              </span>
              {badge > 0 && (
                <span
                  aria-label={`${badge} unread`}
                  style={{
                    background: "#dc2626", color: "#fff", borderRadius: 100,
                    fontSize: ".68rem", fontWeight: 700, padding: ".08rem .4rem",
                    lineHeight: 1.5, minWidth: 18, textAlign: "center", flexShrink: 0,
                  }}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
