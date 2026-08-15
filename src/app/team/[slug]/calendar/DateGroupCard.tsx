"use client";

import { useState } from "react";
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
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: hovered
          ? "0 4px 18px rgba(0,0,0,.09), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        marginBottom: ".75rem",
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "transform .14s ease, box-shadow .14s ease",
      }}
    >
      {/* Date header */}
      <div style={{
        padding: ".7rem 1rem .65rem",
        borderBottom: "1px solid #f3f4f6",
        display: "flex",
        alignItems: "center",
        gap: ".75rem",
        background: isToday ? "linear-gradient(135deg, #f0f4ff 0%, #fff 60%)" : "#fff",
      }}>
        <div style={{
          fontWeight: 800,
          fontSize: "1.7rem",
          color: isToday ? "#0b1e3d" : "#374151",
          lineHeight: 1,
          minWidth: 30,
          textAlign: "center",
        }}>
          {dayNum}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: ".84rem", color: "#111827", lineHeight: 1.2 }}>
            {weekday}
          </div>
          <div style={{ fontSize: ".64rem", color: "#9ca3af", marginTop: ".06rem" }}>
            {monthYear}
          </div>
        </div>
        {isToday && (
          <span style={{ background: "#0b1e3d", color: "#fff", borderRadius: 100, fontSize: ".57rem", fontWeight: 700, padding: ".14rem .55rem", lineHeight: 1.4, flexShrink: 0 }}>
            Today
          </span>
        )}
        {isTomorrow && !isToday && (
          <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".57rem", fontWeight: 700, padding: ".14rem .55rem", lineHeight: 1.4, flexShrink: 0 }}>
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
              borderBottom: i < evs.length - 1 ? "1px solid #f6f6f8" : "none",
            }}
          >
            {/* Left accent bar */}
            <div style={{ width: 3, background: s.accent, flexShrink: 0 }} />

            {/* Content */}
            <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: ".7rem", padding: ".65rem .9rem .65rem .75rem" }}>
              {/* Time column */}
              <div style={{ flexShrink: 0, width: 60, paddingTop: ".14rem", textAlign: "right" }}>
                <span style={{ fontSize: ".72rem", fontWeight: 600, color: time ? "#374151" : "#d1d5db" }}>
                  {time || "—"}
                </span>
              </div>

              {/* Title + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".12rem" }}>
                  <span style={{ fontWeight: 700, fontSize: ".9rem", color: "#111827" }}>{ev.title}</span>
                  <span style={{
                    padding: ".07rem .42rem", borderRadius: 100,
                    fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0,
                  }}>
                    {ev.type}
                  </span>
                </div>
                {ev.location && (
                  <div style={{ fontSize: ".74rem", color: "#6b7280" }}>📍 {ev.location}</div>
                )}
              </div>

              <span style={{ fontSize: ".85rem", color: "#c1c7d0", flexShrink: 0, paddingTop: ".2rem" }}>›</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
