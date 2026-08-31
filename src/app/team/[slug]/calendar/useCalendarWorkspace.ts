"use client";

import { useState } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import { isStaff, type TeamActor } from "@/lib/permissions";
import {
  type EventType,
  arizonaTodayISO,
  monthKeyFromISO,
  type MonthKey,
} from "@/lib/calendarShared";

// D4: the event array, Add/Edit form state, view-mode/navigation state,
// and every CRUD/navigation handler previously owned directly inside
// CalendarView.tsx (verbatim logic, only relocated) — extracted into a
// hook so BOTH the existing mobile presentation (CalendarView.tsx,
// unmodified in behavior) and the new desktop workspace
// (DesktopCalendarView.tsx) can share ONE authoritative Calendar workflow
// instead of two independent copies, exactly as D3's useAthleteRoster.ts
// did for the roster. There is no behavior change here: every field/
// function name, request shape, and state transition is identical to
// what CalendarView.tsx did inline before D4.

export type CalendarViewMode = "month" | "agenda";
const VIEW_MODE_KEY = "elf-calendar-view-mode";

function readStoredViewMode(): CalendarViewMode {
  if (typeof window === "undefined") return "month";
  const v = window.sessionStorage.getItem(VIEW_MODE_KEY);
  return v === "agenda" ? "agenda" : "month";
}

export type EvForm = {
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  location: string;
  description: string;
  type: EventType;
};

export const BLANK_EVENT_FORM: EvForm = {
  title: "", event_date: arizonaTodayISO(), start_time: "", end_time: "",
  location: "", description: "", type: "practice",
};

export function eventFormFromRow(e: CalendarEventRow): EvForm {
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

export function useCalendarWorkspace(
  slug: string,
  initialEvents: CalendarEventRow[],
  actor: TeamActor,
  teamName: string,
) {
  // Calendar CRUD is staff-level (head coach, assistant coach, AND
  // booster), per the RC-1 permission audit — unchanged by D4. Desktop
  // *presentation* eligibility (see calendarHelpers.ts) is a separate,
  // narrower boundary that never affects this.
  const canManage = isStaff(actor);
  const [events,  setEvents]  = useState<CalendarEventRow[]>(initialEvents);
  const [form,    setForm]    = useState<EvForm>(BLANK_EVENT_FORM);
  const [editing, setEditing] = useState<CalendarEventRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [viewing, setViewing] = useState<CalendarEventRow | null>(null);

  const [viewMode, setViewMode] = useState<CalendarViewMode>(readStoredViewMode);
  const [visibleMonth, setVisibleMonth] = useState<MonthKey>(() => monthKeyFromISO(arizonaTodayISO()));
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

  const goToToday = () => {
    const today = arizonaTodayISO();
    setVisibleMonth(monthKeyFromISO(today));
    setSelectedDate(today);
  };

  const clearSelectedDate = () => setSelectedDate(null);

  // Defaults to the currently selected day in Month view (so "Add Event"
  // from a specific day feels contextual) and to today otherwise/in Agenda.
  const openAdd = () => {
    setForm({ ...BLANK_EVENT_FORM, event_date: viewMode === "month" && selectedDate ? selectedDate : arizonaTodayISO() });
    setError("");
    setShowAdd(true);
  };
  const openEdit = (ev: CalendarEventRow) => { setViewing(null); setForm(eventFormFromRow(ev)); setError(""); setEditing(ev); };
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

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;
  // A legacy event has free-text event_time but no structured start_time —
  // used to show a read-only hint in the edit form instead of silently
  // discarding that historical text.
  const editingLegacyTime = isEditing && !editing!.start_time && editing!.event_time;

  return {
    slug, teamName, canManage,
    events, viewing, setViewing,
    form, setForm, editing, showAdd, saving, error,
    viewMode, changeViewMode,
    visibleMonth, changeVisibleMonth,
    selectedDate, setSelectedDate, clearSelectedDate,
    goToToday,
    isEditing, modalOpen, editingLegacyTime,
    openAdd, openEdit, closeModal,
    handleAdd, handleEdit, handleDelete,
  };
}

export type CalendarWorkspaceState = ReturnType<typeof useCalendarWorkspace>;
