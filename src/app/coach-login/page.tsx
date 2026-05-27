"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CoachLoginPage() {
  const router = useRouter();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/team/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = await res.json();
    setLoading(false);

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
          fontSize: "1.3rem",
        }}>
          🏆
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
      </div>
    </div>
  );
}
