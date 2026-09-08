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
//
// Phase 7 visual refinement: taller cells (scheduling-workspace feel, not
// a compact date-picker) wrapped in a single bordered/rounded surface
// (weekday header + grid share one outer edge) instead of each cell
// carrying its own radius — the individual-rounded-chip look was the
// "floating card" impression the user asked to remove. Internal dividers
// are now 1px hairlines instead of a 2px gutter, for a single cohesive
// grid rather than a set of separated tiles.
const CELL_MIN_HEIGHT = 156;

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
    <div style={{ border: "1px solid var(--border-app)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      {/* ── Weekday header row ── */}
      {/* minmax(0, 1fr), not bare 1fr: a bare 1fr track's minimum width
          defaults to its content's min-content size. The header labels
          are short and never triggered this, but the day grid below
          shares this same column definition, so both use minmax(0, 1fr)
          to stay visually aligned. */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        background: "var(--surface-light-elevated)", borderBottom: "1px solid var(--border-app)",
      }}>
        {WEEKDAY_LABELS.map(w => (
          <div key={w} style={{
            textAlign: "center", fontSize: ".68rem", fontWeight: 700, color: "var(--text-muted-app)",
            textTransform: "uppercase", letterSpacing: ".04em", padding: ".5rem 0",
          }}>
            {w}
          </div>
        ))}
      </div>

      {/* ── Grid ── */}
      {/* Same minmax(0, 1fr) track definition as the weekday header above
          so the two rows stay aligned column-for-column. 1px hairline
          dividers (gap + border-app background) instead of a thicker
          gutter, and no per-cell border-radius — the outer wrapper above
          owns the rounded corners so the whole grid reads as one surface. */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1,
        background: "var(--border-app)",
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
              className="elf-focus-ring"
              style={{
                minHeight: CELL_MIN_HEIGHT,
                // Grid items default to min-width: auto, which is based on
                // their content's min-content size — without this, a long
                // nowrap event title inside this cell could still force
                // the cell (and therefore its column) wider than 1/7 even
                // with minmax(0, 1fr) on the track. minWidth: 0 lets this
                // cell shrink to its track's actual width.
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: ".3rem",
                padding: ".5rem .45rem",
                cursor: "pointer",
                background: isSelected ? "var(--surface-light-elevated)" : "var(--surface-light)",
                opacity: cell.inCurrentMonth ? 1 : 0.5,
                boxSizing: "border-box",
                outline: isSelected ? "2px solid var(--team-primary)" : "none",
                outlineOffset: -2,
              }}
            >
              <span style={{
                fontSize: ".8rem",
                fontWeight: isToday ? 800 : 600,
                color: isToday ? "var(--team-primary-foreground)" : "var(--text-primary-app)",
                width: 24, height: 24, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday ? "var(--team-primary)" : "transparent",
                flexShrink: 0, alignSelf: "flex-start",
              }}>
                {cell.day}
              </span>

              <div style={{ display: "flex", flexDirection: "column", gap: ".18rem", overflow: "hidden", minWidth: 0 }}>
                {visible.map(ev => {
                  const s = eventTypeStyle(ev.type);
                  const time = displayEventTime(ev);
                  return (
                    <button
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onOpenEvent(ev); }}
                      title={time ? `${ev.title} — ${time}` : ev.title}
                      style={{
                        display: "block", width: "100%", minWidth: 0, textAlign: "left",
                        border: "none", borderRadius: 5, cursor: "pointer",
                        padding: ".14rem .35rem", background: s.bg, color: s.color,
                        fontSize: ".68rem", fontWeight: 600, lineHeight: 1.35,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        boxSizing: "border-box",
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
                      padding: ".1rem .35rem", fontSize: ".66rem", fontWeight: 700, color: "var(--text-muted-app)",
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
