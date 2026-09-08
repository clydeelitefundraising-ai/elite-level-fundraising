"use client";

import { useState } from "react";
import Image from "next/image";
import styles from "../login/Login.module.css";

export default function ForgotPasswordView() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/request-reset", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => null);
      // Always show the same neutral confirmation, regardless of the
      // response — this page never learns (and must never imply) whether
      // the submitted email matched an account.
      setMessage(data?.message ?? "If an account exists for that email, we've sent password reset instructions.");
    } catch {
      setMessage("If an account exists for that email, we've sent password reset instructions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page} style={{ background: "#0b1e3d", fontFamily: "system-ui, -apple-system, sans-serif" }}>
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

        {message ? (
          <div style={{ padding: "2rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
            <div style={{ fontSize: "2rem", lineHeight: 1 }}>✓</div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>Check Your Email</h1>
            <p style={{ margin: 0, fontSize: ".95rem", color: "#374151", lineHeight: 1.6 }}>{message}</p>
            <a
              href="/login"
              style={{ display: "block", background: "#C4A35A", color: "#0b1e3d", textAlign: "center", fontWeight: 800, fontSize: "1.05rem", padding: "1rem", borderRadius: ".85rem", textDecoration: "none", marginTop: ".5rem" }}
            >
              Back to Login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: "2rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.02em" }}>Forgot Password?</h1>
            <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>
              Enter your account email and we&apos;ll send you a link to reset your password.
            </p>

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

            <div style={{ textAlign: "center", marginTop: ".5rem" }}>
              <a href="/login" style={{ fontSize: ".88rem", color: "#0b1e3d", fontWeight: 700, textDecoration: "underline" }}>
                Back to Login
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
