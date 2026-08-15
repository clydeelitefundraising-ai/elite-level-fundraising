"use client";

import type { CalendarEventRow } from "@/lib/teamData";
import {
  eventTypeStyle,
  EVENT_TYPE_LABELS,
  buildMonthGrid,
  eventsInMonth,
  formatMonthYear,
  formatFullDate,
  displayEventTime,
  WEEKDAY_LABELS,
  type MonthKey,
} from "@/lib/calendarShared";

// Phase 4C: dedicated print/PDF layout. Presentational only — every date
// computation (grid cells, month filtering, time formatting) is the exact
// same pure logic from calendarShared.ts already used by the on-screen
// MonthView/DateGroupCard, so print can never disagree with the screen
// about which events fall on which day. Deliberately ALWAYS uses
// `visibleMonth`, never a selected-day override — printing must reflect
// "the currently displayed month" regardless of on-screen selection state.
export default function PrintMonthView({
  teamName,
  events,
  visibleMonth,
}: {
  teamName: string;
  events: CalendarEventRow[];
  visibleMonth: MonthKey;
}) {
  const cells = buildMonthGrid(visibleMonth);
  const monthEvents = eventsInMonth(events, visibleMonth);
  const byDate = new Map<string, CalendarEventRow[]>();
  for (const ev of monthEvents) {
    if (!byDate.has(ev.event_date)) byDate.set(ev.event_date, []);
    byDate.get(ev.event_date)!.push(ev);
  }

  return (
    <div style={{ color: "#111", fontFamily: "Georgia, 'Times New Roman', serif" }}>
      {/* ── Branding / header ── */}
      <div style={{ textAlign: "center", marginBottom: "1.25rem", borderBottom: "2px solid #0b1e3d", paddingBottom: ".75rem" }}>
        <div style={{ fontSize: ".7rem", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#6b7280" }}>
          Elite Level Fundraising
        </div>
        <h1 style={{ margin: ".25rem 0 0", fontSize: "1.5rem", fontWeight: 800, color: "#0b1e3d" }}>
          {teamName}
        </h1>
        <div style={{ marginTop: ".2rem", fontSize: "1.1rem", fontWeight: 700, color: "#374151" }}>
          {formatMonthYear(visibleMonth)}
        </div>
      </div>

      {/* ── Traditional 7-column month grid ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "1.5rem" }}>
        <thead>
          <tr>
            {WEEKDAY_LABELS.map(w => (
              <th key={w} style={{
                border: "1px solid #d1d5db", padding: ".3rem", fontSize: ".7rem",
                textTransform: "uppercase", letterSpacing: ".05em", color: "#374151", background: "#f3f4f6",
              }}>
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }).map((_, row) => (
            <tr key={row}>
              {cells.slice(row * 7, row * 7 + 7).map(cell => {
                const evs = byDate.get(cell.iso) ?? [];
                return (
                  <td key={cell.iso} style={{
                    border: "1px solid #d1d5db", verticalAlign: "top", padding: ".25rem",
                    height: "4.2rem", width: `${100 / 7}%`,
                    color: cell.inCurrentMonth ? "#111" : "#b0b7c3",
                  }}>
                    <div style={{ fontSize: ".72rem", fontWeight: 700, marginBottom: ".15rem" }}>{cell.day}</div>
                    {evs.map(ev => {
                      const s = eventTypeStyle(ev.type);
                      return (
                        <div key={ev.id} style={{ fontSize: ".58rem", lineHeight: 1.3, marginBottom: "1px", display: "flex", alignItems: "flex-start", gap: "3px" }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.accent, flexShrink: 0, marginTop: "3px" }} />
                          <span>{ev.title}</span>
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Chronological event details ── */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", borderBottom: "1px solid #d1d5db", paddingBottom: ".3rem", marginBottom: ".6rem" }}>
          Event Details
        </h2>
        {monthEvents.length === 0 ? (
          <p style={{ fontSize: ".8rem", color: "#6b7280" }}>No events scheduled this month.</p>
        ) : (
          monthEvents.map(ev => {
            const s = eventTypeStyle(ev.type);
            const time = displayEventTime(ev);
            return (
              <div key={ev.id} style={{ marginBottom: ".6rem", pageBreakInside: "avoid" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: ".4rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: ".85rem" }}>{formatFullDate(ev.event_date)}</span>
                  <span style={{
                    fontSize: ".6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em",
                    color: s.color, border: `1px solid ${s.accent}`, borderRadius: 3, padding: "0 .3rem",
                  }}>
                    {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                  </span>
                  {time && <span style={{ fontSize: ".78rem", color: "#374151" }}>— {time}</span>}
                </div>
                <div style={{ fontSize: ".85rem", fontWeight: 700, marginTop: "2px" }}>{ev.title}</div>
                {ev.location && <div style={{ fontSize: ".76rem", color: "#374151" }}>{ev.location}</div>}
                {ev.description && <div style={{ fontSize: ".76rem", color: "#4b5563", marginTop: "2px" }}>{ev.description}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
