"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./Login.module.css";

export default function LoginView() {
  const router = useRouter();
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Login failed."); return; }
      // Always land on the Team Selector, even for single-team accounts —
      // keeps the flow consistent and gives users a visible way to add
      // another team from there.
      router.push("/teams");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page} style={{ background: "#0b1e3d", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* D1c: desktop-only brand panel — hidden on mobile (Login.module.css),
          purely presentational, no auth/session behavior. */}
      <div className={styles.brandPanel}>
        <Image src="/ELF.LOGO.png" alt="" width={64} height={64} style={{ borderRadius: ".9rem", marginBottom: "1.5rem" }} />
        <h1 style={{ margin: 0, fontSize: "2.1rem", fontWeight: 800, letterSpacing: "-.02em" }}>Team Hub</h1>
        <p style={{ marginTop: ".75rem", fontSize: "1.02rem", color: "rgba(255,255,255,.75)", lineHeight: 1.6, maxWidth: 360 }}>
          One place for your team&apos;s roster, calendar, messages, and fundraising — built for coaches, athletes, and families.
        </p>
      </div>

      <div className={styles.card} style={{ background: "#f5f6f8" }}>

        <div style={{ background: "#0b1e3d", padding: "1.25rem 1rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
          <Image src="/ELF.LOGO.png" alt="ELF" width={36} height={36} style={{ borderRadius: ".4rem" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>Team Hub</span>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "2rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.02em" }}>Log In</h1>
          <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>Enter your account email and password.</p>

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

          <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
            <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", outline: "none", background: "#fff" }}
            />
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: ".55rem", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0b1e3d" }}
            />
            <span style={{ fontSize: ".88rem", color: "#374151" }}>Remember me for 30 days</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{ background: "#C4A35A", color: "#0b1e3d", fontWeight: 800, fontSize: "1.05rem", padding: "1rem", borderRadius: ".75rem", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1 }}
          >
            {loading ? "Logging in…" : "Log In"}
          </button>

          <div style={{ textAlign: "center", marginTop: ".5rem" }}>
            <span style={{ fontSize: ".88rem", color: "#6b7280" }}>New member? </span>
            <a href="/enter-code" style={{ fontSize: ".88rem", color: "#0b1e3d", fontWeight: 700, textDecoration: "underline" }}>
              Enter your team code
            </a>
          </div>
        </form>

        <div style={{ padding: "0 1rem 1.5rem", textAlign: "center", display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <a href="/" style={{ fontSize: ".78rem", color: "#9ca3af", textDecoration: "none" }}>← Back to home</a>
          <a href="/coach-login" style={{ fontSize: ".75rem", color: "#9ca3af", textDecoration: "underline" }}>
            Coach using old login? Continue with legacy coach login.
          </a>
        </div>
      </div>
    </div>
  );
}
