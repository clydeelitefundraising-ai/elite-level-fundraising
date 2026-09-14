"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

// Phase A38: self-service account deletion, reachable from AccountMenu
// (mounted for every role — coach, member, platform admin) rather than
// only the Settings page, which today is gated Coach-only and would
// otherwise leave athletes/parents/boosters with no in-app path at all.
// See src/lib/accountDeletion.ts for the full deletion architecture and
// the head-coach/platform-admin protections this can be refused by.
export default function DeleteAccountModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [step, setStep] = useState<"confirm" | "submitting" | "error">("confirm");
  const [error, setError] = useState("");
  const [blockedCampaigns, setBlockedCampaigns] = useState<string[] | null>(null);

  const canSubmit = confirmText.trim().toUpperCase() === "DELETE";

  const submit = async () => {
    if (!canSubmit) return;
    setStep("submitting");
    setError("");
    setBlockedCampaigns(null);
    try {
      const res = await fetch(`/api/team/${slug}/account/delete`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to delete account. Please try again.");
        if (Array.isArray(data?.campaigns)) setBlockedCampaigns(data.campaigns);
        setStep("error");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStep("error");
    }
  };

  // QA fix (same as BlockedUsersModal, mounted from the same AccountMenu
  // -> TeamHeader/DesktopSidebar ancestry): portaled to document.body so
  // DesktopSidebar's `position: sticky` stacking context can never trap
  // this destructive-confirmation modal behind other page content.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", pointerEvents: "auto" }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "1.35rem", maxWidth: "440px", width: "100%", boxShadow: "0 8px 30px rgba(0,0,0,.25)" }}>
        <h3 style={{ margin: "0 0 .6rem", fontSize: "1.1rem", fontWeight: 800, color: "#111827" }}>Delete your account</h3>
        <p style={{ margin: "0 0 .5rem", fontSize: ".84rem", color: "#374151", lineHeight: 1.55 }}>
          This permanently deletes your ELF login and profile — your email, password, and profile photo are removed
          and cannot be recovered. You&apos;ll be signed out everywhere immediately and won&apos;t be able to log
          back in with this account.
        </p>
        <p style={{ margin: "0 0 .5rem", fontSize: ".84rem", color: "#374151", lineHeight: 1.55 }}>
          Your personal content is deleted too: comments you&apos;ve posted, your direct messages and any photos or
          files you&apos;ve sent in them, your likes, and your blocks are all removed — not just hidden.
        </p>
        <p style={{ margin: "0 0 1rem", fontSize: ".78rem", color: "#6b7280", lineHeight: 1.55 }}>
          A few things are kept where ELF is legitimately required to: team announcements are official team records
          (not personal content) and stay in place for the team; fundraising and donation records, campaign totals,
          and financial/accounting history are entirely unaffected — nothing here ever touches them; and a report
          you&apos;ve filed may be kept for safety review with your name removed rather than the report itself being
          deleted. This action cannot be undone.
        </p>

        {error && (
          <div style={{ padding: ".6rem .75rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, marginBottom: ".75rem", fontSize: ".8rem", color: "#b91c1c" }}>
            {error}
            {blockedCampaigns && blockedCampaigns.length > 0 && (
              <ul style={{ margin: ".4rem 0 0", paddingLeft: "1.1rem" }}>
                {blockedCampaigns.map(c => <li key={c}>{c}</li>)}
              </ul>
            )}
          </div>
        )}

        <label style={{ display: "block", fontSize: ".78rem", fontWeight: 700, color: "#374151", marginBottom: ".3rem" }}>
          Type DELETE to confirm
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder="DELETE"
          style={{ width: "100%", boxSizing: "border-box", padding: ".55rem .7rem", borderRadius: 8, border: "1.5px solid #d1d5db", fontSize: ".9rem", marginBottom: "1rem" }}
        />

        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: ".55rem .9rem", borderRadius: 8, border: "1.5px solid #d1d5db", background: "transparent", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || step === "submitting"}
            style={{ padding: ".55rem .9rem", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: canSubmit ? "pointer" : "default", opacity: !canSubmit || step === "submitting" ? .6 : 1 }}
          >
            {step === "submitting" ? "Deleting…" : "Permanently delete account"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
