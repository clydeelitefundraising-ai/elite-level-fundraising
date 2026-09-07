"use client";

import type { RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { arizonaTodayISO, arizonaTomorrowISO, formatFullDate, addMonths, formatMonthYear, groupEventsByDate } from "@/lib/calendarShared";
import CoachBar from "../_components/CoachBar";
import ExportMenu from "./ExportMenu";
import DesktopMonthGrid from "./DesktopMonthGrid";
import AgendaList from "./AgendaList";
import DateGroupCard from "./DateGroupCard";
import type { CalendarWorkspaceState } from "./useCalendarWorkspace";

// D4: desktop-only Calendar workspace. The header reuses the exact same
// pieces the mobile page already has (CoachBar, ExportMenu, the Month/
// Agenda toggle), laid out for desktop's horizontal space rather than
// invented from scratch. Month/Agenda is preserved — AgendaList.tsx is
// shared with the mobile presentation, not reimplemented here. The month
// grid is DesktopMonthGrid.tsx; clicking "+N more" on a day reuses the
// exact same selectedDate state and DateGroupCard component the mobile
// MonthView.tsx already uses for its selected-day section — the smallest
// safe equivalent of "reveal every event for that date," not a new
// drawer/detail workflow. Clicking a visible in-cell event opens the
// existing EventDetailsModal directly (mounted once by
// CalendarWorkspaceView.tsx, not by this component).
export default function DesktopCalendarView({
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

  const today = arizonaTodayISO();
  const tomorrow = arizonaTomorrowISO();
  const byDate = groupEventsByDate(events);
  const selectedEvents = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em" }}>
            Calendar
          </h2>
          {events.length > 0 && (
            <span style={{ background: "var(--surface-light-elevated)", color: "var(--text-muted-app)", borderRadius: "var(--radius-full)", fontSize: ".68rem", fontWeight: 700, padding: ".18rem .55rem" }}>
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
          {viewMode === "month" && (
            <div style={{ display: "flex", alignItems: "center", gap: ".25rem" }}>
              <button aria-label="Previous month" className="elf-focus-ring" onClick={() => changeVisibleMonth(addMonths(visibleMonth, -1))} style={navBtnStyle}><ChevronLeft size={17} strokeWidth={2.5} /></button>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary-app)", minWidth: 150, textAlign: "center" }}>
                {formatMonthYear(visibleMonth)}
              </span>
              <button aria-label="Next month" className="elf-focus-ring" onClick={() => changeVisibleMonth(addMonths(visibleMonth, 1))} style={navBtnStyle}><ChevronRight size={17} strokeWidth={2.5} /></button>
            </div>
          )}

          <button onClick={goToToday} className="elf-focus-ring" style={todayBtnStyle} aria-label="Go to today">
            Today
          </button>

          {/* Thin-underline treatment, matching RosterTabs.tsx's secondary-nav precedent — replaces the earlier pill/box style. */}
          <div role="tablist" aria-label="Calendar view" style={{ display: "flex", gap: "1.1rem", borderBottom: "1px solid var(--border-app)" }}>
            {(["month", "agenda"] as const).map(mode => (
              <button
                key={mode}
                role="tab"
                aria-selected={viewMode === mode}
                onClick={() => changeViewMode(mode)}
                className="elf-focus-ring"
                style={{
                  padding: ".5rem 0", marginBottom: "-1px", border: "none",
                  borderBottom: viewMode === mode ? "2px solid var(--team-primary)" : "2px solid transparent",
                  cursor: "pointer",
                  fontSize: ".8rem", fontWeight: viewMode === mode ? 700 : 500, textTransform: "capitalize",
                  background: "none",
                  color: viewMode === mode ? "var(--text-primary-app)" : "var(--text-muted-app)",
                }}
              >
                {mode}
              </button>
            ))}
          </div>

          <ExportMenu slug={slug} canManage={canManage} printRef={printRef} printFilename={printFilename} />
          <CoachBar show={canManage} label="Add Event" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Main ── */}
      {viewMode === "month" ? (
        <>
          <DesktopMonthGrid
            events={events}
            visibleMonth={visibleMonth}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onOpenEvent={setViewing}
          />

          {selectedDate && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: ".5rem", marginBottom: ".6rem", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: ".92rem", fontWeight: 800, color: "var(--text-primary-app)" }}>
                  {formatFullDate(selectedDate)}
                </h3>
                <button
                  onClick={clearSelectedDate}
                  className="elf-focus-ring"
                  style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: ".76rem", fontWeight: 700, color: "var(--team-primary)" }}
                >
                  Close
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <div style={{
                  background: "var(--surface-light)", borderRadius: "var(--radius-lg)", padding: "1.5rem 1.25rem",
                  textAlign: "center", border: "1px solid var(--border-app)",
                  fontSize: ".82rem", color: "var(--text-muted-app)",
                }}>
                  No events scheduled for this day.
                </div>
              ) : (
                <DateGroupCard
                  date={selectedDate}
                  evs={selectedEvents}
                  isToday={selectedDate === today}
                  isTomorrow={selectedDate === tomorrow}
                  onOpen={setViewing}
                />
              )}
            </div>
          )}
        </>
      ) : (
        <AgendaList events={events} canManage={canManage} onOpen={setViewing} />
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "var(--radius-md)", border: "none", background: "var(--surface-light-elevated)",
  color: "var(--text-secondary-app)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};

const todayBtnStyle: React.CSSProperties = {
  padding: ".4rem .8rem", borderRadius: "var(--radius-md)", border: "none", background: "var(--surface-light-elevated)",
  color: "var(--team-primary)", fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
};
