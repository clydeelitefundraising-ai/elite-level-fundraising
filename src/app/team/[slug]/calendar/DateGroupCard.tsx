"use client";

import { useState } from "react";
import { MapPin, ChevronRight } from "lucide-react";
import type { CalendarEventRow } from "@/lib/teamData";
import { eventTypeStyle, formatDateHeader, displayEventTime } from "@/lib/calendarShared";

// Phase 4A's Agenda date-grouped card, extracted in Phase 4B so Month
// view's month-list and selected-day sections can reuse the exact same
// event-card presentation instead of a second implementation.
export default function DateGroupCard({
  date,
  evs,
  isToday,
  isTomorrow,
  onOpen,
}: {
  date: string;
  evs: CalendarEventRow[];
  isToday: boolean;
  isTomorrow: boolean;
  onOpen: (ev: CalendarEventRow) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const { dayNum, weekday, monthYear } = formatDateHeader(date);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--surface-light)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        border: "1px solid var(--border-app)",
        boxShadow: hovered ? "0 2px 10px rgba(0,0,0,.06)" : "none",
        marginBottom: ".75rem",
        transition: "box-shadow .14s ease",
      }}
    >
      {/* Date header */}
      <div style={{
        padding: ".7rem 1rem .65rem",
        borderBottom: "1px solid var(--border-app)",
        display: "flex",
        alignItems: "center",
        gap: ".75rem",
        background: isToday ? "var(--surface-light-elevated)" : "var(--surface-light)",
      }}>
        <div style={{
          fontWeight: 800,
          fontSize: "1.7rem",
          color: isToday ? "var(--text-primary-app)" : "var(--text-secondary-app)",
          lineHeight: 1,
          minWidth: 30,
          textAlign: "center",
        }}>
          {dayNum}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--text-primary-app)", lineHeight: 1.2 }}>
            {weekday}
          </div>
          <div style={{ fontSize: ".64rem", color: "var(--text-muted-app)", marginTop: ".06rem" }}>
            {monthYear}
          </div>
        </div>
        {isToday && (
          <span style={{ background: "var(--team-primary)", color: "var(--team-primary-foreground)", borderRadius: "var(--radius-full)", fontSize: ".57rem", fontWeight: 700, padding: ".14rem .55rem", lineHeight: 1.4, flexShrink: 0 }}>
            Today
          </span>
        )}
        {isTomorrow && !isToday && (
          <span style={{ background: "var(--surface-light-elevated)", color: "var(--team-primary)", borderRadius: "var(--radius-full)", fontSize: ".57rem", fontWeight: 700, padding: ".14rem .55rem", lineHeight: 1.4, flexShrink: 0 }}>
            Tomorrow
          </span>
        )}
      </div>

      {/* Event rows */}
      {evs.map((ev, i) => {
        const s = eventTypeStyle(ev.type);
        const time = displayEventTime(ev);
        return (
          <button
            key={ev.id}
            onClick={() => onOpen(ev)}
            className="elf-focus-ring"
            style={{
              display: "flex",
              alignItems: "stretch",
              width: "100%",
              border: "none",
              background: "none",
              cursor: "pointer",
              textAlign: "left",
              padding: 0,
              font: "inherit",
              color: "inherit",
              borderBottom: i < evs.length - 1 ? "1px solid var(--border-app)" : "none",
            }}
          >
            {/* Left accent bar */}
            <div style={{ width: 3, background: s.accent, flexShrink: 0 }} />

            {/* Content */}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: ".7rem", padding: ".65rem .9rem .65rem .75rem" }}>
              {/* Time column */}
              <div style={{ flexShrink: 0, width: 60, paddingTop: ".14rem", textAlign: "right" }}>
                <span style={{ fontSize: ".72rem", fontWeight: 600, color: time ? "var(--text-secondary-app)" : "#d1d5db" }}>
                  {time || "—"}
                </span>
              </div>

              {/* Title + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".12rem" }}>
                  <span style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)" }}>{ev.title}</span>
                  <span style={{
                    padding: ".07rem .42rem", borderRadius: "var(--radius-full)",
                    fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0,
                  }}>
                    {ev.type}
                  </span>
                </div>
                {ev.location && (
                  <div style={{ fontSize: ".74rem", color: "var(--text-muted-app)", display: "flex", alignItems: "center", gap: ".25rem" }}>
                    <MapPin size={11} strokeWidth={2} style={{ flexShrink: 0 }} /> {ev.location}
                  </div>
                )}
              </div>

              <ChevronRight size={15} strokeWidth={2} style={{ color: "var(--text-muted-app)", flexShrink: 0, marginTop: ".2rem" }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
