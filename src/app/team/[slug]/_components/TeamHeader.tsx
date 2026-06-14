import Link from "next/link";
import type { CampaignSettings } from "@/lib/supabase";
import type { TeamSummary } from "@/lib/accountSession";
import NotificationBell from "./NotificationBell";
import PushOptIn from "./PushOptIn";
import AccountMenu from "./AccountMenu";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

export default function TeamHeader({
  settings,
  unreadNotifCount = 0,
  showBell = false,
  accountTeams = [],
  accountName,
  isAuthenticated = false,
}: {
  settings: CampaignSettings;
  unreadNotifCount?: number;
  showBell?: boolean;
  accountTeams?: TeamSummary[];
  accountName?: string;
  isAuthenticated?: boolean;
}) {
  const sport = [settings.mascot, settings.sport_name].filter(Boolean).join(" · ");

  return (
    <div style={{ background: settings.primary_color, color: "#fff" }}>
      <div style={{ padding: ".75rem 1rem", display: "flex", alignItems: "center", gap: ".875rem" }}>
        {/* Team avatar */}
        {(settings.team_photo || settings.logo_url) ? (
          <img
            src={settings.team_photo || settings.logo_url}
            alt={settings.school_name}
            style={{ width: 46, height: 46, objectFit: "contain", flexShrink: 0, borderRadius: "50%", background: "rgba(255,255,255,.22)", border: "2px solid rgba(255,255,255,.38)", padding: 3 }}
          />
        ) : (
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(255,255,255,.2)", border: "2px solid rgba(255,255,255,.38)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1rem", flexShrink: 0 }}>
            {initials(settings.school_name)}
          </div>
        )}

        {/* Team identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.15, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {settings.school_name}
          </div>
          {sport && (
            <div style={{ fontSize: ".75rem", opacity: .82, marginTop: ".1rem", fontWeight: 500 }}>
              {sport}
            </div>
          )}
        </div>

        {/* Icon tray */}
        <div style={{ display: "flex", gap: ".35rem", flexShrink: 0, alignItems: "center" }}>
          {showBell && (
            <NotificationBell
              slug={settings.campaign_slug}
              initialCount={unreadNotifCount}
            />
          )}
          {isAuthenticated && (
            <AccountMenu
              currentSlug={settings.campaign_slug}
              teams={accountTeams}
              accountName={accountName}
            />
          )}
          {!isAuthenticated && (
            <Link
              href={`/team/${settings.campaign_slug}/settings`}
              aria-label="Team settings"
              style={{ fontSize: "1.1rem", opacity: .75, padding: ".3rem", lineHeight: 1, display: "block", textDecoration: "none" }}
            >
              ⚙️
            </Link>
          )}
        </div>
      </div>

      <div style={{ background: settings.secondary_color || "rgba(255,255,255,.2)", height: 3 }} />
    </div>
  );
}
