"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CoachSession } from "@/lib/teamSession";
import type { ActiveJoinCode } from "@/lib/teamData";
import { staffRoleLabel } from "@/lib/permissions";
import TeamQrModal from "../_components/TeamQrModal";
import PrintSignupSheet from "../_components/PrintSignupSheet";
import { useTeamJoinCode, type JoinCodeSettings } from "../_components/useTeamJoinCode";

type Props = {
  slug: string;
  coach: CoachSession;
  initialCode: ActiveJoinCode | null;
  // Phase 5: team branding needed for the QR/join-code modal + printable
  // signup sheet, relocated here from the Team page per product decision.
  joinCodeSettings: JoinCodeSettings;
};

export default function SettingsView({ slug, coach, initialCode, joinCodeSettings }: Props) {
  const router = useRouter();
  const [code, setCode]       = useState<ActiveJoinCode | null>(initialCode);
  const [working, setWorking] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState("");
  const [qrModalOpen, setQrModalOpen] = useState(false);

  // Phase 5: shares the *same* code with the existing New Code/Revoke UI
  // below (seeded from it, and pushes its own regenerate result back into
  // `code` via onChange) — so the top-of-card code display, the QR modal,
  // and the print sheet can never disagree about what the active code is.
  // The existing generate/revoke handlers (handleGenerate/handleRevoke
  // below) are completely untouched.
  const joinCodeState = useTeamJoinCode(
    slug,
    joinCodeSettings,
    qrModalOpen,
    code,
    (c) => setCode(c as ActiveJoinCode | null),
  );

  const handleSignOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const joinUrl = code ? `${appBase}/join/${code.code}` : null;

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
    <>
      {/* Phase 5: same-page print architecture (see Calendar's Phase 4C
          and the original Team-page implementation this was relocated
          from) — the printable signup sheet must be a sibling of the
          normal page content, not nested inside it. */}
      <style>{`
        @media print {
          #elf-team-header, [role="navigation"] { display: none !important; }
          .elf-settings-noprint { display: none !important; }
          .elf-settings-print { display: block !important; }
        }
        @media screen {
          .elf-settings-print { display: none; }
        }
      `}</style>

      {joinCodeState.signupData && (
        <div className="elf-settings-print">
          <PrintSignupSheet
            data={joinCodeState.signupData}
            qrDataUrl={joinCodeState.qrDataUrl}
            primaryColor={joinCodeSettings.primary_color}
          />
        </div>
      )}

    <div className="elf-settings-noprint" style={{ animation: "elf-fadeUp .22s ease both" }}>

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
          <div style={{ fontSize: ".72rem", color: "#6b7280", marginTop: ".05rem" }}>{staffRoleLabel(coach.role)}</div>
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

            {/* Phase 5: QR/printable-signup tools — relocated here from
                the Team page so Team Code + QR/signup live together as
                one access-management feature. */}
            <button
              onClick={() => setQrModalOpen(true)}
              style={{
                width: "100%",
                marginTop: ".5rem",
                padding: ".55rem .75rem",
                background: "#f0f4ff",
                color: "#1d4ed8",
                border: "1.5px solid #dbeafe",
                borderRadius: 9,
                fontSize: ".82rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Team QR &amp; Signup Sheet
            </button>
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

      {/* ── Team Staff section (Head Coach only) ── */}
      {coach.role === "head_coach" && (
        <div style={{
          background: "#fff",
          borderRadius: 13,
          padding: "1rem",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          marginTop: ".75rem",
        }}>
          <h2 style={{ margin: "0 0 .18rem", fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".09em" }}>
            Team Staff
          </h2>
          <p style={{ margin: "0 0 .75rem", fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>
            Manage the assistant coaches and boosters who help run your team.
          </p>
          <button
            onClick={() => router.push(`/team/${slug}/staff`)}
            style={{ width: "100%", padding: ".6rem .75rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}
          >
            Manage Team Staff
          </button>
        </div>
      )}

      {/* ── Your Teams section ── */}
      <div style={{
        background: "#fff",
        borderRadius: 13,
        padding: "1rem",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginTop: ".75rem",
      }}>
        <h2 style={{ margin: "0 0 .18rem", fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".09em" }}>
          Your Teams
        </h2>
        <p style={{ margin: "0 0 .75rem", fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>
          Coaching more than one team? Switch between them or link a new one.
        </p>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button
            onClick={() => router.push("/teams")}
            style={{ flex: 1, padding: ".6rem .75rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}
          >
            Switch Team
          </button>
          <button
            onClick={() => router.push("/enter-code")}
            style={{ flex: 1, padding: ".6rem .75rem", background: "#fff", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: 9, fontSize: ".82rem", fontWeight: 600, cursor: "pointer" }}
          >
            + Add Team
          </button>
        </div>
      </div>

      {qrModalOpen && (
        <TeamQrModal
          settings={joinCodeSettings}
          joinCode={joinCodeState.joinCode}
          loading={joinCodeState.loading}
          qrDataUrl={joinCodeState.qrDataUrl}
          error={joinCodeState.error}
          setError={joinCodeState.setError}
          busy={joinCodeState.busy}
          joinUrl={joinCodeState.joinUrl}
          qrFilename={joinCodeState.qrFilename}
          generateOrRegenerate={joinCodeState.generateOrRegenerate}
          onClose={() => setQrModalOpen(false)}
        />
      )}
    </div>
    </>
  );
}
