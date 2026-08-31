"use client";

import type { EventType } from "@/lib/calendarShared";
import Modal from "../_components/Modal";
import type { CalendarWorkspaceState } from "./useCalendarWorkspace";

// D4: the Add/Edit Event modal, extracted verbatim from CalendarView.tsx's
// original body and rendered EXACTLY ONCE by CalendarWorkspaceView.tsx —
// never by CalendarView.tsx or DesktopCalendarView.tsx individually. Modal
// renders via createPortal(document.body): a display:none ancestor (the
// mobileOnly/desktopOnly CSS toggle) does NOT hide portaled content, so if
// both presentations each rendered their own copy, an eligible desktop
// actor would see two overlapping modals stacked on top of each other —
// identical to D3's AthleteFormModal.tsx precedent.

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
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

export default function EventFormModal({ cal }: { cal: CalendarWorkspaceState }) {
  const {
    isEditing, modalOpen, saving, error, form, setForm,
    editing, editingLegacyTime,
    closeModal, handleAdd, handleEdit,
  } = cal;

  if (!modalOpen) return null;

  return (
    <Modal title={isEditing ? "Edit Event" : "Add Event"} onClose={closeModal}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
        <label style={lbl}>
          Title *
          <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Practice" autoFocus />
        </label>
        <label style={lbl}>
          Date *
          <input type="date" style={inp} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
          <label style={lbl}>
            Start Time
            <input type="time" style={inp} value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
          </label>
          <label style={lbl}>
            End Time
            <input type="time" style={inp} value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
          </label>
        </div>
        {editingLegacyTime && (
          <p style={{ margin: 0, fontSize: ".75rem", color: "#9ca3af" }}>
            This event&apos;s current time is &ldquo;{editing!.event_time}&rdquo;. Set a start time above to switch it to a structured time.
          </p>
        )}
        <label style={lbl}>
          Location
          <input style={inp} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Field House" />
        </label>
        <label style={lbl}>
          Description
          <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional details… e.g. Bring spikes." />
        </label>
        <label style={lbl}>
          Type
          <select style={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as EventType }))}>
            <option value="practice">Practice</option>
            <option value="meet">Meet</option>
            <option value="fundraiser">Fundraiser</option>
            <option value="team">Team</option>
          </select>
        </label>
        {error && (
          <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
          <button onClick={closeModal} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Event"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
