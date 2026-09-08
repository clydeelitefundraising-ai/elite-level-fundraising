"use client";

import { useState } from "react";
import Image from "next/image";

const HEADER_STYLE: React.CSSProperties = {
  background: "#0b1e3d",
  padding: "1.25rem 1rem",
  display: "flex",
  alignItems: "center",
  gap: ".75rem",
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
        <div style={HEADER_STYLE}>
          <Image src="/ELF.LOGO.png" alt="ELF" width={36} height={36} style={{ borderRadius: ".4rem" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "1.05rem" }}>Team Hub</span>
        </div>
        {children}
      </div>
    </div>
  );
}

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
      <Shell>
        <div style={CARD_STYLE}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>Link Invalid or Expired</h1>
          <p style={{ margin: 0, fontSize: ".95rem", color: "#6b7280", lineHeight: 1.6 }}>
            This password reset link is invalid or has expired. Request a new one to continue.
          </p>
          <a
            href="/forgot-password"
            style={{ display: "inline-block", background: "#0b1e3d", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: "1rem", padding: ".85rem 1rem", borderRadius: ".85rem", textDecoration: "none", marginTop: ".5rem" }}
          >
            Request a New Link
          </a>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div style={CARD_STYLE}>
          <div style={{ fontSize: "2rem", lineHeight: 1 }}>✓</div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>Password Reset</h1>
          <p style={{ margin: 0, fontSize: ".95rem", color: "#6b7280", lineHeight: 1.6 }}>
            Your password has been updated. Log in with your new password to continue.
          </p>
          <a
            href="/login"
            style={{ display: "block", background: "#C4A35A", color: "#0b1e3d", textAlign: "center", fontWeight: 800, fontSize: "1.05rem", padding: "1rem", borderRadius: ".85rem", textDecoration: "none", marginTop: ".5rem" }}
          >
            Log In
          </a>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} style={CARD_STYLE}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.02em" }}>
          Choose a New Password
        </h1>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".88rem", color: "#991b1b" }}>
            {error}
          </div>
        )}

        <label style={LABEL_STYLE}>
          New Password
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
          Confirm New Password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={pw2}
            onChange={e => setPw2(e.target.value)}
            style={INPUT_STYLE}
            placeholder="Repeat your new password"
          />
        </label>

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
          {busy ? "Please wait…" : "Reset Password"}
        </button>
      </form>
    </Shell>
  );
}
