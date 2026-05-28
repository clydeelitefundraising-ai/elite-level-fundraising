"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CampaignSettings } from "@/lib/supabase";
import type { TeamAthleteRow } from "@/lib/teamData";

type Props = {
  code: string;
  campaignSlug: string;
  settings: CampaignSettings;
  athletes: TeamAthleteRow[];
};

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

const INPUT_STYLE: React.CSSProperties = {
  padding: ".55rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 8,
  fontSize: ".9rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
  outline: "none",
};

export default function JoinView({ code, campaignSlug, settings, athletes }: Props) {
  const router = useRouter();
  const primary = settings.primary_color ?? "#0b1e3d";

  const [role, setRole] = useState<"athlete" | "parent" | "">("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) { setError("Please select your role."); return; }
    setLoading(true);
    setError("");

    const res = await fetch(`/api/team/${campaignSlug}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        name: name.trim(),
        role,
        phone: phone.trim() || undefined,
        athlete_id: role === "parent" && athleteId ? athleteId : undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to join. Please try again.");
      return;
    }

    router.push(`/team/${campaignSlug}/home`);
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0b1e3d",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "#fff",
        borderRadius: 16,
        padding: "2.25rem 2rem",
        boxShadow: "0 4px 24px rgba(0,0,0,.18)",
      }}>
        {/* Team branding */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: primary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.3rem",
          marginBottom: "1rem",
        }}>
          🏆
        </div>
        <h1 style={{ margin: "0 0 .25rem", fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d" }}>
          Join {settings.school_name}
        </h1>
        <p style={{ margin: "0 0 1.75rem", fontSize: ".85rem", color: "#6b7280" }}>
          {settings.sport_name} · Code: <strong style={{ color: "#374151" }}>{code}</strong>
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>

          {/* Role selector */}
          <div>
            <p style={{ margin: "0 0 .5rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em" }}>
              I am a…
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem" }}>
              {(["athlete", "parent"] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRole(r); setAthleteId(""); }}
                  style={{
                    padding: ".75rem .5rem",
                    border: `2px solid ${role === r ? primary : "#e5e7eb"}`,
                    borderRadius: 10,
                    background: role === r ? `${primary}18` : "#fff",
                    color: role === r ? primary : "#6b7280",
                    fontWeight: role === r ? 700 : 500,
                    fontSize: ".875rem",
                    cursor: "pointer",
                  }}
                >
                  {r === "athlete" ? "🏃 Athlete" : "👨‍👩‍👧 Parent"}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <label style={LABEL_STYLE}>
            Your Name
            <input
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Full name"
              style={INPUT_STYLE}
            />
          </label>

          {/* Phone */}
          <label style={LABEL_STYLE}>
            Phone{" "}
            <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9ca3af" }}>
              optional
            </span>
            <input
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              style={INPUT_STYLE}
            />
          </label>

          {/* Athlete selector — parents only */}
          {role === "parent" && (
            <div>
              <p style={{ margin: "0 0 .4rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em" }}>
                Your Athlete{" "}
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#9ca3af" }}>
                  optional
                </span>
              </p>
              {athletes.length === 0 ? (
                <p style={{ margin: 0, fontSize: ".82rem", color: "#9ca3af", fontStyle: "italic" }}>
                  No athletes on roster yet. You can link later.
                </p>
              ) : (
                <select
                  value={athleteId}
                  onChange={e => setAthleteId(e.target.value)}
                  style={{
                    ...INPUT_STYLE,
                    color: athleteId ? "#111827" : "#9ca3af",
                    appearance: "auto",
                  }}
                >
                  <option value="">Select your athlete (if listed)</option>
                  {athletes.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}{a.event ? ` · ${a.event}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {error && (
            <p style={{ margin: 0, padding: ".5rem .7rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !role}
            style={{
              marginTop: ".1rem",
              padding: ".65rem",
              background: loading || !role ? "#9ca3af" : primary,
              color: "#fff",
              border: "none",
              borderRadius: 9,
              fontSize: ".9rem",
              fontWeight: 700,
              cursor: loading || !role ? "not-allowed" : "pointer",
              letterSpacing: ".01em",
            }}
          >
            {loading ? "Joining…" : "Join Team"}
          </button>
        </form>

        <p style={{ margin: "1.5rem 0 0", textAlign: "center", fontSize: ".78rem", color: "#9ca3af" }}>
          Already a member?{" "}
          <a href={`/team/${campaignSlug}/home`} style={{ color: "#0b1e3d", fontWeight: 600 }}>
            Open team hub
          </a>
        </p>
      </div>
    </div>
  );
}
