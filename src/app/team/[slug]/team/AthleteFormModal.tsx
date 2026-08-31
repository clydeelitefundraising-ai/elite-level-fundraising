"use client";

import { ATHLETE_CLASS_OPTIONS } from "@/lib/supabase";
import Modal from "../_components/Modal";
import type { AthleteRosterState } from "./useAthleteRoster";

// D3: the Add/Edit Athlete modal, extracted verbatim from TeamView.tsx's
// original body and rendered EXACTLY ONCE by TeamView.tsx's new wrapper —
// never by AthleteRosterGrid.tsx or DesktopRosterTable.tsx individually.
// This matters because Modal renders via createPortal(document.body): a
// display:none ancestor (the mobileOnly/desktopOnly CSS toggle) does NOT
// hide portaled content, so if both the mobile grid and the desktop table
// each rendered their own copy of this modal, an eligible desktop actor
// would see two overlapping modals stacked on top of each other. One
// shared instance, driven by the one shared useAthleteRoster() state,
// is what makes "one authoritative athlete-management workflow" actually
// true rather than just true in the data layer.

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8). Kept even though the desktop
  // table also opens this same modal — there is only one modal, and it
  // must still behave correctly when opened from the mobile grid.
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

export default function AthleteFormModal({ roster }: { roster: AthleteRosterState }) {
  const {
    isEditing, modalOpen, saving, error, form, setForm,
    photoPreview, photoUploading, photoError,
    closeModal, handlePhotoUpload, handleAdd, handleEdit,
  } = roster;

  if (!modalOpen) return null;

  return (
    <Modal title={isEditing ? "Edit Athlete" : "Add Athlete"} onClose={closeModal}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
          <label style={{ ...lbl, gridColumn: "1 / -1" }}>
            Name *
            <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Athlete name" autoFocus />
          </label>
          <label style={{ ...lbl, gridColumn: "1 / -1" }}>
            Class *
            <select style={inp} value={form.class_year} onChange={e => setForm(f => ({ ...f, class_year: e.target.value }))}>
              <option value="">Select class…</option>
              {ATHLETE_CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ ...lbl, gridColumn: "1 / -1" }}>
            Event / Position
            <input style={inp} value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))} placeholder="e.g. Sprints, Distance, Jumps" />
          </label>
          <label style={lbl}>
            Jersey #
            <input type="number" style={inp} value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))} placeholder="Optional" />
          </label>
          <label style={lbl}>
            Grad Year
            <input type="number" style={inp} value={form.grad_year} onChange={e => setForm(f => ({ ...f, grad_year: e.target.value }))} placeholder="e.g. 2027" />
          </label>
          <label style={{ ...lbl, gridColumn: "1 / -1" }}>
            Fundraising Goal
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: ".75rem", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: ".875rem", pointerEvents: "none" }}>$</span>
              <input
                type="number"
                min="0"
                step="1"
                style={{ ...inp, paddingLeft: "1.5rem" }}
                value={form.goal_cents}
                onChange={e => setForm(f => ({ ...f, goal_cents: e.target.value }))}
                placeholder="500"
              />
            </div>
          </label>
          <label style={lbl}>
            Contact Phone
            <input
              type="tel"
              style={inp}
              value={form.contact_phone}
              onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
              placeholder="Optional"
            />
          </label>
          <label style={lbl}>
            Contact Email
            <input
              type="email"
              style={inp}
              value={form.contact_email}
              onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
              placeholder="Optional"
            />
          </label>
        </div>

        {/* ── Photo upload ── */}
        <div style={lbl}>
          Photo
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginTop: ".1rem" }}>
            {(photoPreview || form.profile_photo) && (
              <img
                src={photoPreview || form.profile_photo}
                alt="Preview"
                style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", flexShrink: 0, boxShadow: "0 2px 6px rgba(0,0,0,.12)" }}
              />
            )}
            <div style={{ flex: 1 }}>
              <label style={{
                display: "inline-block", padding: ".4rem .85rem",
                background: photoUploading ? "#f9fafb" : "#f3f4f6",
                border: "1.5px solid #e5e7eb", borderRadius: 8,
                fontSize: ".78rem", fontWeight: 600, color: photoUploading ? "#9ca3af" : "#374151",
                cursor: photoUploading ? "not-allowed" : "pointer",
              }}>
                {photoUploading ? "Uploading…" : photoPreview || form.profile_photo ? "Change Photo" : "Choose Photo"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={photoUploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }}
                />
              </label>
              <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".25rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                JPEG, PNG, HEIC · max 10MB · auto-resized
              </div>
            </div>
          </div>
          {photoError && (
            <p style={{ margin: 0, color: "#dc2626", fontSize: ".75rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              {photoError}
            </p>
          )}
        </div>

        {error && (
          <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
          <button onClick={closeModal} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving || photoUploading} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving || photoUploading ? "not-allowed" : "pointer", opacity: saving || photoUploading ? .7 : 1 }}>
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Athlete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
