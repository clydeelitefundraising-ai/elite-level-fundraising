"use client";

import { useState } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Style tokens ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: ".875rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".75rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

// ── Helpers ───────────────────────────────────────────────────────────────────────

const EVENT_TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  practice:   { bg: "#dbeafe", color: "#1d4ed8" },
  meet:       { bg: "#ede9fe", color: "#6d28d9" },
  fundraiser: { bg: "#dcfce7", color: "#15803d" },
  team:       { bg: "#f3f4f6", color: "#374151" },
};

function labelDate(d: string): string {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (d === today)    return "Today";
  if (d === tomorrow) return "Tomorrow";
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" })
    .format(new Date(y, m - 1, day));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Form type ─────────────────────────────────────────────────────────────────────

type EvForm = {
  title: string;
  event_date: string;
  event_time: string;
  location: string;
  type: "practice" | "meet" | "fundraiser" | "team";
};

const BLANK: EvForm = {
  title: "", event_date: todayISO(), event_time: "", location: "", type: "practice",
};

function fromRow(e: CalendarEventRow): EvForm {
  return {
    title:      e.title,
    event_date: e.event_date,
    event_time: e.event_time,
    location:   e.location,
    type:       e.type,
  };
}

// ── Main component ────────────────────────────────────────────────────────────────

export default function CalendarView({
  slug,
  initialEvents,
  coach,
}: {
  slug: string;
  initialEvents: CalendarEventRow[];
  coach: CoachSession | null;
}) {
  const [events,  setEvents]  = useState<CalendarEventRow[]>(initialEvents);
  const [form,    setForm]    = useState<EvForm>(BLANK);
  const [editing, setEditing] = useState<CalendarEventRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const openAdd = () => {
    setForm({ ...BLANK, event_date: todayISO() });
    setError("");
    setShowAdd(true);
  };

  const openEdit = (ev: CalendarEventRow) => { setForm(fromRow(ev)); setError(""); setEditing(ev); };

  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); };

  const handleAdd = async () => {
    if (!form.title.trim() || !form.event_date) { setError("Title and date are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add event."); return; }
    // Insert into correct sorted position (by date then time)
    setEvents(prev => [...prev, data].sort((a, b) =>
      a.event_date === b.event_date
        ? (a.event_time ?? "").localeCompare(b.event_time ?? "")
        : a.event_date.localeCompare(b.event_date)
    ));
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.title.trim() || !form.event_date) { setError("Title and date are required."); return; }
    setSaving(true); setError("");
    const res = await fetch(`/api/team/${slug}/events/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update event."); return; }
    setEvents(prev =>
      prev.map(e => e.id === editing.id ? { ...e, ...form } : e)
          .sort((a, b) =>
            a.event_date === b.event_date
              ? (a.event_time ?? "").localeCompare(b.event_time ?? "")
              : a.event_date.localeCompare(b.event_date)
          )
    );
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    const res = await fetch(`/api/team/${slug}/events/${id}`, { method: "DELETE" });
    if (res.ok) setEvents(prev => prev.filter(e => e.id !== id));
  };

  // Group by date
  const groups = new Map<string, CalendarEventRow[]>();
  for (const ev of events) {
    if (!groups.has(ev.event_date)) groups.set(ev.event_date, []);
    groups.get(ev.event_date)!.push(ev);
  }

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  return (
    <>
      {/* Section header + CoachBar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem" }}>
        <h2 style={{ margin: 0, fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
          Schedule · {events.length} event{events.length !== 1 ? "s" : ""}
        </h2>
        <CoachBar coach={coach} label="Add Event" onAdd={openAdd} />
      </div>

      {events.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: "2rem 1.25rem", textAlign: "center", color: "#9ca3af", fontSize: ".9rem", border: "1px solid #f0f0f0" }}>
          No events scheduled yet.
        </div>
      ) : (
        Array.from(groups.entries()).map(([date, evs]) => (
          <div key={date} style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: "1px solid #f0f0f0", marginBottom: ".875rem" }}>
            <div style={{ padding: ".6rem 1.1rem", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", fontSize: ".78rem", fontWeight: 700, color: "#374151", letterSpacing: ".02em" }}>
              {labelDate(date)}
            </div>
            {evs.map((ev, i) => {
              const s = EVENT_TYPE_STYLE[ev.type] ?? EVENT_TYPE_STYLE["team"];
              return (
                <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: ".875rem", padding: ".875rem 1.1rem", borderBottom: i < evs.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <div style={{ flexShrink: 0, width: 56, paddingTop: ".15rem", fontSize: ".75rem", color: "#6b7280", fontWeight: 500, textAlign: "right" }}>
                    {ev.event_time || "—"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: ".25rem" }}>
                      <span style={{ fontWeight: 700, fontSize: ".9rem", color: "#111827" }}>{ev.title}</span>
                      <span style={{ padding: ".1rem .5rem", borderRadius: 100, fontSize: ".6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0 }}>
                        {ev.type}
                      </span>
                    </div>
                    {ev.location && <div style={{ fontSize: ".78rem", color: "#6b7280" }}>📍 {ev.location}</div>}
                    {/* Coach actions */}
                    {coach && (
                      <div style={{ display: "flex", gap: ".35rem", marginTop: ".35rem" }}>
                        <button onClick={() => openEdit(ev)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, color: "#6b7280", padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>Edit</button>
                        {coach.role === "head_coach" && (
                          <button onClick={() => handleDelete(ev.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, color: "#dc2626", padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>Delete</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <Modal title={isEditing ? "Edit Event" : "Add Event"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <label style={lbl}>
              Title *
              <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Practice" autoFocus />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <label style={lbl}>
                Date *
                <input type="date" style={inp} value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
              </label>
              <label style={lbl}>
                Time
                <input style={inp} value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} placeholder="e.g. 3:30 PM" />
              </label>
            </div>
            <label style={lbl}>
              Location
              <input style={inp} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Field House" />
            </label>
            <label style={lbl}>
              Type
              <select style={inp} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as EvForm["type"] }))}>
                <option value="practice">Practice</option>
                <option value="meet">Meet</option>
                <option value="fundraiser">Fundraiser</option>
                <option value="team">Team</option>
              </select>
            </label>
            {error && <p style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeModal} style={{ padding: ".45rem .9rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving} style={{ padding: ".45rem .9rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Event"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
