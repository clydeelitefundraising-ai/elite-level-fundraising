import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getCampaignSettings } from "@/lib/supabase";
import { getAthleteById } from "@/lib/teamData";
import { getCoachById } from "@/lib/platform/coachFundraising";
import { resolveTeamLogoUrl } from "@/lib/shareCopy";

// Dynamic share-link preview image for the public campaign/donor page
// (/campaign/[slug], optionally ?athlete=<id>). Route Handlers (unlike
// the opengraph-image.tsx file convention) fully support query params, so
// this is what campaign/[slug]/page.tsx's generateMetadata points
// openGraph.images at — one route serves both the team-wide and the
// athlete-specific share image. Uses the team's actual primary/secondary
// color (campaign_settings) as the accent, falling back to the ELF brand
// navy — same "default ELF theme, coach-selected team colors as accent"
// rule the rest of the app follows (no team color ever hard-coded here).
//
// The team's own logo (resolveTeamLogoUrl — same team_photo/logo_url
// precedence as TeamHeader.tsx's header cluster) is the primary visual
// here, never an ELF logo standing in for it. Both settings and the logo
// resolution happen fresh on every request, so editing a team's logo
// immediately changes newly generated previews with no separate cache to
// invalidate. When no logo is configured, falls back to the same
// initials-badge treatment the header falls back to, rather than a
// separate/invented placeholder.
export const alt = "Elite Level Fundraising";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DEFAULT_INK = "#0B1E3D";
const PAPER = "#F6F5F1";

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const athleteId = req.nextUrl.searchParams.get("athlete");
  const coachId = req.nextUrl.searchParams.get("coach");

  const settings = slug ? await getCampaignSettings(slug) : null;
  const athlete = athleteId ? await getAthleteById(athleteId) : null;
  const coach = (!athlete && coachId && slug) ? await getCoachById(coachId, slug) : null;

  const accent = settings?.primary_color || DEFAULT_INK;
  const teamLabel = [settings?.school_name, settings?.mascot, settings?.sport_name].filter(Boolean).join(" ") || "Elite Level Fundraising";
  const heading = athlete
    ? `Support ${athlete.name}`
    : coach
    ? `Support Coach ${coach.name}`
    : `Support ${settings?.school_name ?? "Our Team"}`;
  const logoUrl = resolveTeamLogoUrl(settings);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: PAPER,
          padding: "0 80px",
        }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            width={120}
            height={120}
            style={{ objectFit: "contain", borderRadius: "50%", background: "#FFFFFF", border: `2px solid ${accent}`, marginBottom: 22 }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              width: 120,
              height: 120,
              borderRadius: "50%",
              background: "#FFFFFF",
              border: `2px solid ${accent}`,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 42,
              fontWeight: 800,
              color: DEFAULT_INK,
              marginBottom: 22,
            }}
          >
            {initials(settings?.school_name || "Elite Level Fundraising")}
          </div>
        )}
        <div style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: "0.08em", color: accent, opacity: 0.65, marginBottom: 18 }}>
          ELITE LEVEL FUNDRAISING
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: DEFAULT_INK, textAlign: "center", letterSpacing: "-0.01em" }}>
          {heading}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 30, color: accent, textAlign: "center" }}>
          {teamLabel}
        </div>
        <div style={{ display: "flex", marginTop: 36, width: 160, height: 6, borderRadius: 100, background: accent }} />
      </div>
    ),
    { ...size },
  );
}
