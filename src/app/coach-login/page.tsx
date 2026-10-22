"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";

export default function CoachLoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  // Same email + password on more than one team: the server signs nothing in
  // until the coach picks the team (code team_selection_required).
  const [teams,    setTeams]    = useState<string[]>([]);

  const signIn = async (campaignSlug?: string) => {
    setLoading(true);
    setError("");

    const res = await fetch("/api/team/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, ...(campaignSlug ? { campaign_slug: campaignSlug } : {}) }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.status === 409 && data.code === "team_selection_required" && Array.isArray(data.teams)) {
      setTeams(data.teams);
      return;
    }
    setTeams([]);
    if (!res.ok) {
      setError(data.error ?? "Login failed.");
      return;
    }

    const slug = data.coach?.campaign_slug;
    if (!slug) {
      setError("Account has no team assigned. Contact your administrator.");
      return;
    }

    router.push(`/team/${slug}/home`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void signIn();
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
        maxWidth: 380,
        background: "#fff",
        borderRadius: 16,
        padding: "2.25rem 2rem",
        boxShadow: "0 4px 24px rgba(0,0,0,.18)",
      }}>
        {/* Logo mark */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "#0b1e3d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.25rem",
        }}>
          <Trophy size={22} aria-hidden="true" style={{ color: "#fff" }} />
        </div>

        <h1 style={{ margin: "0 0 .3rem", fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d" }}>
          Coach Sign In
        </h1>
        <p style={{ margin: "0 0 1.75rem", fontSize: ".85rem", color: "#6b7280" }}>
          Sign in to access your team hub.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em" }}>
            Email
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="coach@school.edu"
              style={{
                padding: ".55rem .75rem",
                border: "1.5px solid #e5e7eb",
                borderRadius: 8,
                fontSize: ".9rem",
                width: "100%",
                boxSizing: "border-box",
                color: "#111827",
                background: "#fff",
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em" }}>
            Password
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                padding: ".55rem .75rem",
                border: "1.5px solid #e5e7eb",
                borderRadius: 8,
                fontSize: ".9rem",
                width: "100%",
                boxSizing: "border-box",
                color: "#111827",
                background: "#fff",
                outline: "none",
              }}
            />
          </label>

          {teams.length > 0 && (
            <div role="group" aria-label="Choose your team" style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
              <p style={{ margin: 0, fontSize: ".82rem", color: "#374151" }}>This sign-in is used on more than one team. Choose the team to open:</p>
              {teams.map(t => (
                <button key={t} type="button" disabled={loading} onClick={() => void signIn(t)}
                  style={{ padding: ".5rem .7rem", border: "1.5px solid #e5e7eb", borderRadius: 8, background: "#fff", color: "#0b1e3d", fontSize: ".85rem", fontWeight: 600, textAlign: "left", cursor: "pointer" }}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p style={{ margin: 0, padding: ".5rem .7rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: ".25rem",
              padding: ".65rem",
              background: loading ? "#9ca3af" : "#0b1e3d",
              color: "#fff",
              border: "none",
              borderRadius: 9,
              fontSize: ".9rem",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: ".01em",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p style={{ margin: "1.5rem 0 0", textAlign: "center", fontSize: ".78rem", color: "#9ca3af" }}>
          Need access? Contact your team administrator.
        </p>
        <p style={{ margin: ".6rem 0 0", textAlign: "center", fontSize: ".78rem", color: "#9ca3af" }}>
          Coaching more than one team? <a href="/login" style={{ color: "#0b1e3d", fontWeight: 600 }}>Use your ELF account</a> instead — ask your administrator for an activation link if you haven&apos;t set one up yet.
        </p>
      </div>
    </div>
  );
}
