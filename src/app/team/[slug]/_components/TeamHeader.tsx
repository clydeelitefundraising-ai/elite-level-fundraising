import Link from "next/link";
import type { CampaignSettings } from "@/lib/supabase";
import PushOptIn from "./PushOptIn";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

export default function TeamHeader({ settings }: { settings: CampaignSettings }) {
  const sport = [settings.mascot, settings.sport_name].filter(Boolean).join(" · ");
  const meta  = [settings.location, settings.season].filter(Boolean).join(" · ");

  return (
    <div style={{ background: settings.primary_color, color: "#fff" }}>
      <div style={{
        padding: "1.1rem 1rem 1rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
      }}>
        {/* Avatar circle — logo if available, initials fallback */}
        {(settings.team_photo || settings.logo_url) ? (
          <img
            src={settings.team_photo || settings.logo_url}
            alt={settings.school_name}
            style={{
              width: 60,
              height: 60,
              objectFit: "contain",
              flexShrink: 0,
              borderRadius: "50%",
              background: "rgba(255,255,255,.28)",
              border: "2px solid rgba(255,255,255,.45)",
              padding: 4,
            }}
          />
        ) : (
          <div style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "rgba(255,255,255,.28)",
            border: "2px solid rgba(255,255,255,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "1.2rem",
            flexShrink: 0,
          }}>
            {initials(settings.school_name)}
          </div>
        )}

        {/* School name + sport/season */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.2rem", lineHeight: 1.15, letterSpacing: "-.01em" }}>
            {settings.school_name}
          </div>
          {sport && (
            <div style={{ fontSize: ".82rem", opacity: .85, marginTop: ".2rem", fontWeight: 500 }}>
              {sport}
            </div>
          )}
          {meta && (
            <div style={{ fontSize: ".68rem", opacity: .65, marginTop: ".1rem", letterSpacing: ".04em", textTransform: "uppercase" }}>
              {meta}
            </div>
          )}
        </div>

        {/* Icon tray — push opt-in bell + settings/login */}
        <div style={{ display: "flex", gap: ".15rem", flexShrink: 0, alignItems: "center" }}>
          <PushOptIn slug={settings.campaign_slug} />
          <Link
            href={`/team/${settings.campaign_slug}/login`}
            aria-label="Coach login"
            style={{ fontSize: "1.2rem", opacity: .75, padding: ".3rem", lineHeight: 1, display: "block", textDecoration: "none" }}
          >
            ⚙️
          </Link>
        </div>
      </div>

      {/* Secondary color accent bar */}
      <div style={{ background: settings.secondary_color || "rgba(255,255,255,.2)", height: 3 }} />
    </div>
  );
}
