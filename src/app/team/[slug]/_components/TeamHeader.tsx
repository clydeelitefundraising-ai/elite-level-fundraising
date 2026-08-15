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
  profilePhotoUrl,
  isAuthenticated = false,
}: {
  settings:         CampaignSettings;
  unreadNotifCount?: number;
  showBell?:         boolean;
  accountTeams?:     TeamSummary[];
  accountName?:      string;
  profilePhotoUrl?:  string | null;
  isAuthenticated?:  boolean;
}) {
  const sport  = [settings.mascot, settings.sport_name].filter(Boolean).join(" · ");
  const season = settings.season ?? "";

  return (
    // Phase 4C: id exists solely so Calendar's print stylesheet can hide
    // app chrome (`@media print`) without duplicating this component into
    // a separate print route. No behavior/visual change on screen.
    <div id="elf-team-header" style={{ background: settings.primary_color, color: "#fff" }}>
      <div style={{ padding: "1rem 1rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        {/* Team avatar */}
        {(settings.team_photo || settings.logo_url) ? (
          <img
            src={settings.team_photo || settings.logo_url}
            alt={settings.school_name}
            style={{ width: 58, height: 58, objectFit: "contain", flexShrink: 0, borderRadius: "50%", background: "rgba(255,255,255,.22)", border: "2px solid rgba(255,255,255,.4)", padding: 4 }}
          />
        ) : (
          <div style={{ width: 58, height: 58, borderRadius: "50%", background: "rgba(255,255,255,.2)", border: "2px solid rgba(255,255,255,.4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.15rem", flexShrink: 0 }}>
            {initials(settings.school_name)}
          </div>
        )}

        {/* Team identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.15rem", lineHeight: 1.2, letterSpacing: "-.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {settings.school_name}
          </div>
          {sport && (
            <div style={{ fontSize: ".8rem", opacity: .85, marginTop: ".18rem", fontWeight: 500 }}>
              {sport}
            </div>
          )}
          {season && (
            <div style={{ fontSize: ".67rem", opacity: .6, marginTop: ".1rem", letterSpacing: ".03em", textTransform: "uppercase" }}>
              {season}
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
              profilePhotoUrl={profilePhotoUrl}
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
