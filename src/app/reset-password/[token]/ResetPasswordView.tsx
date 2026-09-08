"use client";

import { useState } from "react";
import AuthShell from "@/components/auth/AuthShell";
import styles from "@/components/auth/authEntry.module.css";

export default function ResetPasswordView({ token }: { token: string }) {
  const [pw,      setPw]      = useState("");
  const [pw2,     setPw2]     = useState("");
  const [error,   setError]   = useState<string | null>(null);
  const [busy,    setBusy]    = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [done,    setDone]    = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== pw2)    { setError("Passwords do not match."); return; }

    setBusy(true);
    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password: pw }),
      });
      await res.json().catch(() => null);
      if (!res.ok) {
        // A single generic invalid/expired state — the response never
        // distinguishes "never existed" from "already used" from "expired".
        setInvalid(true);
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <AuthShell headline="Same Teams. Bigger Opportunities." tagline="Every reset link is single-use for your security.">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", flex: 1 }}>
          <h1 className={styles.headline} style={{ fontSize: "1.5rem" }}>Link Invalid or Expired</h1>
          <p className={styles.subtext}>
            This password reset link is invalid or has expired. Request a new one to continue.
          </p>
          <a href="/forgot-password" className={styles.primaryButton} style={{ marginTop: ".5rem" }}>
            Request a New Link
          </a>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell headline="Next Season, Brighter." tagline="Your account is ready — log in with your new password.">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", flex: 1 }}>
          <div style={{ fontSize: "2rem", lineHeight: 1, color: "var(--elf-yellow)" }}>✓</div>
          <h1 className={styles.headline} style={{ fontSize: "1.5rem" }}>Password Reset</h1>
          <p className={styles.subtext}>
            Your password has been updated. Log in with your new password to continue.
          </p>
          <a href="/login" className={styles.primaryButton} style={{ marginTop: ".5rem" }}>
            Log In
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell headline="Create a New Password" tagline="Choose a strong password to keep your ELF account secure.">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem", flex: 1 }}>
        <h1 className={styles.headline} style={{ fontSize: "1.5rem" }}>
          Create a New Password
        </h1>

        {error && <div className={styles.errorBox}>{error}</div>}

        <label className={styles.label}>
          New Password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={pw}
            onChange={e => setPw(e.target.value)}
            className={styles.input}
            placeholder="Minimum 8 characters"
          />
        </label>
        <label className={styles.label}>
          Confirm New Password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={pw2}
            onChange={e => setPw2(e.target.value)}
            className={styles.input}
            placeholder="Repeat your new password"
          />
        </label>

        <button type="submit" disabled={busy} className={styles.primaryButton}>
          {busy ? "Please wait…" : "Reset Password"}
        </button>
      </form>
    </AuthShell>
  );
}
