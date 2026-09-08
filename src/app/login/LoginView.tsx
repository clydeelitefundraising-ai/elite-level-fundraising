"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import styles from "@/components/auth/authEntry.module.css";

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
    <AuthShell
      headline="Welcome to ELF Team"
      tagline="Log in to manage your team, communicate, and fundraise — all in one place."
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem", flex: 1 }}>
        <h1 className={styles.headline} style={{ fontSize: "1.6rem" }}>Log In</h1>

        {error && <div className={styles.errorBox}>{error}</div>}

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

        <label className={styles.label}>
          <div className={styles.labelRow}>
            <span>Password</span>
            <a href="/forgot-password" className={styles.textLink} style={{ fontWeight: 600, fontSize: ".78rem", textTransform: "none", letterSpacing: "normal" }}>
              Forgot password?
            </a>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={styles.input}
          />
        </label>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
          />
          <span className={styles.checkboxLabel}>Remember me for 30 days</span>
        </label>

        <button type="submit" disabled={loading} className={styles.primaryButton}>
          {loading ? "Logging in…" : "Log In"}
        </button>

        <div style={{ textAlign: "center" }}>
          <span className={styles.subtext} style={{ fontSize: ".88rem" }}>New member? </span>
          <a href="/enter-code" className={styles.textLink}>
            Enter your team code
          </a>
        </div>
      </form>

      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: ".65rem", marginTop: "1.5rem" }}>
        <Link href="/" className={styles.mutedLink} style={{ textDecoration: "none" }}>← Back to home</Link>
        <a href="/coach-login" className={styles.mutedLink}>
          Coach using old login? Continue with legacy coach login.
        </a>
        {/* Identity Compatibility follow-up: no safe, slug-agnostic link
            exists here — /enter-code is the new-member join path (would
            risk creating a duplicate membership for someone who already
            has one), and the team-specific /activate-account page needs a
            team_member cookie /login doesn't have. Pointing this
            population at their coach/admin is the only route that's both
            safe (no email enumeration, no guessed slug) and accurate. */}
        <p className={styles.subtext} style={{ fontSize: ".75rem", margin: 0, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>
          Previously used a team-specific login and don&apos;t have an ELF account yet? Ask your coach or team admin to help you activate your ELF account.
        </p>
      </div>
    </AuthShell>
  );
}
