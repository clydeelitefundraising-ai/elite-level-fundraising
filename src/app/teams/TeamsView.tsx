"use client";

import type { TeamSummary } from "@/lib/accountSession";

export default function TeamsView({
  teams,
  accountName,
}: {
  teams: TeamSummary[];
  accountName: string;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#0b1e3d", display: "flex", justifyContent: "center", alignItems: "flex-start", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", background: "#f5f6f8", display: "flex", flexDirection: "column" }}>

        <div style={{ background: "#0b1e3d", padding: "1.25rem 1rem", color: "#fff" }}>
          <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>Welcome, {accountName}</div>
          <div style={{ fontSize: ".82rem", opacity: .7, marginTop: ".2rem" }}>Select your team</div>
        </div>

        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: ".75rem", flex: 1 }}>
          {teams.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: ".75rem" }}>🏫</div>
              <p style={{ color: "#6b7280", margin: "0 0 1.25rem", fontSize: ".95rem" }}>You&apos;re not on any teams yet.</p>
              <a
                href="/enter-code"
                style={{ display: "inline-block", background: "#0b1e3d", color: "#fff", padding: ".85rem 1.75rem", borderRadius: ".75rem", textDecoration: "none", fontWeight: 700, fontSize: ".95rem" }}
              >
                Enter Team Code
              </a>
            </div>
          ) : (
            teams.map(team => (
              <a
                key={team.campaign_slug}
                href={`/team/${team.campaign_slug}/home`}
                style={{ display: "flex", alignItems: "center", gap: "1rem", background: "#fff", borderRadius: ".75rem", padding: "1rem", textDecoration: "none", boxShadow: "0 1px 4px rgba(0,0,0,.07)" }}
              >
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: team.primary_color || "#0b1e3d", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>
                  {team.school_name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#0b1e3d", fontSize: "1rem" }}>{team.school_name}</div>
                  <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".15rem" }}>
                    {[team.mascot, team.sport_name].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div style={{ color: "#9ca3af", fontSize: "1.2rem" }}>›</div>
              </a>
            ))
          )}

          {teams.length > 0 && (
            <div style={{ textAlign: "center", marginTop: ".5rem" }}>
              <a href="/enter-code" style={{ fontSize: ".88rem", color: "#0b1e3d", fontWeight: 600, textDecoration: "underline" }}>
                + Join another team
              </a>
            </div>
          )}
        </div>

        <div style={{ padding: "1rem", textAlign: "center" }}>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" style={{ background: "none", border: "none", fontSize: ".78rem", color: "#9ca3af", cursor: "pointer", textDecoration: "underline" }}>
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
