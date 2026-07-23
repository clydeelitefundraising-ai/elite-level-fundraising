"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function ResetPasswordView({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Reset failed."); return; }
      router.push("/teams");
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

        <form onSubmit={handleSubmit} style={{ padding: "2rem 1.25rem", display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, color: "#0b1e3d" }}>Choose a new password</h1>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: ".5rem", padding: ".75rem 1rem", fontSize: ".88rem", color: "#991b1b" }}>
              {error}
              {(error.includes("invalid") || error.includes("expired") || error.includes("already been used")) && (
                <> — <a href="/request-reset" style={{ color: "#991b1b", fontWeight: 700 }}>Request a new link</a></>
              )}
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
            <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>New Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", outline: "none", background: "#fff" }}
            />
            <span style={{ fontSize: ".78rem", color: "#9ca3af" }}>At least 8 characters</span>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: ".35rem" }}>
            <span style={{ fontSize: ".82rem", fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: ".06em" }}>Confirm Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              style={{ padding: ".75rem 1rem", borderRadius: ".5rem", border: "1.5px solid #d1d5db", fontSize: "1rem", outline: "none", background: "#fff" }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{ background: "#C4A35A", color: "#0b1e3d", fontWeight: 800, fontSize: "1.05rem", padding: "1rem", borderRadius: ".75rem", border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .7 : 1 }}
          >
            {loading ? "Saving…" : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
