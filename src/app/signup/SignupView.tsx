"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AuthShell from "@/components/auth/AuthShell";
import type { EntryPhoto } from "@/components/auth/entryPhotos";
import styles from "@/components/auth/authEntry.module.css";

// Phase O3B — public account-creation form. Collects only name/email/
// password; on success, the new elf_session is already set by the
// response, so this goes straight to /team-onboarding for O3's existing
// School/Sport/Season flow — never back to /login.
export default function SignupView({ photo }: { photo: EntryPhoto }) {
  const router = useRouter();
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong. Please try again."); return; }
      router.push("/team-onboarding");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      headline="Create Your Team"
      tagline="Create your account, then we'll set up your team."
      photo={photo}
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        <h1 className={styles.headline} style={{ fontSize: "1.6rem" }}>Create Your ELF Account</h1>
        <p className={styles.subtext}>Create your account, then we&apos;ll set up your team.</p>

        {error && <div className={styles.errorBox}>{error}</div>}

        <label className={styles.label}>
          Name
          <input
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className={styles.input}
          />
        </label>

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
          Password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={styles.input}
          />
        </label>

        <button type="submit" disabled={loading} className={styles.primaryButton}>
          {loading ? "Creating account…" : "Create Account"}
        </button>

        <div style={{ textAlign: "center" }}>
          <span className={styles.subtext} style={{ fontSize: ".88rem" }}>Already have an account? </span>
          <a href="/login" className={styles.textLink}>Log In</a>
        </div>
      </form>

      <div className={styles.footerLinks} style={{ textAlign: "center" }}>
        <Link href="/" className={styles.mutedLink} style={{ textDecoration: "none" }}>← Back to home</Link>
        <a href="/enter-code" className={styles.mutedLink}>
          Joining an existing team instead? Enter your team code.
        </a>
      </div>
    </AuthShell>
  );
}
