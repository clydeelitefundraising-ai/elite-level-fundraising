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
    //
    // Phase 3: was a full-width filled team-color band (`background:
    // settings.primary_color`) — live QA flagged this as too much
    // school-color surface for "accent only." Now white/warm-white with
    // near-black text like the rest of the shell; the team's accent shows
    // up only as the thin bottom rule below, via var(--team-secondary)
    // (already branding_customized-aware through the shell root's CSS
    // vars, unlike the old raw settings.secondary_color read).
    <div id="elf-team-header" style={{ background: "var(--canvas)", color: "var(--text-primary-app)", borderBottom: "1px solid var(--border-app)" }}>
      <div style={{ padding: ".85rem 1rem", display: "flex", alignItems: "center", gap: ".85rem" }}>
        {/* Team avatar */}
        {(settings.team_photo || settings.logo_url) ? (
          <img
            src={settings.team_photo || settings.logo_url}
            alt={settings.school_name}
            style={{ width: 44, height: 44, objectFit: "contain", flexShrink: 0, borderRadius: "50%", background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)", padding: 3 }}
          />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: ".95rem", color: "var(--text-primary-app)", flexShrink: 0 }}>
            {initials(settings.school_name)}
          </div>
        )}

        {/* Team identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.02rem", lineHeight: 1.2, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {settings.school_name}
          </div>
          {(sport || season) && (
            <div style={{ fontSize: ".74rem", color: "var(--text-muted-app)", marginTop: ".15rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {[sport, season].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>

        {/* Icon tray */}
        <div style={{ display: "flex", gap: ".25rem", flexShrink: 0, alignItems: "center" }}>
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
              className="elf-focus-ring"
              style={{ fontSize: "1.1rem", opacity: .75, padding: ".3rem", lineHeight: 1, display: "block", textDecoration: "none", borderRadius: ".4rem" }}
            >
              ⚙️
            </Link>
          )}
        </div>
      </div>

      {/* Selective accent — the header's one deliberate "this is your
          team" moment, not a full color field. */}
      <div style={{ background: "var(--team-secondary)", height: 3 }} />
    </div>
  );
}
