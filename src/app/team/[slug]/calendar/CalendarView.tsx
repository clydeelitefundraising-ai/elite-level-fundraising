"use client";

import { useState } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import { isStaff, type TeamActor } from "@/lib/permissions";
import {
  type EventType,
  arizonaTodayISO,
  arizonaTomorrowISO,
  monthKeyFromISO,
  groupEventsByDate,
  type MonthKey,
} from "@/lib/calendarShared";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";
import EventDetailsModal from "../_components/EventDetailsModal";
import MonthView from "./MonthView";
import DateGroupCard from "./DateGroupCard";
import PrintMonthView from "./PrintMonthView";
import ExportMenu from "./ExportMenu";

// Phase 4B: Month/Agenda selection remembered for the current client
// session only (sessionStorage) — deliberately not persisted server-side
// or per-user, per task scope (no new preference infrastructure).
type CalendarViewMode = "month" | "agenda";
const VIEW_MODE_KEY = "elf-calendar-view-mode";

function readStoredViewMode(): CalendarViewMode {
  if (typeof window === "undefined") return "month";
  const v = window.sessionStorage.getItem(VIEW_MODE_KEY);
  return v === "agenda" ? "agenda" : "month";
}

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
  teamName,
}: {
  slug: string;
  initialEvents: CalendarEventRow[];
  actor: TeamActor;
  teamName: string;
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

  // Phase 4B: Month is the default/primary view; Agenda is preserved as
  // the alternate. Initialized lazily from sessionStorage so a returning
  // visitor within the same session lands back where they left off.
  const [viewMode, setViewMode] = useState<CalendarViewMode>(readStoredViewMode);
  const [visibleMonth, setVisibleMonth] = useState<MonthKey>(() => monthKeyFromISO(arizonaTodayISO()));
  // Phase 4B refinement: null = no day override, Month view shows every
  // event in visibleMonth. A non-null value narrows the section below the
  // grid to that single date. Starts null so the initial Month view shows
  // the whole current month, not just today.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const changeViewMode = (mode: CalendarViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") window.sessionStorage.setItem(VIEW_MODE_KEY, mode);
  };

  // Navigating months clears any day override — the newly displayed month
  // should show its own full event list, not a stale selected day from a
  // different month.
  const changeVisibleMonth = (m: MonthKey) => {
    setVisibleMonth(m);
    setSelectedDate(null);
  };

  // Today returns to both the current Arizona month AND selects today
  // (the same "day" the instruction calls for), reusing Phase 4A's
  // Arizona-safe today helper — no second date system.
  const goToToday = () => {
    const today = arizonaTodayISO();
    setVisibleMonth(monthKeyFromISO(today));
    setSelectedDate(today);
  };

  // Defaults to the currently selected day in Month view (so "Add Event"
  // from a specific day feels contextual) and to today otherwise/in Agenda.
  const openAdd  = () => { setForm({ ...BLANK, event_date: viewMode === "month" && selectedDate ? selectedDate : arizonaTodayISO() }); setError(""); setShowAdd(true); };
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

  const groups = groupEventsByDate(events);

  const today    = arizonaTodayISO();
  const tomorrow = arizonaTomorrowISO();
  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;
  // A legacy event has free-text event_time but no structured start_time —
  // used to show a read-only hint in the edit form instead of silently
  // discarding that historical text.
  const editingLegacyTime = isEditing && !editing!.start_time && editing!.event_time;

  return (
    <>
      {/* Phase 4C: same-page print architecture — .elf-calendar-noprint
          (all normal screen UI, including any open modal since it's a
          DOM descendant) is hidden at print time; .elf-calendar-print
          (hidden on screen) becomes visible. Print always renders
          visibleMonth's events regardless of selectedDate. */}
      <style>{`
        @media print {
          #elf-team-header, [role="navigation"] { display: none !important; }
          .elf-calendar-noprint { display: none !important; }
          .elf-calendar-print { display: block !important; }
        }
        @media screen {
          .elf-calendar-print { display: none; }
        }
      `}</style>

      <div className="elf-calendar-print">
        <PrintMonthView teamName={teamName || "Team Calendar"} events={events} visibleMonth={visibleMonth} />
      </div>

    <div className="elf-calendar-noprint" style={{ animation: "elf-fadeUp .22s ease both" }}>
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
          <ExportMenu slug={slug} canManage={canManage} />
          <CoachBar show={canManage} label="Add Event" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Month / Agenda toggle ── */}
      <div
        role="tablist"
        aria-label="Calendar view"
        style={{
          display: "inline-flex", background: "#f3f4f6", borderRadius: 10, padding: 3,
          marginBottom: ".85rem", gap: 2,
        }}
      >
        {(["month", "agenda"] as const).map(mode => (
          <button
            key={mode}
            role="tab"
            aria-selected={viewMode === mode}
            onClick={() => changeViewMode(mode)}
            style={{
              padding: ".4rem .95rem",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: ".8rem",
              fontWeight: 700,
              background: viewMode === mode ? "#fff" : "transparent",
              color: viewMode === mode ? "#0b1e3d" : "#6b7280",
              boxShadow: viewMode === mode ? "0 1px 3px rgba(0,0,0,.1)" : "none",
              textTransform: "capitalize",
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* ── Month view ── */}
      {viewMode === "month" && (
        <MonthView
          events={events}
          visibleMonth={visibleMonth}
          onChangeMonth={changeVisibleMonth}
          onToday={goToToday}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onClearSelectedDate={() => setSelectedDate(null)}
          onOpenEvent={setViewing}
        />
      )}

      {/* ── Agenda view (Phase 4A feed, preserved) ── */}
      {viewMode === "agenda" && (
        events.length === 0 ? (
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
        )
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
    </>
  );
}
