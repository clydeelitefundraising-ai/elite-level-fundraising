"use client";

import type { CalendarEventRow } from "@/lib/teamData";
import {
  arizonaTodayISO,
  buildMonthGrid,
  groupEventsByDate,
  eventTypeStyle,
  displayEventTime,
  WEEKDAY_LABELS,
  type MonthKey,
} from "@/lib/calendarShared";
import { DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY, splitDayEvents } from "./calendarHelpers";

// D4: desktop-only month grid — reuses the exact same date/grouping math
// as the existing mobile MonthView.tsx (buildMonthGrid/groupEventsByDate
// from calendarShared.ts, unmodified), but renders event titles/times
// directly in each cell instead of mobile's dot-only treatment, since
// desktop has the space to show them. Overflow beyond
// DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY is handled by the tested, pure
// splitDayEvents() helper — never inline truncation logic in this JSX.
const CELL_MIN_HEIGHT = 128;

export default function DesktopMonthGrid({
  events,
  visibleMonth,
  selectedDate,
  onSelectDate,
  onOpenEvent,
}: {
  events: CalendarEventRow[];
  visibleMonth: MonthKey;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  onOpenEvent: (ev: CalendarEventRow) => void;
}) {
  const today = arizonaTodayISO();
  const cells = buildMonthGrid(visibleMonth);
  const byDate = groupEventsByDate(events);

  return (
    <div>
      {/* ── Weekday header row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {WEEKDAY_LABELS.map(w => (
          <div key={w} style={{
            textAlign: "center", fontSize: ".68rem", fontWeight: 700, color: "#9ca3af",
            textTransform: "uppercase", letterSpacing: ".04em", padding: ".35rem 0",
          }}>
            {w}
          </div>
        ))}
      </div>

      {/* ── Grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
        background: "#e5e7eb", borderRadius: 12, padding: 2, overflow: "hidden",
      }}>
        {cells.map(cell => {
          const evs = byDate.get(cell.iso) ?? [];
          const { visible, overflowCount } = splitDayEvents(evs, DESKTOP_MAX_VISIBLE_EVENTS_PER_DAY);
          const isToday = cell.iso === today;
          const isSelected = cell.iso === selectedDate;
          return (
            <div
              key={cell.iso}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDate(cell.iso)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectDate(cell.iso); } }}
              aria-label={`${cell.iso}${isToday ? ", today" : ""}${evs.length ? `, ${evs.length} event${evs.length !== 1 ? "s" : ""}` : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              style={{
                minHeight: CELL_MIN_HEIGHT,
                display: "flex",
                flexDirection: "column",
                gap: ".25rem",
                padding: ".4rem",
                cursor: "pointer",
                background: isSelected ? "#eef2ff" : "#fff",
                opacity: cell.inCurrentMonth ? 1 : 0.5,
                boxSizing: "border-box",
                outline: isSelected ? "2px solid #0b1e3d" : "none",
                outlineOffset: -2,
                borderRadius: 6,
              }}
            >
              <span style={{
                fontSize: ".8rem",
                fontWeight: isToday ? 800 : 600,
                color: isToday ? "#fff" : "#111827",
                width: 24, height: 24, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday ? "#0b1e3d" : "transparent",
                flexShrink: 0, alignSelf: "flex-start",
              }}>
                {cell.day}
              </span>

              <div style={{ display: "flex", flexDirection: "column", gap: ".18rem", overflow: "hidden" }}>
                {visible.map(ev => {
                  const s = eventTypeStyle(ev.type);
                  const time = displayEventTime(ev);
                  return (
                    <button
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onOpenEvent(ev); }}
                      title={time ? `${ev.title} — ${time}` : ev.title}
                      style={{
                        display: "block", width: "100%", textAlign: "left",
                        border: "none", borderRadius: 5, cursor: "pointer",
                        padding: ".14rem .35rem", background: s.bg, color: s.color,
                        fontSize: ".68rem", fontWeight: 600, lineHeight: 1.35,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                    >
                      {time ? `${time} ` : ""}{ev.title}
                    </button>
                  );
                })}
                {overflowCount > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); onSelectDate(cell.iso); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      border: "none", background: "none", cursor: "pointer",
                      padding: ".1rem .35rem", fontSize: ".66rem", fontWeight: 700, color: "#6b7280",
                    }}
                  >
                    +{overflowCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
