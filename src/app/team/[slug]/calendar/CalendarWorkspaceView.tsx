"use client";

import { useRef } from "react";
import type { CalendarEventRow } from "@/lib/teamData";
import type { TeamActor } from "@/lib/permissions";
import { buildCalendarPrintFilename } from "@/lib/calendarShared";
import { useCalendarWorkspace } from "./useCalendarWorkspace";
import { shouldShowDesktopCalendar } from "./calendarHelpers";
import CalendarView from "./CalendarView";
import DesktopCalendarView from "./DesktopCalendarView";
import EventFormModal from "./EventFormModal";
import EventDetailsModal from "../_components/EventDetailsModal";
import PrintMonthView from "./PrintMonthView";
import styles from "./Calendar.module.css";

// D4: thin wrapper, mirrors TeamView.tsx's role in D3. Calls
// useCalendarWorkspace() exactly ONCE and shares the resulting
// state/handlers with both the existing mobile presentation
// (CalendarView.tsx, unmodified in behavior) and the new desktop
// workspace (DesktopCalendarView.tsx) — one authoritative Calendar
// workflow, two presentation surfaces. shouldShowDesktopCalendar(actor)
// (isCoachOnly, NOT isStaff) deliberately excludes boosters from the new
// desktop workspace, matching the exact boundary D2/D3 already
// established — boosters keep the existing Calendar presentation, with
// their existing isStaff Add/Edit/Delete permissions, at every width.
// permissions.ts is untouched.
//
// The Add/Edit modal and the Event Details modal are each mounted
// EXACTLY ONCE here, not by either presentation individually — Modal.tsx
// renders via createPortal(document.body), so a display:none ancestor
// (the mobileOnly/desktopOnly CSS toggle) would NOT stop a duplicate
// instance from showing (see EventFormModal.tsx's comment for the
// identical D3 precedent).
export default function CalendarWorkspaceView({
  slug,
  initialEvents,
  actor,
  teamName,
}: {
  slug: string;
  initialEvents: CalendarEventRow[];
  actor: TeamActor;
  teamName: string;
}) {
  const cal = useCalendarWorkspace(slug, initialEvents, actor, teamName);
  const showDesktop = shouldShowDesktopCalendar(actor);

  // Phase 8c pattern, unchanged in behavior — just relocated here so ONE
  // ref/filename pair is shared by the wrapper's hidden print DOM node and
  // both presentations' ExportMenu, instead of living inside the
  // useCalendarWorkspace() state bag (kept out of that object deliberately
  // — mixing a ref into a hook's returned state object trips
  // eslint-plugin-react-hooks' "refs" rule on every property access off
  // that object, since it can no longer prove a given access isn't a ref
  // read).
  const printRef = useRef<HTMLDivElement>(null);
  const printFilename = buildCalendarPrintFilename(teamName || "Team Calendar", cal.visibleMonth);

  return (
    <>
      {/* Phase 4C print architecture, unchanged — moved here from
          CalendarView.tsx since it must wrap BOTH presentation surfaces,
          not just the mobile one. .elf-calendar-noprint (all normal
          screen UI, including any open modal since it's a DOM
          descendant) is hidden at print time; .elf-calendar-print
          (hidden on screen) becomes visible. Print always renders
          visibleMonth's events regardless of selectedDate. */}
      <style>{`
        @media print {
          #elf-team-header, [role="navigation"] { display: none !important; }
          .elf-calendar-noprint { display: none !important; }
          .elf-calendar-print { display: block !important; }
        }
        @media screen {
          .elf-calendar-print { display: none; }
        }
      `}</style>

      <div className="elf-calendar-print" ref={printRef}>
        <PrintMonthView teamName={teamName || "Team Calendar"} events={cal.events} visibleMonth={cal.visibleMonth} />
      </div>

      <div className="elf-calendar-noprint">
        <div className={styles.mobileOnly}>
          <CalendarView cal={cal} printRef={printRef} printFilename={printFilename} />
        </div>
        {showDesktop && (
          <div className={styles.desktopOnly}>
            <DesktopCalendarView cal={cal} printRef={printRef} printFilename={printFilename} />
          </div>
        )}
      </div>

      {/* Rendered exactly once, shared by both presentation surfaces
          above regardless of which is CSS-visible. */}
      <EventFormModal cal={cal} />
      {cal.viewing && (
        <EventDetailsModal
          ev={cal.viewing}
          canManage={cal.canManage}
          onClose={() => cal.setViewing(null)}
          onEdit={cal.openEdit}
          onDelete={cal.handleDelete}
        />
      )}
    </>
  );
}
