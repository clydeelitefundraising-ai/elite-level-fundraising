"use client";

import { useState } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import { coachSession, isHeadCoachRole, type TeamActor } from "@/lib/permissions";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

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

// ── Event type styles ─────────────────────────────────────────────────────────

const EVENT_TYPE_STYLE: Record<string, { bg: string; color: string; accent: string }> = {
  practice:   { bg: "#dbeafe", color: "#1d4ed8", accent: "#3b82f6" },
  meet:       { bg: "#ede9fe", color: "#6d28d9", accent: "#8b5cf6" },
  fundraiser: { bg: "#fef3c7", color: "#b45309", accent: "#f59e0b" },
  team:       { bg: "#f3f4f6", color: "#374151", accent: "#9ca3af" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO():    string { return new Date().toISOString().slice(0, 10); }
function tomorrowISO(): string { return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); }

function parseDateHeader(d: string): { dayNum: string; weekday: string; monthYear: string } {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  return {
    dayNum:    String(day),
    weekday:   new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(dt),
    monthYear: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(dt),
  };
}

// ── Date group card ───────────────────────────────────────────────────────────

function DateGroupCard({
  date,
  evs,
  isToday,
  isTomorrow,
  coach,
  onEdit,
  onDelete,
}: {
  date: string;
  evs: CalendarEventRow[];
  isToday: boolean;
  isTomorrow: boolean;
  coach: CoachSession | null;
  onEdit: (ev: CalendarEventRow) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { dayNum, weekday, monthYear } = parseDateHeader(date);

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
        const s = EVENT_TYPE_STYLE[ev.type] ?? EVENT_TYPE_STYLE["team"];
        return (
          <div key={ev.id} style={{
            display: "flex",
            alignItems: "stretch",
            borderBottom: i < evs.length - 1 ? "1px solid #f6f6f8" : "none",
          }}>
            {/* Left accent bar */}
            <div style={{ width: 3, background: s.accent, flexShrink: 0 }} />

            {/* Content */}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: ".7rem", padding: ".65rem .9rem .65rem .75rem" }}>
              {/* Time column */}
              <div style={{ flexShrink: 0, width: 52, paddingTop: ".14rem", textAlign: "right" }}>
                <span style={{ fontSize: ".72rem", fontWeight: 600, color: ev.event_time ? "#374151" : "#d1d5db" }}>
                  {ev.event_time || "—"}
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
                {coach && (
                  <div style={{ display: "flex", gap: ".1rem", marginTop: ".28rem" }}>
                    <button
                      onClick={() => onEdit(ev)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
                    >
                      Edit
                    </button>
                    {isHeadCoachRole(coach.role) && (
                      <button
                        onClick={() => onDelete(ev.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Form type ─────────────────────────────────────────────────────────────────

type EvForm = {
  title: string;
  event_date: string;
  event_time: string;
  location: string;
  type: "practice" | "meet" | "fundraiser" | "team";
};

const BLANK: EvForm = { title: "", event_date: todayISO(), event_time: "", location: "", type: "practice" };

function fromRow(e: CalendarEventRow): EvForm {
  return { title: e.title, event_date: e.event_date, event_time: e.event_time, location: e.location, type: e.type };
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
  const coach = coachSession(actor);
  const [events,  setEvents]  = useState<CalendarEventRow[]>(initialEvents);
  const [form,    setForm]    = useState<EvForm>(BLANK);
  const [editing, setEditing] = useState<CalendarEventRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const openAdd  = () => { setForm({ ...BLANK, event_date: todayISO() }); setError(""); setShowAdd(true); };
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

  const groups = new Map<string, CalendarEventRow[]>();
  for (const ev of events) {
    if (!groups.has(ev.event_date)) groups.set(ev.event_date, []);
    groups.get(ev.event_date)!.push(ev);
  }

  const today    = todayISO();
  const tomorrow = tomorrowISO();
  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

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
          <CoachBar coach={coach} label="Add Event" onAdd={openAdd} />
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
            {coach ? "Add the first event above." : "Check back soon for schedule updates."}
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
            coach={coach}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        ))
      )}

      {/* ── Add / Edit Modal ── */}
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
