"use client";

import { useEffect, useState } from "react";
import type { OutreachRow } from "@/lib/teamData";
import type { FollowUpRow } from "@/lib/followUps";
import { FOLLOW_UP_STATUS_LABEL } from "@/lib/followUps";
import Modal from "../_components/Modal";
import { STATUS_STYLE, fmtDate } from "./followUpsFormat";
import type { FollowUpsWorkspaceState } from "./useFollowUpsWorkspace";

// D6: the Update-outreach and View-History modals, extracted verbatim
// from FollowUpsView.tsx's original body and rendered EXACTLY ONCE by
// FollowUpsWorkspaceView.tsx — never by FollowUpsView.tsx or
// DesktopFollowUpsView.tsx individually. Modal.tsx renders via
// createPortal(document.body): a display:none ancestor (the
// mobileOnly/desktopOnly CSS toggle) does NOT hide portaled content, so
// if both presentations each rendered their own copy, an eligible desktop
// actor could see two overlapping modals — identical to D3/D4/D5's
// AthleteFormModal.tsx/EventFormModal.tsx/AnnouncementFormModal.tsx
// precedent. Fields, statuses, validation, endpoint, and mutation
// behavior are all unchanged.
export default function FollowUpModals({ workspace }: { workspace: FollowUpsWorkspaceState }) {
  const { slug, updateAthlete, historyAthlete, closeUpdate, closeHistory, applyOutreachUpdate } = workspace;

  return (
    <>
      {updateAthlete && (
        <UpdateFollowUpModal
          slug={slug}
          athlete={updateAthlete}
          onClose={closeUpdate}
          onSaved={(status, note, createdAt) => {
            applyOutreachUpdate(updateAthlete.id, status, note, createdAt);
            closeUpdate();
          }}
        />
      )}

      {historyAthlete && (
        <FollowUpHistoryModal slug={slug} athlete={historyAthlete} onClose={closeHistory} />
      )}
    </>
  );
}

// ── Update modal ─────────────────────────────────────────────────────────

function UpdateFollowUpModal({
  slug,
  athlete,
  onClose,
  onSaved,
}: {
  slug: string;
  athlete: FollowUpRow;
  onClose: () => void;
  onSaved: (status: OutreachRow["status"], note: string | null, createdAt: string) => void;
}) {
  const [status, setStatus] = useState<OutreachRow["status"]>(athlete.outreachStatus ?? "contacted");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/outreach/${athlete.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note.trim() || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
    onSaved(data.status, data.note ?? null, data.created_at);
  };

  return (
    <Modal title={`Update — ${athlete.name}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
        <label style={lbl}>
          Status
          <select value={status} onChange={e => setStatus(e.target.value as OutreachRow["status"])} style={inp}>
            <option value="contacted">Contacted</option>
            <option value="needs_follow_up">Needs Follow Up</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label style={lbl}>
          Note (optional)
          <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="e.g. Only 3 contacts entered. Asked athlete to add more tonight." />
        </label>
        {error && <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>{error}</p>}
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={smallBtnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...smallBtn, opacity: saving ? .7 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── History modal ────────────────────────────────────────────────────────

function FollowUpHistoryModal({ slug, athlete, onClose }: { slug: string; athlete: FollowUpRow; onClose: () => void }) {
  const [history, setHistory] = useState<OutreachRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${slug}/outreach/${athlete.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!cancelled) setHistory(d); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch-on-mount for this fixed athlete/slug pair, same pattern as EnterCodeView.tsx
  }, []);

  return (
    <Modal title={`History — ${athlete.name}`} onClose={onClose}>
      {loading ? (
        <p style={{ fontSize: ".85rem", color: "#6b7280", textAlign: "center", margin: "1rem 0" }}>Loading…</p>
      ) : !history || history.length === 0 ? (
        <p style={{ fontSize: ".85rem", color: "#9ca3af", textAlign: "center", margin: "1rem 0" }}>No follow-up history yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
          {history.map(h => {
            const badge = STATUS_STYLE[h.status];
            return (
              <div key={h.id} style={{ borderLeft: `3px solid ${badge.color}`, paddingLeft: ".7rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".15rem" }}>
                  <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, fontSize: ".6rem", fontWeight: 700, padding: ".12rem .5rem", textTransform: "uppercase" }}>
                    {FOLLOW_UP_STATUS_LABEL[h.status]}
                  </span>
                  <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>{fmtDate(h.created_at)}{h.contacted_by ? ` · ${h.contacted_by}` : ""}</span>
                </div>
                {h.note && <p style={{ margin: 0, fontSize: ".82rem", color: "#374151", lineHeight: 1.5 }}>{h.note}</p>}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ── Style tokens ──────────────────────────────────────────────────────────

const smallBtn: React.CSSProperties = {
  padding: ".4rem .75rem", background: "#0b1e3d", color: "#fff", border: "none",
  borderRadius: 8, fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
};

const smallBtnGhost: React.CSSProperties = {
  padding: ".4rem .75rem", background: "#f3f4f6", color: "#374151", border: "none",
  borderRadius: 8, fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
};

const inp: React.CSSProperties = {
  padding: ".5rem .75rem", border: "1.5px solid #e5e7eb", borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
  fontSize: "1rem", width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem", fontWeight: 700,
  color: "#374151", textTransform: "uppercase", letterSpacing: ".05em",
};
