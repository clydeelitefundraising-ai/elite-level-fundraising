"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DEMO_PERSONAS, DEMO_SLUG, type DemoPersonaId } from "@/lib/demoPersonas";
import type { DemoStatus } from "./page";

type Props = { status: DemoStatus };

const isReady = (s: DemoStatus) =>
  s.campaignExists && s.coachExists && s.athleteExists && s.parentExists;

const LAUNCH_ERROR_MSGS: Record<string, string> = {
  no_coach:          "Demo coach account not found. Run Initialize to set up the demo environment.",
  no_athlete:        "Demo athlete account not found. Run Initialize to set up the demo environment.",
  no_parent:         "Demo parent account not found. Run Initialize to set up the demo environment.",
  no_athlete_member: "Athlete is not linked to the demo campaign. Run Initialize to repair.",
  no_parent_member:  "Parent is not linked to the demo campaign. Run Initialize to repair.",
  admin_config:      "Admin configuration error — check ADMIN_PASSWORD and ADMIN_PEPPER environment variables.",
};

export default function DemoView({ status }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const launchErr    = searchParams.get("launch_error");

  const [seeding,   setSeeding]   = useState(false);
  const [seedMsg,   setSeedMsg]   = useState("");
  const [seedError, setSeedError] = useState("");

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    setSeedMsg("");
    setSeedError("");
    try {
      const res = await fetch("/api/admin/demo/seed", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSeedError(data.error ?? "Initialization failed.");
      } else {
        setSeedMsg("Demo environment ready.");
        router.refresh();
      }
    } catch {
      setSeedError("Network error. Please try again.");
    } finally {
      setSeeding(false);
    }
  }, [router]);

  const handleLaunch = useCallback((id: DemoPersonaId) => {
    if (id === "public") {
      window.open(`/campaign/${DEMO_SLUG}`, "_blank", "noopener");
    } else {
      window.open(`/api/admin/demo/launch?persona=${id}`, "_blank", "noopener");
    }
  }, []);

  const ready = isReady(status);
  const border = "1px solid #e2e8f0";

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 1.5rem 4rem" }}>

      {/* Demo environment banner */}
      {ready ? (
        <div style={{ background: "#0b1e3d", borderRadius: 10, padding: "1.25rem 1.5rem", marginBottom: "2rem", display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".625rem" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
            <span style={{ color: "#94a3b8", fontSize: ".75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
              Demo Environment
            </span>
          </div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: ".95rem" }}>
            {status.school_name} {status.sport_name}
          </div>
          <div style={{ display: "flex", gap: ".5rem", marginLeft: "auto" }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: status.primary_color,   border: "2px solid rgba(255,255,255,.3)" }} />
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: status.secondary_color, border: "2px solid rgba(255,255,255,.3)" }} />
          </div>
        </div>
      ) : (
        <div style={{ background: "#fef9c3", border: "1px solid #fde047", borderRadius: 10, padding: "1rem 1.25rem", marginBottom: "2rem", display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "1.1rem" }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#713f12", fontSize: ".9rem" }}>Demo environment not initialized</div>
            <div style={{ color: "#92400e", fontSize: ".8rem", marginTop: ".2rem" }}>
              Click Initialize below to create the demo campaign and all demo accounts.
            </div>
          </div>
        </div>
      )}

      {/* Launch error */}
      {launchErr && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: ".75rem 1.25rem", marginBottom: "1.5rem", fontSize: ".82rem", color: "#991b1b" }}>
          ⚠ {LAUNCH_ERROR_MSGS[launchErr] ?? `Launch error: ${launchErr}`}
        </div>
      )}

      {/* Seed feedback */}
      {seedError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: ".75rem 1.25rem", marginBottom: "1.5rem", fontSize: ".82rem", color: "#991b1b" }}>
          {seedError}
        </div>
      )}
      {seedMsg && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: ".75rem 1.25rem", marginBottom: "1.5rem", fontSize: ".82rem", color: "#166534", fontWeight: 600 }}>
          ✓ {seedMsg}
        </div>
      )}

      {/* Persona cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem", marginBottom: "2.5rem" }}>
        {DEMO_PERSONAS.map(persona => (
          <div
            key={persona.id}
            style={{
              background:   persona.accent,
              border:       `1.5px solid ${persona.accentBorder}`,
              borderRadius: 12,
              padding:      "1.75rem 1.5rem",
              display:      "flex",
              flexDirection: "column",
              gap:          "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
              <span style={{ fontSize: "2.25rem", lineHeight: 1 }}>{persona.icon}</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0b1e3d", lineHeight: 1.2 }}>
                  {persona.label}
                </div>
                <div style={{ fontSize: ".82rem", color: "#475569", marginTop: ".35rem", lineHeight: 1.5 }}>
                  {persona.description}
                </div>
              </div>
            </div>

            <div style={{ fontSize: ".72rem", color: persona.accentText, background: "rgba(255,255,255,.55)", borderRadius: 6, padding: ".4rem .75rem", fontStyle: "italic" }}>
              {persona.hint}
            </div>

            <button
              onClick={() => handleLaunch(persona.id)}
              disabled={!ready && persona.id !== "public"}
              style={{
                marginTop:    "auto",
                padding:      ".7rem 1.25rem",
                background:   ready || persona.id === "public" ? "#0b1e3d" : "#cbd5e1",
                color:        ready || persona.id === "public" ? "#fff" : "#94a3b8",
                border:       "none",
                borderRadius: 8,
                fontSize:     ".88rem",
                fontWeight:   700,
                cursor:       ready || persona.id === "public" ? "pointer" : "not-allowed",
                letterSpacing: ".02em",
                transition:   "opacity .15s",
              }}
              onMouseOver={e => { if (ready || persona.id === "public") (e.currentTarget as HTMLButtonElement).style.opacity = ".85"; }}
              onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            >
              Launch Demo →
            </button>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: border, marginBottom: "2rem" }} />

      {/* Reset / Initialize section */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".4rem" }}>
            <span>🔄</span>
            <span style={{ fontWeight: 700, fontSize: ".95rem", color: "#0b1e3d" }}>
              {ready ? "Reset Demo Data" : "Initialize Demo Environment"}
            </span>
          </div>
          <p style={{ fontSize: ".82rem", color: "#64748b", margin: 0, lineHeight: 1.6 }}>
            {ready
              ? "Restores all demo data (athletes, donations, sponsors, fund uses) back to its original seeded state. Use this after a demo session — not before every presentation."
              : "Creates the permanent demo campaign (elf-demo), demo coach account, demo athlete account, and demo parent account. Only needs to be done once."}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", alignItems: "flex-end", minWidth: 180 }}>
          <button
            onClick={() => void handleSeed()}
            disabled={seeding}
            style={{
              padding:      ".65rem 1.5rem",
              background:   seeding ? "#94a3b8" : ready ? "#475569" : "#0b1e3d",
              color:        "#fff",
              border:       "none",
              borderRadius: 8,
              fontSize:     ".85rem",
              fontWeight:   700,
              cursor:       seeding ? "not-allowed" : "pointer",
              whiteSpace:   "nowrap",
            }}
          >
            {seeding
              ? "Working…"
              : ready
              ? "Reset Demo Data"
              : "Initialize Demo Environment"}
          </button>

          {ready && (
            <div style={{ fontSize: ".7rem", color: "#94a3b8", textAlign: "right" }}>
              Demo campaign: <code style={{ fontFamily: "monospace" }}>elf-demo</code>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
