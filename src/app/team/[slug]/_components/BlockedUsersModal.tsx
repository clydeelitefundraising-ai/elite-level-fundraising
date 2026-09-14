"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BlockRow = { id: string; blocked_kind: string; blocked_id: string; blocked_name: string; blocked_role: string; created_at: string };

// Minimal "Manage Blocked Users" list — Unblock reverses blockUser()
// exactly (deletes the same user_blocks row), immediately restoring the
// ability to start a new direct conversation. Name/role are resolved
// fresh server-side per row (see lib/moderation/blocks.ts's
// getBlockedByMeWithDisplay) — never a raw id or email, which would leak
// a private identifier where a normal display name is available.
export default function BlockedUsersModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [blocks, setBlocks] = useState<BlockRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    fetch(`/api/team/${slug}/blocks`)
      .then(r => r.ok ? r.json() : { blocks: [] })
      .then(d => setBlocks(d.blocks ?? []))
      .catch(() => setBlocks([]));
  };
  useEffect(load, [slug]);

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await fetch(`/api/team/${slug}/blocks/${id}`, { method: "DELETE" });
      load();
    } finally {
      setBusyId(null);
    }
  };

  // QA fix: this modal is mounted from AccountMenu, which itself lives
  // inside TeamHeader/DesktopSidebar — rendering inline (no portal) left
  // this fixed-position overlay trapped inside an ancestor stacking
  // context (DesktopSidebar's `position: sticky`, which unconditionally
  // creates one regardless of z-index), so its own z-index:1000 was only
  // ever compared against siblings WITHIN that trapped context, not the
  // whole page — the modal painted behind other page content instead of
  // above it, reading as "washed out." Portaling straight to
  // document.body is the same fix the codebase's own shared Modal.tsx
  // primitive already uses for exactly this reason.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", pointerEvents: "auto" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: "12px", padding: "1.25rem", maxWidth: "400px", width: "100%", boxShadow: "0 8px 30px rgba(0,0,0,.2)" }}>
        <h3 style={{ margin: "0 0 .75rem", fontSize: "1.05rem", fontWeight: 800 }}>Blocked users</h3>

        {blocks === null ? (
          <p style={{ fontSize: ".82rem", color: "#6b7280" }}>Loading…</p>
        ) : blocks.length === 0 ? (
          <p style={{ fontSize: ".82rem", color: "#6b7280" }}>You haven&apos;t blocked anyone.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", marginBottom: ".75rem" }}>
            {blocks.map(b => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".5rem .65rem", background: "#f9fafb", borderRadius: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.blocked_name}
                  </div>
                  {b.blocked_role && (
                    <div style={{ fontSize: ".72rem", color: "#6b7280" }}>{b.blocked_role}</div>
                  )}
                </div>
                <button
                  onClick={() => unblock(b.id)}
                  disabled={busyId === b.id}
                  style={{ padding: ".3rem .7rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: ".76rem", fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                >
                  {busyId === b.id ? "…" : "Unblock"}
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: ".5rem .9rem", borderRadius: 8, border: "1.5px solid #d1d5db", background: "transparent", fontSize: ".82rem", fontWeight: 700, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
