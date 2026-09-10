import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getCampaignSettings } from "@/lib/supabase";
import { getAthleteById } from "@/lib/teamData";

// Dynamic share-link preview image for the public campaign/donor page
// (/campaign/[slug], optionally ?athlete=<id>). Route Handlers (unlike
// the opengraph-image.tsx file convention) fully support query params, so
// this is what campaign/[slug]/page.tsx's generateMetadata points
// openGraph.images at — one route serves both the team-wide and the
// athlete-specific share image. Uses the team's actual primary/secondary
// color (campaign_settings) as the accent, falling back to the ELF brand
// navy — same "default ELF theme, coach-selected team colors as accent"
// rule the rest of the app follows (no team color ever hard-coded here).
export const alt = "Elite Level Fundraising";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DEFAULT_INK = "#0B1E3D";
const PAPER = "#F6F5F1";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  const athleteId = req.nextUrl.searchParams.get("athlete");

  const settings = slug ? await getCampaignSettings(slug) : null;
  const athlete = athleteId ? await getAthleteById(athleteId) : null;

  const accent = settings?.primary_color || DEFAULT_INK;
  const teamLabel = [settings?.school_name, settings?.mascot, settings?.sport_name].filter(Boolean).join(" ") || "Elite Level Fundraising";
  const heading = athlete ? `Support ${athlete.name}` : `Support ${settings?.school_name ?? "Our Team"}`;

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
        <div style={{ display: "flex", fontSize: 22, fontWeight: 700, letterSpacing: "0.08em", color: accent, opacity: 0.75, marginBottom: 18 }}>
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
