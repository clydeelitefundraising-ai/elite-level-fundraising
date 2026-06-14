"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamSummary } from "@/lib/accountSession";

export default function TeamSwitcher({
  currentSlug,
  teams,
}: {
  currentSlug: string;
  teams: TeamSummary[];
}) {
  const [open, setOpen] = useState(false);
  const router          = useRouter();

  // Only render the switcher when there's more than one team to switch to
  if (teams.length <= 1) return null;

  function switchTo(slug: string) {
    setOpen(false);
    router.push(`/team/${slug}/home`);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Switch team"
        aria-expanded={open}
        style={{
          background: "rgba(255,255,255,.18)",
          border: "1.5px solid rgba(255,255,255,.32)",
          color: "#fff",
          borderRadius: ".4rem",
          padding: ".3rem .55rem",
          fontSize: ".75rem",
          fontWeight: 700,
          cursor: "pointer",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          gap: ".25rem",
        }}
      >
        ⇄ Switch
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(0,0,0,.4)" }}
          />

          {/* Dropdown panel */}
          <div style={{
            position: "absolute",
            top: "calc(100% + .5rem)",
            right: 0,
            zIndex: 100,
            background: "#fff",
            borderRadius: ".75rem",
            boxShadow: "0 8px 32px rgba(0,0,0,.22)",
            minWidth: 210,
            overflow: "hidden",
          }}>
            <div style={{ padding: ".6rem 1rem", fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em", borderBottom: "1px solid #f0f0f0" }}>
              Your Teams
            </div>

            {teams.map(team => {
              const isCurrent = team.campaign_slug === currentSlug;
              return (
                <button
                  key={team.campaign_slug}
                  onClick={() => !isCurrent && switchTo(team.campaign_slug)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: ".75rem",
                    padding: ".8rem 1rem",
                    border: "none",
                    borderBottom: "1px solid #f5f5f5",
                    background: isCurrent ? "#f5f6f8" : "#fff",
                    cursor: isCurrent ? "default" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: team.primary_color || "#0b1e3d",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: ".75rem",
                  }}>
                    {team.school_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: ".88rem", fontWeight: 700, color: "#0b1e3d", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {team.school_name}
                    </div>
                    <div style={{ fontSize: ".72rem", color: "#6b7280" }}>{team.sport_name}</div>
                  </div>
                  {isCurrent && (
                    <span style={{ fontSize: ".72rem", color: "#22c55e", fontWeight: 800 }}>✓</span>
                  )}
                </button>
              );
            })}

            <a
              href="/teams"
              onClick={() => setOpen(false)}
              style={{ display: "block", padding: ".75rem 1rem", fontSize: ".82rem", color: "#0b1e3d", fontWeight: 600, textDecoration: "none", textAlign: "center", borderTop: "1px solid #f0f0f0" }}
            >
              All Teams
            </a>
            <form method="POST" action="/api/auth/logout" style={{ borderTop: "1px solid #f0f0f0" }}>
              <button
                type="submit"
                style={{ width: "100%", padding: ".75rem 1rem", background: "none", border: "none", fontSize: ".82rem", color: "#9ca3af", cursor: "pointer", textAlign: "center" }}
              >
                Sign Out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
