"use client";

import { useState } from "react";
import { Check, Link2, QrCode } from "lucide-react";
import type { CoachSession } from "@/lib/teamSession";
import type { ActiveJoinCode } from "@/lib/teamData";
import TeamQrModal from "../_components/TeamQrModal";
import PrintSignupSheet from "../_components/PrintSignupSheet";
import { useTeamJoinCode, type JoinCodeSettings } from "../_components/useTeamJoinCode";
import { useSeasonReadOnly } from "../_components/SeasonStatus";

// Settings Redesign: the Team Access card (join link, New Code / Revoke,
// Team QR & printable signup sheet) moved verbatim out of the old single
// SettingsView into its own Settings screen. Join-code generation,
// revocation, the QR modal and the same-page print architecture are
// unchanged — only where the card lives changed.
export default function TeamAccessSection({
  slug, coach, initialCode, joinCodeSettings,
}: {
  slug: string;
  coach: CoachSession;
  initialCode: ActiveJoinCode | null;
  joinCodeSettings: JoinCodeSettings;
}) {
  const [code, setCode]       = useState<ActiveJoinCode | null>(initialCode);
  const [working, setWorking] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [error, setError]     = useState("");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  // Complete Season Phase 4B: a completed season's join code is retired
  // (the new season gets its own) and its team settings are history.
  const seasonReadOnly = useSeasonReadOnly();
  const canManageJoinCode = coach.role === "head_coach" && !seasonReadOnly;

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

      <div className="elf-settings-noprint" data-testid="team-access">
      <div style={{
        background: "var(--surface-light)",
        borderRadius: "var(--radius-lg)",
        padding: "1rem",
        border: "1px solid var(--border-app)",
      }}>
        <div style={{ marginBottom: ".8rem" }}>
          <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>
            Share this link with parents and athletes so they can join your team hub.
          </p>
        </div>

        {code ? (
          <>
            {/* Code display */}
            <div style={{
              background: "var(--surface-light-elevated)",
              border: "1.5px solid var(--border-app)",
              borderRadius: 10,
              padding: ".75rem 1rem",
              marginBottom: ".65rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".45rem" }}>
                <span style={{
                  fontFamily: "monospace",
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  color: "var(--text-primary-app)",
                  letterSpacing: ".18em",
                }}>
                  {code.code}
                </span>
                <span style={{
                  padding: ".1rem .5rem",
                  background: "#dcfce7",
                  color: "var(--color-success)",
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
                color: "var(--text-secondary-app)",
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
                  display: "flex", alignItems: "center", justifyContent: "center", gap: ".35rem",
                  padding: ".55rem .75rem",
                  background: copied ? "var(--color-success)" : "var(--team-primary)",
                  color: copied ? "#fff" : "var(--team-primary-foreground)",
                  border: "none",
                  borderRadius: 9,
                  fontSize: ".82rem",
                  fontWeight: 700,
                  cursor: working ? "not-allowed" : "pointer",
                  transition: "background .15s",
                }}
              >
                {copied ? <><Check size={14} /> Copied</> : "Copy Join Link"}
              </button>
              {/* Regenerating/revoking is Head-Coach-only (an Assistant
                  Coach or Booster could otherwise break the team's join
                  link for everyone) — enforced server-side in
                  /api/team/[slug]/join-codes; hidden here too so a
                  non-head-coach never sees a control that would just 401.
                  Copy Join Link stays available to all staff above. */}
              {canManageJoinCode && (
                <>
                  <button
                    onClick={handleGenerate}
                    disabled={working}
                    title="Generate a new code (old code stops working)"
                    style={{
                      padding: ".55rem .75rem",
                      background: "var(--surface-light)",
                      color: "var(--text-secondary-app)",
                      border: "1.5px solid var(--border-app)",
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
                      color: "var(--color-error)",
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
                </>
              )}
            </div>

            {/* Phase 5: QR/printable-signup tools — relocated here from
                the Team page so Team Code + QR/signup live together as
                one access-management feature. */}
            <button
              onClick={() => setQrModalOpen(true)}
              style={{
                width: "100%",
                marginTop: ".5rem",
                display: "flex", alignItems: "center", justifyContent: "center", gap: ".4rem",
                padding: ".55rem .75rem",
                background: "var(--surface-light-elevated)",
                color: "var(--text-secondary-app)",
                border: "1.5px solid var(--border-app)",
                borderRadius: 9,
                fontSize: ".82rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <QrCode size={15} /> Team QR &amp; Signup Sheet
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "1.25rem 0 .5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: ".5rem" }}>
            <Link2 size={26} style={{ color: "var(--text-muted-app)", opacity: .6 }} />
            <p style={{ margin: "0 0 .5rem", fontSize: ".82rem", color: "var(--text-muted-app)" }}>
              {seasonReadOnly ? "This season is completed — join with the current season's code." : "No join code yet. Generate one to let parents and athletes join."}
            </p>
            {!seasonReadOnly && <button
              onClick={handleGenerate}
              disabled={working}
              style={{
                padding: ".6rem 1.5rem",
                background: working ? "#9ca3af" : "var(--team-primary)",
                color: working ? "#fff" : "var(--team-primary-foreground)",
                border: "none",
                borderRadius: 9,
                fontSize: ".875rem",
                fontWeight: 700,
                cursor: working ? "not-allowed" : "pointer",
              }}
            >
              {working ? "Generating…" : "Generate Join Code"}
            </button>}
          </div>
        )}

        {error && (
          <p style={{ margin: ".65rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--color-error)", fontSize: ".8rem" }}>
            {error}
          </p>
        )}

        {/* Instructions */}
        <div style={{
          marginTop: ".9rem",
          paddingTop: ".75rem",
          borderTop: "1px solid var(--border-app)",
          fontSize: ".75rem",
          color: "var(--text-muted-app)",
          lineHeight: 1.55,
        }}>
          <strong style={{ color: "var(--text-secondary-app)" }}>How it works:</strong> Anyone with this link can join your team hub as an athlete or parent. They choose their own role during sign-up. Revoke to immediately invalidate the current link.
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
          signupData={joinCodeState.signupData}
          generateOrRegenerate={joinCodeState.generateOrRegenerate}
          canManageJoinCode={canManageJoinCode}
          onClose={() => setQrModalOpen(false)}
        />
      )}
      </div>
    </>
  );
}
