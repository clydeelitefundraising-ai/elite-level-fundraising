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
        background: "var(--surface-light)", borderRadius: "var(--radius-lg)", padding: "3rem 1.5rem",
        textAlign: "center", border: "1px solid var(--border-app)",
      }}>
        <CalendarDays size={30} strokeWidth={1.5} style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: ".75rem" }} />
        <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>
          No events scheduled
        </div>
        <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
          {canManage ? "Add the first event above." : "Check back soon for schedule updates."}
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
