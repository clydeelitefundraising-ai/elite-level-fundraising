"use client";

import { useEffect, useState } from "react";

type BlockRow = { id: string; blocked_kind: string; blocked_id: string; created_at: string };

// Minimal "Manage Blocked Users" list — Unblock reverses blockUser()
// exactly (deletes the same user_blocks row), immediately restoring the
// ability to start a new direct conversation. Names aren't stored on the
// block row itself (see user_blocks migration — no snapshot), so this
// intentionally shows the role only; good enough for "who did I block and
// can I undo it," which is the whole point of this surface.
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

  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }} onClick={onClose}>
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
                <span style={{ fontSize: ".82rem", color: "#374151", textTransform: "capitalize" }}>{b.blocked_kind.replace("_", " ")}</span>
                <button
                  onClick={() => unblock(b.id)}
                  disabled={busyId === b.id}
                  style={{ padding: ".3rem .7rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", fontSize: ".76rem", fontWeight: 700, cursor: "pointer" }}
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
    </div>
  );
}
