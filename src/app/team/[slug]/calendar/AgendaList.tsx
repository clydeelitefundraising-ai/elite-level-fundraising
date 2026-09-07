"use client";

import { CalendarDays } from "lucide-react";
import type { CalendarEventRow } from "@/lib/teamData";
import { arizonaTodayISO, arizonaTomorrowISO, groupEventsByDate } from "@/lib/calendarShared";
import DateGroupCard from "./DateGroupCard";

// D4: Agenda's date-grouped list, extracted verbatim from CalendarView.tsx's
// original inline Agenda block so the mobile presentation (CalendarView.tsx)
// and the new desktop workspace (DesktopCalendarView.tsx) share ONE Agenda
// implementation instead of two — per D4 scope, Agenda is preserved, not
// reimplemented, for desktop.
export default function AgendaList({
  events,
  canManage,
  onOpen,
}: {
  events: CalendarEventRow[];
  canManage: boolean;
  onOpen: (ev: CalendarEventRow) => void;
}) {
  const today = arizonaTodayISO();
  const tomorrow = arizonaTomorrowISO();
  const groups = groupEventsByDate(events);

  if (events.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: ".65rem",
        background: "var(--surface-light)", borderRadius: "var(--radius-md)", padding: ".85rem 1rem",
        border: "1px solid var(--border-app)",
      }}>
        <CalendarDays size={16} strokeWidth={2} style={{ color: "var(--text-muted-app)", flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: ".78rem", color: "var(--text-secondary-app)", textTransform: "uppercase", letterSpacing: ".04em" }}>
            No Events Scheduled
          </div>
          <div style={{ fontSize: ".78rem", color: "var(--text-muted-app)", marginTop: ".1rem" }}>
            {canManage ? "Add the first event above." : "Check back soon for schedule updates."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {Array.from(groups.entries()).map(([date, evs]) => (
        <DateGroupCard
          key={date}
          date={date}
          evs={evs}
          isToday={date === today}
          isTomorrow={date === tomorrow}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}
