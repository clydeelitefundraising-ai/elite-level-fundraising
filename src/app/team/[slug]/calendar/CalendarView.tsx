"use client";

import type { RefObject } from "react";
import CoachBar from "../_components/CoachBar";
import MonthView from "./MonthView";
import AgendaList from "./AgendaList";
import ExportMenu from "./ExportMenu";
import type { CalendarWorkspaceState } from "./useCalendarWorkspace";

// D4: mobile-only Calendar presentation — extracted verbatim (identical
// styling/behavior) from this file's pre-D4 body. Event/form/navigation
// state now lives in useCalendarWorkspace.ts, shared with the new desktop
// workspace; CalendarWorkspaceView.tsx renders this inside
// Calendar.module.css's .mobileOnly wrapper and owns the Add/Edit and
// Event Details modals itself so they are never duplicated here.
// printRef/printFilename are passed separately (not part of `cal`) — see
// CalendarWorkspaceView.tsx's comment on why a ref is kept out of the
// shared state object.
export default function CalendarView({
  cal,
  printRef,
  printFilename,
}: {
  cal: CalendarWorkspaceState;
  printRef: RefObject<HTMLDivElement | null>;
  printFilename: string;
}) {
  const {
    slug, canManage, events,
    viewMode, changeViewMode,
    visibleMonth, changeVisibleMonth, goToToday,
    selectedDate, setSelectedDate, clearSelectedDate,
    openAdd, setViewing,
  } = cal;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* ── Section header ── */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Schedule
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Calendar
          </h2>
          {events.length > 0 && (
            <span style={{ background: "var(--surface-light-elevated)", color: "var(--text-muted-app)", borderRadius: "var(--radius-full)", fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <ExportMenu slug={slug} canManage={canManage} printRef={printRef} printFilename={printFilename} />
          <CoachBar show={canManage} label="Add Event" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Month / Agenda toggle — thin-underline treatment, matching the
          RosterTabs.tsx secondary-nav precedent, replacing the earlier
          pill/box style. ── */}
      <div
        role="tablist"
        aria-label="Calendar view"
        style={{ display: "flex", gap: "1.1rem", marginBottom: ".85rem", borderBottom: "1px solid var(--border-app)" }}
      >
        {(["month", "agenda"] as const).map(mode => (
          <button
            key={mode}
            role="tab"
            aria-selected={viewMode === mode}
            onClick={() => changeViewMode(mode)}
            className="elf-focus-ring"
            style={{
              padding: ".5rem 0",
              marginBottom: "-1px",
              border: "none",
              borderBottom: viewMode === mode ? "2px solid var(--team-primary)" : "2px solid transparent",
              cursor: "pointer",
              fontSize: ".8rem",
              fontWeight: viewMode === mode ? 700 : 500,
              background: "none",
              color: viewMode === mode ? "var(--text-primary-app)" : "var(--text-muted-app)",
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
          onClearSelectedDate={clearSelectedDate}
          onOpenEvent={setViewing}
        />
      )}

      {/* ── Agenda view (Phase 4A feed, preserved) ── */}
      {viewMode === "agenda" && (
        <AgendaList events={events} canManage={canManage} onOpen={setViewing} />
      )}
    </div>
  );
}
