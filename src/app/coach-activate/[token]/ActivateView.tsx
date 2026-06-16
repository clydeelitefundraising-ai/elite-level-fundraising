"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Props =
  | { status: "invalid" | "expired" | "used" | "error"; token: string }
  | {
      status:             "valid";
      token:              string;
      coachName:          string;
      email:              string;
      campaignSlug:       string;
      hasExistingAccount: boolean;
    };

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

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <div style={CARD_STYLE}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>{title}</h1>
        <p style={{ margin: 0, fontSize: ".95rem", color: "#6b7280", lineHeight: 1.6 }}>{message}</p>
        <a
          href="/login"
          style={{ display: "inline-block", background: "#0b1e3d", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: "1rem", padding: ".85rem 1rem", borderRadius: ".85rem", textDecoration: "none", marginTop: ".5rem" }}
        >
          Go to Login
        </a>
      </div>
    </Shell>
  );
}

export default function ActivateView(props: Props) {
  const router  = useRouter();
  const [pw,    setPw]    = useState("");
  const [pw2,   setPw2]   = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState(false);
  const [done,  setDone]  = useState<{ existingAccount: boolean; campaignSlug: string } | null>(null);

  if (props.status === "invalid" || props.status === "error") {
    return <ErrorCard title="Invalid Link" message="This invite link is not valid. Please contact your administrator for a new one." />;
  }
  if (props.status === "expired") {
    return <ErrorCard title="Link Expired" message="This invite link has expired (links are valid for 24 hours). Please ask your administrator to send a new one." />;
  }
  if (props.status === "used") {
    return <ErrorCard title="Link Already Used" message="This invite link has already been used. If you need access, ask your administrator to send a new invite." />;
  }

  if (props.status !== "valid") return null;
  const { token, coachName, email, campaignSlug, hasExistingAccount } = props;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!hasExistingAccount) {
      if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
      if (pw !== pw2)    { setError("Passwords do not match."); return; }
    }

    setBusy(true);
    try {
      const res  = await fetch("/api/auth/coach-activate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password: pw || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Activation failed."); return; }
      setDone({ existingAccount: data.existingAccount, campaignSlug: data.campaignSlug });
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
            <div style={{ fontSize: "2rem", lineHeight: 1 }}>✓</div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>Team Linked</h1>
            <p style={{ margin: 0, fontSize: ".95rem", color: "#6b7280", lineHeight: 1.6 }}>
              This team has been added to your existing ELF account. Log in with your existing password to continue.
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

    // New account created — auto-redirect
    router.push(`/team/${done.campaignSlug}/home`);
    return null;
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} style={CARD_STYLE}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.02em" }}>
          {hasExistingAccount ? "Link Your Account" : "Set Your Password"}
        </h1>

        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: ".65rem", padding: ".875rem 1rem", fontSize: ".875rem", color: "#0369a1", lineHeight: 1.5 }}>
          <strong>{coachName}</strong> &middot; {email}
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".88rem", color: "#991b1b" }}>
            {error}
          </div>
        )}

        {hasExistingAccount ? (
          <p style={{ margin: 0, fontSize: ".95rem", color: "#374151", lineHeight: 1.6 }}>
            Your email is already registered with ELF. Click below to link this team to your existing account.
            You can then log in at <strong>/login</strong> with your existing password.
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: ".9rem", color: "#6b7280" }}>
              Choose a password to activate your ELF account. You&apos;ll use this to log in at <strong>/login</strong>.
            </p>
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
          {busy
            ? "Please wait…"
            : hasExistingAccount
            ? "Link My Account"
            : "Activate Account"}
        </button>
      </form>
    </Shell>
  );
}
