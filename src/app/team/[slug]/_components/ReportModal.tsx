"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

export type ReportTargetType = "announcement" | "comment" | "message" | "attachment" | "user";

const REASONS: { value: string; label: string }[] = [
  { value: "harassment",             label: "Harassment or bullying" },
  { value: "inappropriate_content",  label: "Inappropriate content" },
  { value: "spam",                   label: "Spam" },
  { value: "safety_concern",         label: "Safety concern" },
  { value: "impersonation",          label: "Impersonation" },
  { value: "other",                  label: "Other" },
];

// Minimal Report flow (Select Report -> choose reason -> optional
// details -> confirmation -> submit), reused across every UGC surface.
// Deliberately plain inline styles matching this codebase's existing
// convention (see CommentsSection.tsx) rather than a new design system —
// no existing page is redesigned to accommodate this.
export default function ReportModal({
  slug,
  targetType,
  targetId,
  targetKind,
  onClose,
}: {
  slug: string;
  targetType: ReportTargetType;
  targetId: string;
  targetKind?: "coach" | "member" | "platform_admin";
  onClose: () => void;
}) {
  const [reason, setReason]   = useState("");
  const [details, setDetails] = useState("");
  const [step, setStep]       = useState<"form" | "submitting" | "done" | "error">("form");
  const [error, setError]     = useState("");

  const submit = async () => {
    if (!reason) return;
    setStep("submitting");
    try {
      const res = await fetch(`/api/team/${slug}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, targetKind, reason, details: details.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to submit report.");
        setStep("error");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStep("error");
    }
  };

  // QA fix (same as BlockedUsersModal): rendered inline this was trapped
  // inside DesktopSidebar's `position: sticky` stacking context — that
  // property unconditionally creates one regardless of z-index — so the
  // modal painted behind other page content instead of above it.
  // Portaling to document.body is the same fix already applied there and
  // matches the codebase's own shared Modal.tsx primitive.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: "var(--surface-app, #fff)", borderRadius: "12px", padding: "1.25rem", maxWidth: "420px", width: "100%", boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}
      >
        {step === "done" ? (
          <>
            <h3 style={{ margin: "0 0 .5rem", fontSize: "1.05rem", fontWeight: 800 }}>Report submitted</h3>
            <p style={{ margin: "0 0 1rem", fontSize: ".85rem", color: "var(--text-muted-app, #6b7280)" }}>
              Thanks — your team&apos;s Head Coach and ELF staff have been notified and will review it.
            </p>
            <button onClick={onClose} style={primaryBtnStyle}>Close</button>
          </>
        ) : (
          <>
            <h3 style={{ margin: "0 0 .75rem", fontSize: "1.05rem", fontWeight: 800 }}>
              Report {targetType === "user" ? "user" : "content"}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: ".4rem", marginBottom: ".75rem" }}>
              {REASONS.map(r => (
                <label key={r.value} style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".85rem", cursor: "pointer" }}>
                  <input type="radio" name="report-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
                  {r.label}
                </label>
              ))}
            </div>

            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="Optional details…"
              maxLength={1000}
              rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: ".5rem .65rem", borderRadius: "8px", border: "1.5px solid var(--border-app, #d1d5db)", fontSize: ".85rem", fontFamily: "inherit", marginBottom: ".75rem", resize: "vertical" }}
            />

            {step === "error" && <div style={{ fontSize: ".8rem", color: "#dc2626", marginBottom: ".6rem" }}>{error}</div>}

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
              <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={submit} disabled={!reason || step === "submitting"} style={{ ...primaryBtnStyle, opacity: !reason || step === "submitting" ? 0.6 : 1 }}>
                {step === "submitting" ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: ".5rem .9rem", borderRadius: "8px", border: "none",
  background: "var(--team-primary, #0b1e3d)", color: "var(--team-primary-foreground, #fff)",
  fontSize: ".82rem", fontWeight: 700, cursor: "pointer",
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: ".5rem .9rem", borderRadius: "8px", border: "1.5px solid var(--border-app, #d1d5db)",
  background: "transparent", color: "var(--text-primary-app, #111827)",
  fontSize: ".82rem", fontWeight: 700, cursor: "pointer",
};
