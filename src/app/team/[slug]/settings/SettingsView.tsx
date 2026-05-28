"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CoachSession } from "@/lib/teamSession";
import type { ActiveJoinCode } from "@/lib/teamData";

type Props = {
  slug: string;
  coach: CoachSession;
  initialCode: ActiveJoinCode | null;
};

function roleLabel(role: string): string {
  if (role === "head_coach")      return "Head Coach";
  if (role === "assistant_coach") return "Asst. Coach";
  return role;
}

export default function SettingsView({ slug, coach, initialCode }: Props) {
  const router = useRouter();
  const [code, setCode]       = useState<ActiveJoinCode | null>(initialCode);
  const [working, setWorking] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState("");

  const handleSignOut = async () => {
    await fetch("/api/team/auth/logout", { method: "POST" });
    router.push(`/team/${slug}/login`);
  };

  const joinUrl = code
    ? (typeof window !== "undefined" ? `${window.location.origin}/join/${code.code}` : `/join/${code.code}`)
    : null;

  const handleGenerate = async () => {
    setWorking(true);
    setError("");
    const res = await fetch(`/api/team/${slug}/join-codes`, { method: "POST" });
    const data = await res.json();
    setWorking(false);
    if (!res.ok) { setError(data.error ?? "Failed to generate code."); return; }
    setCode(data.code);
  };

  const handleRevoke = async () => {
    if (!code) return;
    if (!confirm("Revoke this join code? Anyone with the old link will no longer be able to join.")) return;
    setWorking(true);
    setError("");
    const res = await fetch(`/api/team/${slug}/join-codes/${code.id}`, { method: "PATCH" });
    const data = await res.json();
    setWorking(false);
    if (!res.ok) { setError(data.error ?? "Failed to revoke code."); return; }
    setCode(null);
  };

  const handleCopy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the input
    }
  };

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* ── Coach badge ── */}
      <div style={{
        background: "#fff",
        borderRadius: 13,
        padding: ".75rem 1rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".75rem",
        display: "flex",
        alignItems: "center",
        gap: ".75rem",
      }}>
        <div style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "#0b1e3d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: ".7rem",
          fontWeight: 800,
          color: "#fff",
          flexShrink: 0,
          letterSpacing: ".02em",
        }}>
          {coach.name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("")}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#111827" }}>{coach.name}</div>
          <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: ".05rem" }}>{roleLabel(coach.role)}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSignOut}
          style={{
            fontSize: ".72rem",
            fontWeight: 600,
            color: "#9ca3af",
            background: "none",
            padding: ".3rem .6rem",
            borderRadius: 7,
            border: "1px solid #e5e7eb",
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>

      {/* ── Team Access section ── */}
      <div style={{
        background: "#fff",
        borderRadius: 13,
        padding: "1rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      }}>
        <div style={{ marginBottom: ".8rem" }}>
          <h2 style={{ margin: "0 0 .18rem", fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".09em" }}>
            Team Access
          </h2>
          <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>
            Share this link with parents and athletes so they can join your team hub.
          </p>
        </div>

        {code ? (
          <>
            {/* Code display */}
            <div style={{
              background: "#f8f9fb",
              border: "1.5px solid #e5e7eb",
              borderRadius: 10,
              padding: ".75rem 1rem",
              marginBottom: ".65rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".45rem" }}>
                <span style={{
                  fontFamily: "monospace",
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "#0b1e3d",
                  letterSpacing: ".18em",
                }}>
                  {code.code}
                </span>
                <span style={{
                  padding: ".1rem .5rem",
                  background: "#dcfce7",
                  color: "#16a34a",
                  borderRadius: 100,
                  fontSize: ".58rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  flexShrink: 0,
                }}>
                  Active
                </span>
              </div>
              <div style={{
                fontSize: ".75rem",
                color: "#6b7280",
                wordBreak: "break-all",
                lineHeight: 1.4,
              }}>
                {joinUrl}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button
                onClick={handleCopy}
                disabled={working}
                style={{
                  flex: 1,
                  padding: ".55rem .75rem",
                  background: copied ? "#16a34a" : "#0b1e3d",
                  color: "#fff",
                  border: "none",
                  borderRadius: 9,
                  fontSize: ".82rem",
                  fontWeight: 700,
                  cursor: working ? "not-allowed" : "pointer",
                  transition: "background .15s",
                }}
              >
                {copied ? "✓ Copied!" : "Copy Join Link"}
              </button>
              <button
                onClick={handleGenerate}
                disabled={working}
                title="Generate a new code (old code stops working)"
                style={{
                  padding: ".55rem .75rem",
                  background: "#fff",
                  color: "#374151",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 9,
                  fontSize: ".82rem",
                  fontWeight: 600,
                  cursor: working ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                New Code
              </button>
              <button
                onClick={handleRevoke}
                disabled={working}
                style={{
                  padding: ".55rem .75rem",
                  background: "#fff",
                  color: "#dc2626",
                  border: "1.5px solid #fecaca",
                  borderRadius: 9,
                  fontSize: ".82rem",
                  fontWeight: 600,
                  cursor: working ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Revoke
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "1.25rem 0 .5rem" }}>
            <div style={{ fontSize: "1.75rem", marginBottom: ".5rem", opacity: .35 }}>🔗</div>
            <p style={{ margin: "0 0 1rem", fontSize: ".82rem", color: "#9ca3af" }}>
              No join code yet. Generate one to let parents and athletes join.
            </p>
            <button
              onClick={handleGenerate}
              disabled={working}
              style={{
                padding: ".6rem 1.5rem",
                background: working ? "#9ca3af" : "#0b1e3d",
                color: "#fff",
                border: "none",
                borderRadius: 9,
                fontSize: ".875rem",
                fontWeight: 700,
                cursor: working ? "not-allowed" : "pointer",
              }}
            >
              {working ? "Generating…" : "Generate Join Code"}
            </button>
          </div>
        )}

        {error && (
          <p style={{ margin: ".65rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".8rem" }}>
            {error}
          </p>
        )}

        {/* Instructions */}
        <div style={{
          marginTop: ".9rem",
          paddingTop: ".75rem",
          borderTop: "1px solid #f3f4f6",
          fontSize: ".75rem",
          color: "#9ca3af",
          lineHeight: 1.55,
        }}>
          <strong style={{ color: "#6b7280" }}>How it works:</strong> Anyone with this link can join your team hub as an athlete or parent. They choose their own role during sign-up. Revoke to immediately invalidate the current link.
        </div>
      </div>
    </div>
  );
}
