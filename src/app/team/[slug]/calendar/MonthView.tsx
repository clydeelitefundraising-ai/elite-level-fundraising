"use client";

import type { CalendarEventRow } from "@/lib/teamData";
import {
  eventTypeStyle,
  EVENT_TYPE_LABELS,
  arizonaTodayISO,
  displayEventTime,
  formatFullDate,
  buildMonthGrid,
  monthKeyFromISO,
  addMonths,
  formatMonthYear,
  groupEventsByDate,
  WEEKDAY_LABELS,
  type MonthKey,
} from "@/lib/calendarShared";

// Small, dot-based type differentiation — clean at both grid-cell scale
// (dots) and list scale (colored left bar, reused from Agenda's existing
// pattern) rather than a full color-coded cell background, per the "not a
// rainbow scheduling app" instruction.
const MAX_VISIBLE_LABELS_DESKTOP = 3;
const MAX_VISIBLE_DOTS_MOBILE = 4;

export default function MonthView({
  events,
  visibleMonth,
  onChangeMonth,
  selectedDate,
  onSelectDate,
  onOpenEvent,
}: {
  events: CalendarEventRow[];
  visibleMonth: MonthKey;
  onChangeMonth: (m: MonthKey) => void;
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  onOpenEvent: (ev: CalendarEventRow) => void;
}) {
  const today = arizonaTodayISO();
  const cells = buildMonthGrid(visibleMonth);

  const byDate = groupEventsByDate(events);

  const goToToday = () => {
    onChangeMonth(monthKeyFromISO(today));
    onSelectDate(today);
  };

  const selectedEvents = byDate.get(selectedDate) ?? [];

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
        <button onClick={goToToday} style={todayBtnStyle} aria-label="Go to today">
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

      {/* ── Grid ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
        background: "#f3f4f6", borderRadius: 12, padding: 2, overflow: "hidden",
      }}>
        {cells.map(cell => {
          const evs = byDate.get(cell.iso) ?? [];
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
                minHeight: 52,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: ".2rem",
                padding: ".3rem .15rem .35rem",
                border: "none",
                cursor: "pointer",
                background: isSelected ? "#0b1e3d" : "#fff",
                opacity: cell.inCurrentMonth ? 1 : 0.45,
                borderRadius: 8,
                font: "inherit",
              }}
            >
              <span style={{
                fontSize: ".78rem",
                fontWeight: isToday ? 800 : 600,
                color: isSelected ? "#fff" : isToday ? "#1d4ed8" : "#111827",
                width: 22, height: 22, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday && !isSelected ? "#f0f4ff" : "transparent",
              }}>
                {cell.day}
              </span>

              {/* Desktop/tablet: compact text labels where space allows */}
              <div className="elf-month-labels" style={{ width: "100%", display: "none" }}>
                {evs.slice(0, MAX_VISIBLE_LABELS_DESKTOP).map(ev => {
                  const s = eventTypeStyle(ev.type);
                  return (
                    <div key={ev.id} style={{
                      fontSize: ".56rem", fontWeight: 700, borderRadius: 4, padding: "1px 4px",
                      background: isSelected ? "rgba(255,255,255,.18)" : s.bg,
                      color: isSelected ? "#fff" : s.color,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      marginTop: 2, textAlign: "left",
                    }}>
                      {ev.title}
                    </div>
                  );
                })}
                {evs.length > MAX_VISIBLE_LABELS_DESKTOP && (
                  <div style={{ fontSize: ".54rem", color: isSelected ? "rgba(255,255,255,.7)" : "#9ca3af", marginTop: 2, textAlign: "left" }}>
                    +{evs.length - MAX_VISIBLE_LABELS_DESKTOP} more
                  </div>
                )}
              </div>

              {/* Mobile: dot indicators only, doesn't rely on color alone
                  (count text accompanies dots for 3+ events) */}
              <div className="elf-month-dots" style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap", justifyContent: "center", minHeight: 6 }}>
                {evs.slice(0, MAX_VISIBLE_DOTS_MOBILE).map(ev => {
                  const s = eventTypeStyle(ev.type);
                  return (
                    <span key={ev.id} style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: isSelected ? "#fff" : s.accent,
                    }} />
                  );
                })}
                {evs.length > MAX_VISIBLE_DOTS_MOBILE && (
                  <span style={{ fontSize: ".5rem", fontWeight: 700, color: isSelected ? "#fff" : "#9ca3af" }}>
                    +{evs.length - MAX_VISIBLE_DOTS_MOBILE}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <style>{`
        @media (min-width: 640px) {
          .elf-month-labels { display: flex !important; flex-direction: column; }
          .elf-month-dots { display: none !important; }
        }
      `}</style>

      {/* ── Selected day section ── */}
      <div style={{ marginTop: "1rem" }}>
        <h3 style={{ margin: "0 0 .6rem", fontSize: ".92rem", fontWeight: 800, color: "#0b1e3d" }}>
          {formatFullDate(selectedDate)}
        </h3>

        {selectedEvents.length === 0 ? (
          <div style={{
            background: "#fff", borderRadius: 14, padding: "1.5rem 1.25rem",
            textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
            fontSize: ".82rem", color: "#9ca3af",
          }}>
            No events scheduled for this day.
          </div>
        ) : (
          <div style={{
            background: "#fff", borderRadius: 14, overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          }}>
            {selectedEvents.map((ev, i) => {
              const s = eventTypeStyle(ev.type);
              const time = displayEventTime(ev);
              return (
                <button
                  key={ev.id}
                  onClick={() => onOpenEvent(ev)}
                  style={{
                    display: "flex", alignItems: "stretch", width: "100%",
                    border: "none", background: "none", cursor: "pointer", textAlign: "left",
                    padding: 0, font: "inherit", color: "inherit",
                    borderBottom: i < selectedEvents.length - 1 ? "1px solid #f6f6f8" : "none",
                  }}
                >
                  <div style={{ width: 3, background: s.accent, flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: ".75rem .9rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".2rem" }}>
                      <span style={{
                        padding: ".07rem .42rem", borderRadius: 100,
                        fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: ".04em", background: s.bg, color: s.color,
                      }}>
                        {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                      </span>
                      {time && <span style={{ fontSize: ".76rem", fontWeight: 600, color: "#6b7280" }}>{time}</span>}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#111827" }}>{ev.title}</div>
                    {ev.location && (
                      <div style={{ fontSize: ".76rem", color: "#6b7280", marginTop: ".15rem" }}>📍 {ev.location}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
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
