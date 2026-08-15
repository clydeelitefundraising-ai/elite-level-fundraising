"use client";

import type { CalendarEventRow } from "@/lib/teamData";
import {
  arizonaTodayISO,
  arizonaTomorrowISO,
  formatFullDate,
  buildMonthGrid,
  addMonths,
  formatMonthYear,
  groupEventsByDate,
  eventsInMonth,
  WEEKDAY_LABELS,
  type MonthKey,
} from "@/lib/calendarShared";
import DateGroupCard from "./DateGroupCard";

// Phase 4B refinement: cells are dot-only and uniform — no title
// pills/labels at any viewport, so event count/title length can never
// change a cell's height or width. Max two dots regardless of how many
// events actually fall on a day; the real count still reaches assistive
// tech via aria-label, and the full list lives in the section below.
const CELL_HEIGHT = 44;

export default function MonthView({
  events,
  visibleMonth,
  onChangeMonth,
  onToday,
  selectedDate,
  onSelectDate,
  onClearSelectedDate,
  onOpenEvent,
}: {
  events: CalendarEventRow[];
  visibleMonth: MonthKey;
  onChangeMonth: (m: MonthKey) => void;
  onToday: () => void;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  onClearSelectedDate: () => void;
  onOpenEvent: (ev: CalendarEventRow) => void;
}) {
  const today = arizonaTodayISO();
  const tomorrow = arizonaTomorrowISO();
  const cells = buildMonthGrid(visibleMonth);
  const byDate = groupEventsByDate(events);

  const monthEvents = eventsInMonth(events, visibleMonth);
  const monthGroups = groupEventsByDate(monthEvents);
  const monthLabel = formatMonthYear(visibleMonth).split(" ")[0]; // "August"

  const selectedEvents = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <div>
      {/* ── Month header / nav ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: ".65rem", gap: ".5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".25rem" }}>
          <button
            aria-label="Previous month"
            onClick={() => onChangeMonth(addMonths(visibleMonth, -1))}
            style={navBtnStyle}
          >
            ‹
          </button>
          <span style={{ fontSize: ".95rem", fontWeight: 800, color: "#0b1e3d", minWidth: 130, textAlign: "center" }}>
            {formatMonthYear(visibleMonth)}
          </span>
          <button
            aria-label="Next month"
            onClick={() => onChangeMonth(addMonths(visibleMonth, 1))}
            style={navBtnStyle}
          >
            ›
          </button>
        </div>
        <button onClick={onToday} style={todayBtnStyle} aria-label="Go to today">
          Today
        </button>
      </div>

      {/* ── Weekday header row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {WEEKDAY_LABELS.map(w => (
          <div key={w} style={{
            textAlign: "center", fontSize: ".6rem", fontWeight: 700, color: "#9ca3af",
            textTransform: "uppercase", letterSpacing: ".04em", padding: ".2rem 0",
          }}>
            {w}
          </div>
        ))}
      </div>

      {/* ── Grid: every cell is exactly CELL_HEIGHT, content never changes that ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
        background: "#f3f4f6", borderRadius: 12, padding: 2, overflow: "hidden",
      }}>
        {cells.map(cell => {
          const evs = byDate.get(cell.iso) ?? [];
          const dotCount = Math.min(evs.length, 2);
          const isToday = cell.iso === today;
          const isSelected = cell.iso === selectedDate;
          return (
            <button
              key={cell.iso}
              onClick={() => onSelectDate(cell.iso)}
              aria-label={`${cell.iso}${isToday ? ", today" : ""}${evs.length ? `, ${evs.length} event${evs.length !== 1 ? "s" : ""}` : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              style={{
                position: "relative",
                height: CELL_HEIGHT,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: ".2rem",
                padding: 0,
                border: "none",
                cursor: "pointer",
                background: isSelected ? "#0b1e3d" : "#fff",
                opacity: cell.inCurrentMonth ? 1 : 0.45,
                borderRadius: 8,
                font: "inherit",
                boxSizing: "border-box",
              }}
            >
              <span style={{
                fontSize: ".78rem",
                fontWeight: isToday ? 800 : 600,
                color: isSelected ? "#fff" : isToday ? "#1d4ed8" : "#111827",
                width: 22, height: 22, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday && !isSelected ? "#f0f4ff" : "transparent",
                flexShrink: 0,
              }}>
                {cell.day}
              </span>

              {/* Fixed-height dot row: 0/1/2 dots occupy the same space
                  either way, so cell height never depends on content. */}
              <div style={{ display: "flex", gap: 3, alignItems: "center", justifyContent: "center", height: 5, flexShrink: 0 }}>
                {Array.from({ length: dotCount }).map((_, i) => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: isSelected ? "#fff" : "#9ca3af",
                  }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Section below the grid: full-month list, or a selected-day override ── */}
      <div style={{ marginTop: "1rem" }}>
        {selectedDate ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: ".5rem", marginBottom: ".6rem", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: ".92rem", fontWeight: 800, color: "#0b1e3d" }}>
                {formatFullDate(selectedDate)}
              </h3>
              <button
                onClick={onClearSelectedDate}
                style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontSize: ".76rem", fontWeight: 700, color: "#1d4ed8" }}
              >
                View all {monthLabel} events
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
                onOpen={onOpenEvent}
              />
            )}
          </>
        ) : (
          <>
            <h3 style={{ margin: "0 0 .6rem", fontSize: ".92rem", fontWeight: 800, color: "#0b1e3d" }}>
              {monthLabel} Events
            </h3>

            {monthEvents.length === 0 ? (
              <div style={{
                background: "#fff", borderRadius: 14, padding: "1.5rem 1.25rem",
                textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
                fontSize: ".82rem", color: "#9ca3af",
              }}>
                No events scheduled in {formatMonthYear(visibleMonth)}.
              </div>
            ) : (
              Array.from(monthGroups.entries()).map(([date, evs]) => (
                <DateGroupCard
                  key={date}
                  date={date}
                  evs={evs}
                  isToday={date === today}
                  isTomorrow={date === tomorrow}
                  onOpen={onOpenEvent}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: "none", background: "#f3f4f6",
  color: "#374151", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};

const todayBtnStyle: React.CSSProperties = {
  padding: ".35rem .75rem", borderRadius: 8, border: "none", background: "#f0f4ff",
  color: "#1d4ed8", fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
};
