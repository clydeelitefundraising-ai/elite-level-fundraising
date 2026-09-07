"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  slug:          string;
  name:          string;
  email:         string;
  alreadyLinked: boolean;
};

const CARD_STYLE: React.CSSProperties = {
  padding: "2rem 1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  flex: 1,
};

const INPUT_STYLE: React.CSSProperties = {
  padding: ".75rem 1rem",
  borderRadius: ".5rem",
  border: "1.5px solid #d1d5db",
  fontSize: "1rem",
  outline: "none",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".35rem",
  fontSize: ".82rem",
  fontWeight: 600,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0b1e3d", display: "flex", justifyContent: "center", alignItems: "flex-start", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", background: "#f5f6f8", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#0b1e3d", padding: "1.25rem 1rem", display: "flex", alignItems: "center", gap: ".75rem" }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>Team Hub</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ActivateAccountView({ slug, name, email: initialEmail, alreadyLinked }: Props) {
  const router  = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [pw,    setPw]    = useState("");
  const [pw2,   setPw2]   = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState(false);
  const [done,  setDone]  = useState<{ existingAccount: boolean } | null>(null);

  if (alreadyLinked) {
    return (
      <Shell>
        <div style={CARD_STYLE}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>Already Activated</h1>
          <p style={{ margin: 0, fontSize: ".95rem", color: "#6b7280", lineHeight: 1.6 }}>
            Your ELF account is already linked to this team. Log in at /login to see all your linked teams in one place.
          </p>
          <a href="/login" style={{ display: "block", background: "#C4A35A", color: "#0b1e3d", textAlign: "center", fontWeight: 800, fontSize: "1.05rem", padding: "1rem", borderRadius: ".85rem", textDecoration: "none", marginTop: ".5rem" }}>
            Go to Login
          </a>
        </div>
      </Shell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) { setError("Email is required."); return; }
    if (!initialEmail) {
      if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
      if (pw !== pw2)    { setError("Passwords do not match."); return; }
    }

    setBusy(true);
    try {
      const res  = await fetch(`/api/team/${slug}/members/activate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password: pw || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Activation failed."); return; }
      setDone({ existingAccount: !!data.existingAccount });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    if (done.existingAccount) {
      return (
        <Shell>
          <div style={CARD_STYLE}>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>Team Linked</h1>
            <p style={{ margin: 0, fontSize: ".95rem", color: "#6b7280", lineHeight: 1.6 }}>
              This team has been added to your existing ELF account. Log in with your existing password to continue.
            </p>
            <a href="/login" style={{ display: "block", background: "#C4A35A", color: "#0b1e3d", textAlign: "center", fontWeight: 800, fontSize: "1.05rem", padding: "1rem", borderRadius: ".85rem", textDecoration: "none", marginTop: ".5rem" }}>
              Log In
            </a>
          </div>
        </Shell>
      );
    }
    router.push(`/team/${slug}/home`);
    return null;
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} style={CARD_STYLE}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.02em" }}>
          Activate Your ELF Account
        </h1>
        <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>
          {name}, activating lets you see every team you&apos;re linked to (not just this one) from a single ELF account at /login.
        </p>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".88rem", color: "#991b1b" }}>
            {error}
          </div>
        )}

        <label style={LABEL_STYLE}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            readOnly={!!initialEmail}
            style={initialEmail ? { ...INPUT_STYLE, background: "#f3f4f6", color: "#6b7280" } : INPUT_STYLE}
          />
        </label>
        {initialEmail && (
          <p style={{ margin: "-.5rem 0 0", fontSize: ".78rem", color: "#9ca3af" }}>
            This is the email on file for your team account. Contact your team administrator if it needs to change.
          </p>
        )}

        {!initialEmail && (
          <>
            <label style={LABEL_STYLE}>
              Password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={pw}
                onChange={e => setPw(e.target.value)}
                style={INPUT_STYLE}
                placeholder="Minimum 8 characters"
              />
            </label>
            <label style={LABEL_STYLE}>
              Confirm Password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                style={INPUT_STYLE}
                placeholder="Repeat your password"
              />
            </label>
          </>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            display: "block",
            background: busy ? "#9ca3af" : "#C4A35A",
            color: "#0b1e3d",
            textAlign: "center",
            fontWeight: 800,
            fontSize: "1.05rem",
            padding: "1rem",
            borderRadius: ".85rem",
            border: "none",
            cursor: busy ? "not-allowed" : "pointer",
            marginTop: ".5rem",
          }}
        >
          {busy ? "Please wait…" : "Activate Account"}
        </button>
      </form>
    </Shell>
  );
}
