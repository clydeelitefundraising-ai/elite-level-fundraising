"use client";

import { useState } from "react";
import Image from "next/image";

export default function RequestResetPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-reset", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0b1e3d", display: "flex", justifyContent: "center", alignItems: "flex-start", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", background: "#f5f6f8", display: "flex", flexDirection: "column" }}>

        <div style={{ background: "#0b1e3d", padding: "1.25rem 1rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
          <Image src="/ELF.LOGO.png" alt="ELF" width={36} height={36} style={{ borderRadius: ".4rem" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>Reset Password</span>
        </div>

        <div style={{ padding: "2rem 1.25rem", flex: 1 }}>
          {done ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d" }}>Check your email</h1>
              <p style={{ margin: 0, fontSize: ".9rem", color: "#374151", lineHeight: 1.6 }}>
                If an account exists for <strong>{email.trim()}</strong>, we&apos;ve sent a link to reset your password. It expires in 1 hour.
              </p>
              <a href="/login" style={{ fontSize: ".88rem", color: "#0b1e3d", fontWeight: 700, textDecoration: "underline" }}>
                ← Back to login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d" }}>Forgot your password?</h1>
              <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>
                Enter your account email and we&apos;ll send you a reset link.
              </p>

              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".88rem", color: "#991b1b" }}>
                  {error}
                </div>
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
                <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", outline: "none", background: "#fff" }}
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                style={{ background: "#C4A35A", color: "#0b1e3d", fontWeight: 800, fontSize: "1.05rem", padding: "1rem", borderRadius: ".75rem", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1 }}
              >
                {loading ? "Sending…" : "Send Reset Link"}
              </button>

              <a href="/login" style={{ textAlign: "center", fontSize: ".88rem", color: "#6b7280", textDecoration: "underline" }}>
                ← Back to login
              </a>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
