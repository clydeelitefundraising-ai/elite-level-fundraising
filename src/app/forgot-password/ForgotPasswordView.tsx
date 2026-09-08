"use client";

import { useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import styles from "@/components/auth/authEntry.module.css";

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
    <AuthShell
      headline="Forgot Your Password?"
      tagline="Enter your account email and we'll send you a link to reset your password."
    >
      {message ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", flex: 1 }}>
          <div style={{ fontSize: "2rem", lineHeight: 1, color: "var(--elf-yellow)" }}>✓</div>
          <h1 className={styles.headline} style={{ fontSize: "1.5rem" }}>Check Your Email</h1>
          <p className={styles.subtext}>{message}</p>
          <a href="/login" className={styles.primaryButton} style={{ marginTop: ".5rem" }}>
            Back to Login
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem", flex: 1 }}>
          <h1 className={styles.headline} style={{ fontSize: "1.5rem" }}>Forgot Your Password?</h1>
          <p className={styles.subtext}>
            Enter your account email and we&apos;ll send you a link to reset your password.
          </p>

          <label className={styles.label}>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={styles.input}
            />
          </label>

          <button type="submit" disabled={loading} className={styles.primaryButton}>
            {loading ? "Sending…" : "Send Reset Link"}
          </button>

          <div style={{ textAlign: "center" }}>
            <a href="/login" className={styles.textLink}>
              ← Back to Login
            </a>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
