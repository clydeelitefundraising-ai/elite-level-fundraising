import type { CampaignSettings } from "@/lib/supabase";
import { LeaderboardSection, type LeaderboardEntry } from "../FundraiserView";

// Full leaderboard page — reuses the exact same LeaderboardSection
// component (and therefore the exact same ranking/tie behavior and visual
// style) as the Top Fundraisers summary on the main fundraiser page, just
// with no `limit` so every participant renders.
export default function LeaderboardView({
  slug,
  settings,
  leaderboard,
  currentAthleteId,
}: {
  slug:             string;
  settings:         CampaignSettings;
  leaderboard:      LeaderboardEntry[];
  currentAthleteId: string;
}) {
  const primary = settings.primary_color ?? "#0b1e3d";

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".65rem" }}>
        <a
          href={`/team/${slug}/fundraiser`}
          style={{ display: "inline-flex", alignItems: "center", gap: ".3rem", fontSize: ".78rem", fontWeight: 600, color: "#6b7280", textDecoration: "none", marginBottom: ".35rem" }}
        >
          ← Fundraiser
        </a>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Full Leaderboard
        </h2>
      </div>

      {leaderboard.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 16, padding: "2rem 1.25rem", textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", color: "#9ca3af", fontSize: ".85rem",
        }}>
          No participants yet.
        </div>
      ) : (
        <LeaderboardSection
          leaderboard={leaderboard}
          currentAthleteId={currentAthleteId}
          primary={primary}
          title="Full Leaderboard"
          subtitle={`All ${leaderboard.length} participant${leaderboard.length !== 1 ? "s" : ""}, ranked by amount raised.`}
        />
      )}
    </div>
  );
}
