"use client";

import Image from "next/image";
import type { TeamSummary } from "@/lib/accountSession";
import { teamRoleLabel } from "@/lib/permissions";

export default function TeamsView({
  teams,
  accountName,
}: {
  teams: TeamSummary[];
  accountName: string;
}) {
  const initial = accountName.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");

  return (
    <div style={{ minHeight: "100vh", background: "#0b1e3d", display: "flex", justifyContent: "center", alignItems: "flex-start", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", background: "#f5f6f8", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ background: "#0b1e3d", padding: "1.1rem 1rem .9rem", display: "flex", alignItems: "center", gap: ".875rem" }}>
          <Image src="/ELF.LOGO.png" alt="ELF" width={34} height={34} style={{ borderRadius: ".45rem", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: ".95rem", lineHeight: 1.2 }}>Choose Your Team</div>
            <div style={{ color: "rgba(255,255,255,.55)", fontSize: ".72rem", marginTop: ".05rem" }}>Select the team you want to enter</div>
          </div>
          {/* Account avatar */}
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,.15)", border: "1.5px solid rgba(255,255,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: ".65rem", flexShrink: 0 }}>
            {initial}
          </div>
        </div>
        <div style={{ height: 3, background: "#C4A35A" }} />

        {/* Welcome blurb */}
        <div style={{ padding: "1.25rem 1.25rem .75rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#0b1e3d", letterSpacing: "-.01em" }}>
            Welcome back, {accountName.split(" ")[0]}
          </div>
          <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".2rem" }}>
            {teams.length === 0
              ? "You're not on any teams yet."
              : teams.length === 1
              ? "Your team is ready."
              : `You're on ${teams.length} teams.`}
          </div>
        </div>

        {/* Team cards */}
        <div style={{ padding: "0 1.25rem", display: "flex", flexDirection: "column", gap: ".65rem", flex: 1 }}>
          {teams.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 0" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: ".75rem" }}>🏫</div>
              <p style={{ color: "#6b7280", margin: "0 0 1.25rem", fontSize: ".9rem", lineHeight: 1.5 }}>
                No teams linked yet.
              </p>
              <a
                href="/enter-code"
                style={{ display: "inline-block", background: "#0b1e3d", color: "#fff", padding: ".85rem 1.75rem", borderRadius: ".85rem", textDecoration: "none", fontWeight: 700, fontSize: ".95rem" }}
              >
                Enter Team Code
              </a>
            </div>
          ) : (
            teams.map(team => (
              <a
                key={team.campaign_slug}
                href={`/team/${team.campaign_slug}/home`}
                style={{ display: "block", textDecoration: "none", borderRadius: "1rem", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,.09)", background: "#fff" }}
              >
                {/* Color strip */}
                <div style={{ height: 5, background: team.primary_color || "#0b1e3d" }} />
                <div style={{ padding: ".9rem 1rem", display: "flex", alignItems: "center", gap: ".875rem" }}>
                  {/* Team avatar / logo */}
                  {team.logo_url ? (
                    <img
                      src={team.logo_url}
                      alt=""
                      style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", flexShrink: 0, boxShadow: `0 2px 8px ${team.primary_color || "#0b1e3d"}55` }}
                    />
                  ) : (
                    <div style={{
                      width: 46, height: 46, borderRadius: "50%",
                      background: team.primary_color || "#0b1e3d",
                      flexShrink: 0, display: "flex", alignItems: "center",
                      justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1.15rem",
                      boxShadow: `0 2px 8px ${team.primary_color || "#0b1e3d"}55`,
                    }}>
                      {team.school_name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                      <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {team.school_name}
                      </div>
                      {team.role && (
                        <span style={{
                          flexShrink: 0, background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100,
                          fontSize: ".58rem", fontWeight: 700, padding: ".12rem .45rem", textTransform: "uppercase", letterSpacing: ".03em",
                        }}>
                          {teamRoleLabel(team.role, team.role_kind)}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: ".78rem", color: "#6b7280", marginTop: ".18rem" }}>
                      {[team.mascot, team.sport_name].filter(Boolean).join(" · ") || "Team Hub"}
                      {team.season && ` · ${team.season}`}
                    </div>
                  </div>

                  <div style={{
                    flexShrink: 0, display: "flex", alignItems: "center", gap: ".3rem",
                    color: team.primary_color || "#0b1e3d", fontSize: ".78rem", fontWeight: 700,
                  }}>
                    Enter Team <span style={{ fontSize: "1.1rem" }}>›</span>
                  </div>
                </div>
              </a>
            ))
          )}

          {teams.length > 0 && (
            <a
              href="/enter-code"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
                marginTop: ".25rem", marginBottom: ".5rem", padding: ".75rem",
                border: "1.5px dashed #c7cad1", borderRadius: "1rem",
                fontSize: ".85rem", color: "#0b1e3d", fontWeight: 700, textDecoration: "none",
              }}
            >
              + Add Team
            </a>
          )}
        </div>

        {/* Sign out */}
        <div style={{ padding: "1rem 1.25rem 1.5rem", textAlign: "center", borderTop: "1px solid #eaecef" }}>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" style={{ background: "none", border: "none", fontSize: ".8rem", color: "#9ca3af", cursor: "pointer" }}>
              Sign Out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
