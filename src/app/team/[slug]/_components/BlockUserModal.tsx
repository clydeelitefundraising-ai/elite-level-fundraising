"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

// Confirmation dialog for blocking an interpersonal contact. Deliberately
// says exactly what a block does and does NOT do, per the Apple-review
// safeguard design: it must never read as "you'll stop getting team
// announcements from your coach," which is false and would be a
// confusing/misleading UI if implied.
export default function BlockUserModal({
  slug,
  blockedKind,
  blockedId,
  blockedName,
  onClose,
  onBlocked,
}: {
  slug: string;
  blockedKind: "coach" | "member" | "platform_admin";
  blockedId: string;
  blockedName: string;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const [step, setStep] = useState<"confirm" | "submitting" | "error">("confirm");
  const [error, setError] = useState("");

  const submit = async () => {
    setStep("submitting");
    try {
      const res = await fetch(`/api/team/${slug}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedKind, blockedId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Failed to block user.");
        setStep("error");
        return;
      }
      onBlocked();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStep("error");
    }
  };

  // QA fix (same as BlockedUsersModal/ReportModal): portaled to
  // document.body so a `position: sticky` ancestor stacking context
  // (e.g. DesktopSidebar) can never trap this behind other page content.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "1.25rem", maxWidth: "400px", width: "100%", boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}>
        <h3 style={{ margin: "0 0 .5rem", fontSize: "1.05rem", fontWeight: 800 }}>Block {blockedName}?</h3>
        <p style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "#374151", lineHeight: 1.5 }}>
          {blockedName} won&apos;t be able to start a new direct message with you, and you won&apos;t be able to message them.
        </p>
        <p style={{ margin: "0 0 1rem", fontSize: ".78rem", color: "#6b7280", lineHeight: 1.5 }}>
          This does <strong>not</strong> affect official team announcements, schedules, or safety information — those always come through, even from a blocked coach or teammate. You can unblock at any time from Settings.
        </p>

        {step === "error" && <div style={{ fontSize: ".8rem", color: "#dc2626", marginBottom: ".6rem" }}>{error}</div>}

        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: ".5rem .9rem", borderRadius: "8px", border: "1.5px solid #d1d5db", background: "transparent", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={step === "submitting"}
            style={{ padding: ".5rem .9rem", borderRadius: "8px", border: "none", background: "#dc2626", color: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: "pointer", opacity: step === "submitting" ? .6 : 1 }}
          >
            {step === "submitting" ? "Blocking…" : "Block"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
