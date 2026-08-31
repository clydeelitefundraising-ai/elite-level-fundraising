"use client";

import type { RefObject } from "react";
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
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em" }}>
            Calendar
          </h2>
          {events.length > 0 && (
            <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 100, fontSize: ".68rem", fontWeight: 700, padding: ".18rem .55rem" }}>
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
          {viewMode === "month" && (
            <div style={{ display: "flex", alignItems: "center", gap: ".25rem" }}>
              <button aria-label="Previous month" onClick={() => changeVisibleMonth(addMonths(visibleMonth, -1))} style={navBtnStyle}>‹</button>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", minWidth: 150, textAlign: "center" }}>
                {formatMonthYear(visibleMonth)}
              </span>
              <button aria-label="Next month" onClick={() => changeVisibleMonth(addMonths(visibleMonth, 1))} style={navBtnStyle}>›</button>
            </div>
          )}

          <button onClick={goToToday} style={todayBtnStyle} aria-label="Go to today">
            Today
          </button>

          <div role="tablist" aria-label="Calendar view" style={{ display: "inline-flex", background: "#f3f4f6", borderRadius: 10, padding: 3, gap: 2 }}>
            {(["month", "agenda"] as const).map(mode => (
              <button
                key={mode}
                role="tab"
                aria-selected={viewMode === mode}
                onClick={() => changeViewMode(mode)}
                style={{
                  padding: ".4rem .9rem", borderRadius: 8, border: "none", cursor: "pointer",
                  fontSize: ".8rem", fontWeight: 700, textTransform: "capitalize",
                  background: viewMode === mode ? "#fff" : "transparent",
                  color: viewMode === mode ? "#0b1e3d" : "#6b7280",
                  boxShadow: viewMode === mode ? "0 1px 3px rgba(0,0,0,.1)" : "none",
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
                <h3 style={{ margin: 0, fontSize: ".92rem", fontWeight: 800, color: "#0b1e3d" }}>
                  {formatFullDate(selectedDate)}
                </h3>
                <button
                  onClick={clearSelectedDate}
                  style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: ".76rem", fontWeight: 700, color: "#1d4ed8" }}
                >
                  Close
                </button>
              </div>

              {selectedEvents.length === 0 ? (
                <div style={{
                  background: "#fff", borderRadius: 14, padding: "1.5rem 1.25rem",
                  textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
                  fontSize: ".82rem", color: "#9ca3af",
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
  width: 32, height: 32, borderRadius: 8, border: "none", background: "#f3f4f6",
  color: "#374151", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};

const todayBtnStyle: React.CSSProperties = {
  padding: ".4rem .8rem", borderRadius: 8, border: "none", background: "#f0f4ff",
  color: "#1d4ed8", fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
};
