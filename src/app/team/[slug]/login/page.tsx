"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function CoachLoginPage() {
  const params  = useParams();
  const slug    = params.slug as string;
  const router  = useRouter();

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
      body: JSON.stringify({ email: email.trim(), password, campaign_slug: slug }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Login failed.");
      return;
    }

    router.push(`/team/${slug}/home`);
  };

  return (
    <div style={{ maxWidth: 380, margin: "2rem auto 0" }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: "2rem 1.75rem", boxShadow: "0 1px 4px rgba(0,0,0,.08)", border: "1px solid #f0f0f0" }}>
        <h1 style={{ margin: "0 0 .35rem", fontSize: "1.25rem", fontWeight: 800, color: "#0b1e3d" }}>
          Coach Login
        </h1>
        <p style={{ margin: "0 0 1.5rem", fontSize: ".85rem", color: "#6b7280" }}>
          Sign in to manage your team hub.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".75rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em" }}>
            Email
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="coach@school.edu"
              style={{ padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".875rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".75rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".04em" }}>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".875rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff" }}
            />
          </label>

          {error && (
            <p style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ padding: ".55rem .9rem", background: loading ? "#9ca3af" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".875rem", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", marginTop: ".25rem" }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
