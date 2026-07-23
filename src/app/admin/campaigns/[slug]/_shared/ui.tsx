"use client";

import { useState, useCallback } from "react";

// Shared design tokens + primitives for the admin campaign console
// (CampaignControlCenter and every section extracted from it, e.g.
// AdminCampaignSponsors / AdminCampaignAthletes) — single source so new
// sections stay visually consistent without copy-pasting style objects.

export const T = {
  label:  { fontSize: ".72rem", fontWeight: 700, color: "#6e6e73", textTransform: "uppercase" as const, letterSpacing: ".05em", display: "block", marginBottom: ".35rem" },
  input:  { padding: ".5rem .75rem", border: "1px solid #d1d5db", borderRadius: 8, fontSize: ".875rem", color: "#1d1d1f", background: "#fff", width: "100%", boxSizing: "border-box" as const, outline: "none" },
  card:   { background: "#fff", borderRadius: 14, border: "1px solid #f0f0f2", padding: "1.5rem", marginBottom: "1rem" },
  muted:  { fontSize: ".72rem", color: "#98989d", fontWeight: 500, marginTop: ".2rem" },
  grid2:  { display: "grid" as const, gridTemplateColumns: "1fr 1fr" as const, gap: "1rem" },
};

export function SectionHeader({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1.25rem", paddingBottom: ".875rem", borderBottom: "1px solid #f5f5f7", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: ".9rem", fontWeight: 700, color: "#1d1d1f" }}>{title}</h2>
        {desc && <p style={{ margin: ".2rem 0 0", fontSize: ".75rem", color: "#98989d" }}>{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={T.label}>{label}</label>
      {children}
      {note && <div style={T.muted}>{note}</div>}
    </div>
  );
}

export function SaveBtn({ saving, onClick, label = "Save changes", disabled }: { saving: boolean; onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={saving || disabled}
      style={{ padding: ".45rem 1.1rem", background: saving || disabled ? "#9ca3af" : "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, cursor: saving || disabled ? "not-allowed" : "pointer", fontSize: ".8rem", fontWeight: 600, marginTop: "1.25rem" }}>
      {saving ? "Saving…" : label}
    </button>
  );
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const show = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);
  return { toast, show };
}

export function Toast({ toast }: { toast: { msg: string; type: "success" | "error" } | null }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", background: toast.type === "error" ? "#dc2626" : "#0b1e3d", color: "#fff", padding: ".65rem 1.25rem", borderRadius: 10, zIndex: 1000, fontSize: ".82rem", fontWeight: 500, boxShadow: "0 4px 20px rgba(0,0,0,.25)", maxWidth: 360 }}>
      {toast.msg}
    </div>
  );
}
