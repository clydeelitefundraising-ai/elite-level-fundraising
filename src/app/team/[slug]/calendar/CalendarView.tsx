"use client";

import { useState } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import { isStaff, type TeamActor } from "@/lib/permissions";
import {
  type EventType,
  eventTypeStyle,
  arizonaTodayISO,
  arizonaTomorrowISO,
  formatDateHeader,
  displayEventTime,
} from "@/lib/calendarShared";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";
import EventDetailsModal from "../_components/EventDetailsModal";

// ── Style tokens ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
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
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

// ── Date group card ───────────────────────────────────────────────────────────

function DateGroupCard({
  date,
  evs,
  isToday,
  isTomorrow,
  onOpen,
}: {
  date: string;
  evs: CalendarEventRow[];
  isToday: boolean;
  isTomorrow: boolean;
  onOpen: (ev: CalendarEventRow) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { dayNum, weekday, monthYear } = formatDateHeader(date);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: hovered
          ? "0 4px 18px rgba(0,0,0,.09), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".75rem",
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "transform .14s ease, box-shadow .14s ease",
      }}
    >
      {/* Date header */}
      <div style={{
        padding: ".7rem 1rem .65rem",
        borderBottom: "1px solid #f3f4f6",
        display: "flex",
        alignItems: "center",
        gap: ".75rem",
        background: isToday ? "linear-gradient(135deg, #f0f4ff 0%, #fff 60%)" : "#fff",
      }}>
        <div style={{
          fontWeight: 800,
          fontSize: "1.7rem",
          color: isToday ? "#0b1e3d" : "#374151",
          lineHeight: 1,
          minWidth: 30,
          textAlign: "center",
        }}>
          {dayNum}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: ".84rem", color: "#111827", lineHeight: 1.2 }}>
            {weekday}
          </div>
          <div style={{ fontSize: ".64rem", color: "#9ca3af", marginTop: ".06rem" }}>
            {monthYear}
          </div>
        </div>
        {isToday && (
          <span style={{ background: "#0b1e3d", color: "#fff", borderRadius: 100, fontSize: ".57rem", fontWeight: 700, padding: ".14rem .55rem", lineHeight: 1.4, flexShrink: 0 }}>
            Today
          </span>
        )}
        {isTomorrow && !isToday && (
          <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".57rem", fontWeight: 700, padding: ".14rem .55rem", lineHeight: 1.4, flexShrink: 0 }}>
            Tomorrow
          </span>
        )}
      </div>

      {/* Event rows */}
      {evs.map((ev, i) => {
        const s = eventTypeStyle(ev.type);
        const time = displayEventTime(ev);
        return (
          <button
            key={ev.id}
            onClick={() => onOpen(ev)}
            style={{
              display: "flex",
              alignItems: "stretch",
              width: "100%",
              border: "none",
              background: "none",
              cursor: "pointer",
              textAlign: "left",
              padding: 0,
              font: "inherit",
              color: "inherit",
              borderBottom: i < evs.length - 1 ? "1px solid #f6f6f8" : "none",
            }}
          >
            {/* Left accent bar */}
            <div style={{ width: 3, background: s.accent, flexShrink: 0 }} />

            {/* Content */}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: ".7rem", padding: ".65rem .9rem .65rem .75rem" }}>
              {/* Time column */}
              <div style={{ flexShrink: 0, width: 60, paddingTop: ".14rem", textAlign: "right" }}>
                <span style={{ fontSize: ".72rem", fontWeight: 600, color: time ? "#374151" : "#d1d5db" }}>
                  {time || "—"}
                </span>
              </div>

              {/* Title + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".12rem" }}>
                  <span style={{ fontWeight: 700, fontSize: ".9rem", color: "#111827" }}>{ev.title}</span>
                  <span style={{
                    padding: ".07rem .42rem", borderRadius: 100,
                    fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0,
                  }}>
                    {ev.type}
                  </span>
                </div>
                {ev.location && (
                  <div style={{ fontSize: ".74rem", color: "#6b7280" }}>📍 {ev.location}</div>
                )}
              </div>

              <span style={{ fontSize: ".85rem", color: "#c1c7d0", flexShrink: 0, paddingTop: ".2rem" }}>›</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Form type ─────────────────────────────────────────────────────────────────

type EvForm = {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  description: string;
  type: EventType;
};

const BLANK: EvForm = {
  title: "", event_date: arizonaTodayISO(), start_time: "", end_time: "",
  location: "", description: "", type: "practice",
};

function fromRow(e: CalendarEventRow): EvForm {
  return {
    title: e.title,
    event_date: e.event_date,
    start_time: e.start_time ?? "",
    end_time: e.end_time ?? "",
    location: e.location,
    description: e.description ?? "",
    type: e.type,
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CalendarView({
  slug,
  initialEvents,
  actor,
}: {
  slug: string;
  initialEvents: CalendarEventRow[];
  actor: TeamActor;
}) {
  // Calendar CRUD is staff-level (head coach, assistant coach, AND booster —
  // whether the booster row lives in team_coaches or team_members), per the
  // RC-1 permission audit.
  const canManage = isStaff(actor);
  const [events,  setEvents]  = useState<CalendarEventRow[]>(initialEvents);
  const [form,    setForm]    = useState<EvForm>(BLANK);
  const [editing, setEditing] = useState<CalendarEventRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [viewing, setViewing] = useState<CalendarEventRow | null>(null);

  const openAdd  = () => { setForm({ ...BLANK, event_date: arizonaTodayISO() }); setError(""); setShowAdd(true); };
  const openEdit = (ev: CalendarEventRow) => { setViewing(null); setForm(fromRow(ev)); setError(""); setEditing(ev); };
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
    setEvents(prev => [...prev, data].sort((a, b) =>
      a.event_date === b.event_date
        ? (a.start_time ?? a.event_time ?? "").localeCompare(b.start_time ?? b.event_time ?? "")
        : a.event_date.localeCompare(b.event_date)
    ));
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.title.trim() || !form.event_date) { setError("Title and date are required."); return; }
    setSaving(true); setError("");
    // Deliberately no event_time key here — the edit form never collects
    // it, so the legacy free-text value on this row (if any) is left
    // completely untouched by this request. See events/[id]/route.ts.
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
              ? (a.start_time ?? a.event_time ?? "").localeCompare(b.start_time ?? b.event_time ?? "")
              : a.event_date.localeCompare(b.event_date)
          )
    );
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event?")) return;
    const res = await fetch(`/api/team/${slug}/events/${id}`, { method: "DELETE" });
    if (res.ok) { setEvents(prev => prev.filter(e => e.id !== id)); setViewing(null); }
  };

  const groups = new Map<string, CalendarEventRow[]>();
  for (const ev of events) {
    if (!groups.has(ev.event_date)) groups.set(ev.event_date, []);
    groups.get(ev.event_date)!.push(ev);
  }

  const today    = arizonaTodayISO();
  const tomorrow = arizonaTomorrowISO();
  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;
  // A legacy event has free-text event_time but no structured start_time —
  // used to show a read-only hint in the edit form instead of silently
  // discarding that historical text.
  const editingLegacyTime = isEditing && !editing!.start_time && editing!.event_time;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* ── Section header ── */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Schedule
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Calendar
          </h2>
          {events.length > 0 && (
            <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={canManage} label="Add Event" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Feed ── */}
      {events.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>📅</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            No events scheduled
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {canManage ? "Add the first event above." : "Check back soon for schedule updates."}
          </div>
        </div>
      ) : (
        Array.from(groups.entries()).map(([date, evs]) => (
          <DateGroupCard
            key={date}
            date={date}
            evs={evs}
            isToday={date === today}
            isTomorrow={date === tomorrow}
            onOpen={setViewing}
          />
        ))
      )}

      {/* ── Event Details ── */}
      {viewing && (
        <EventDetailsModal
          ev={viewing}
          canManage={canManage}
          onClose={() => setViewing(null)}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {/* ── Add / Edit Modal ── */}
      {modalOpen && (
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
      )}
    </div>
  );
}
