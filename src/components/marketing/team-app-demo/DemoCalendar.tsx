"use client";

import { useRef, useState } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import { isStaff, type TeamActor } from "@/lib/permissions";
import { arizonaTodayISO, monthKeyFromISO, type MonthKey } from "@/lib/calendarShared";
import EventDetailsModal from "@/app/team/[slug]/_components/EventDetailsModal";
import DemoCalendarView from "./DemoCalendarView";
import EventFormModal from "@/app/team/[slug]/calendar/EventFormModal";
import {
  BLANK_EVENT_FORM, eventFormFromRow, type CalendarViewMode, type CalendarWorkspaceState, type EvForm,
} from "@/app/team/[slug]/calendar/useCalendarWorkspace";
import { DEMO_SLUG, DEMO_TEAM } from "./demoData";

// The Calendar tab (CalendarWorkspaceView's mobile presentation) with the
// demo's fictional season.
//
//   reused as-is  MonthView (month grid, event dots, Today, date groups),
//                 AgendaList, DateGroupCard, EventFormModal (Add/Edit Event),
//                 EventDetailsModal, CoachBar, BLANK_EVENT_FORM,
//                 eventFormFromRow — all driven by the workspace object below
//   twins         CalendarView — generated from the real file
//                 (DemoCalendarView.tsx; only its ExportMenu import differs)
//                 — and ExportMenu (DemoExportMenu.tsx), because the real
//                 one reads/creates/disables calendar subscriptions through
//                 the API, downloads the .ics, prints and opens Apple/Google
//                 Calendar. Every export/sync action shows a notice.
//
// Add/Edit/Delete Event (staff only, like the app) change the demo store
// only. The Month/Agenda choice is kept in memory — the real app remembers
// it in sessionStorage, which the demo never touches.

type Notify = (message?: string) => void;
type SetEvents = (fn: (events: CalendarEventRow[]) => CalendarEventRow[]) => void;

const byDateTime = (a: CalendarEventRow, b: CalendarEventRow) =>
  a.event_date === b.event_date
    ? (a.start_time ?? a.event_time ?? "").localeCompare(b.start_time ?? b.event_time ?? "")
    : a.event_date.localeCompare(b.event_date);

export function useDemoCalendarWorkspace({ actor, events, setEvents, notify }: {
  actor: TeamActor; events: CalendarEventRow[]; setEvents: SetEvents; notify: Notify;
}): CalendarWorkspaceState {
  const canManage = isStaff(actor);
  const [form, setForm] = useState<EvForm>(BLANK_EVENT_FORM);
  const [editing, setEditing] = useState<CalendarEventRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<CalendarEventRow | null>(null);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [visibleMonth, setVisibleMonth] = useState<MonthKey>(() => monthKeyFromISO(arizonaTodayISO()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [seq, setSeq] = useState(0);

  const changeViewMode = (mode: CalendarViewMode) => setViewMode(mode);
  const changeVisibleMonth = (m: MonthKey) => { setVisibleMonth(m); setSelectedDate(null); };
  const goToToday = () => {
    const today = arizonaTodayISO();
    setVisibleMonth(monthKeyFromISO(today));
    setSelectedDate(today);
  };
  const clearSelectedDate = () => setSelectedDate(null);
  const openAdd = () => {
    setForm({ ...BLANK_EVENT_FORM, event_date: viewMode === "month" && selectedDate ? selectedDate : arizonaTodayISO() });
    setError("");
    setShowAdd(true);
  };
  const openEdit = (ev: CalendarEventRow) => { setViewing(null); setForm(eventFormFromRow(ev)); setError(""); setEditing(ev); };
  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); };
  const rowFromForm = (base: Partial<CalendarEventRow>): CalendarEventRow => ({
    id: `00000000-0000-4000-8000-${String(9500 + seq).padStart(12, "0")}`,
    campaign_slug: DEMO_SLUG,
    event_time: "",
    created_at: new Date().toISOString(),
    ...base,
    title: form.title.trim(),
    event_date: form.event_date,
    start_time: form.start_time || null,
    end_time: form.end_time || null,
    location: form.location.trim(),
    description: form.description.trim() || null,
    type: form.type,
  } as CalendarEventRow);

  const handleAdd = async () => {
    if (!form.title.trim() || !form.event_date) { setError("Title and date are required."); return; }
    const row = rowFromForm({});
    setSeq(n => n + 1);
    setEvents(prev => [...prev, row].sort(byDateTime));
    closeModal();
    notify("Preview only — the event was added to this demo. No one was notified.");
  };
  const handleEdit = async () => {
    if (!editing || !form.title.trim() || !form.event_date) { setError("Title and date are required."); return; }
    const row = rowFromForm(editing);
    setEvents(prev => prev.map(e => e.id === editing.id ? row : e).sort(byDateTime));
    closeModal();
    notify("Preview only — the event was changed in this demo only.");
  };
  const handleDelete = async (eventId: string) => {
    setEvents(prev => prev.filter(e => e.id !== eventId));
    setViewing(null);
    notify("Preview only — removed from this demo. Reset demo to bring it back.");
  };

  const isEditing = editing !== null;
  return {
    slug: DEMO_SLUG, teamName: `${DEMO_TEAM.schoolName} ${DEMO_TEAM.sportName}`, canManage,
    events, viewing, setViewing,
    form, setForm, editing, showAdd, saving: false, error,
    viewMode, changeViewMode,
    visibleMonth, changeVisibleMonth,
    selectedDate, setSelectedDate, clearSelectedDate,
    goToToday,
    isEditing, modalOpen: showAdd || isEditing, editingLegacyTime: false,
    openAdd, openEdit, closeModal,
    handleAdd, handleEdit, handleDelete,
  } as CalendarWorkspaceState;
}

/** The Calendar tab: the twin CalendarView plus the real modals, exactly
 *  as CalendarWorkspaceView arranges them on a phone. */
export default function DemoCalendar({ cal }: { cal: CalendarWorkspaceState }) {
  const printRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <DemoCalendarView cal={cal} printRef={printRef} printFilename="" />
      <EventFormModal cal={cal} />
      {cal.viewing && (
        <EventDetailsModal
          ev={cal.viewing}
          canManage={cal.canManage}
          onClose={() => cal.setViewing(null)}
          onEdit={cal.openEdit}
          onDelete={cal.handleDelete}
        />
      )}
    </>
  );
}


/** The Calendar tab for one role: the workspace plus the screen. */
export function DemoCalendarTab({ actor, events, setEvents, notify }: {
  actor: TeamActor; events: CalendarEventRow[]; setEvents: SetEvents; notify: Notify;
}) {
  const cal = useDemoCalendarWorkspace({ actor, events, setEvents, notify });
  return <DemoCalendar cal={cal} />;
}
