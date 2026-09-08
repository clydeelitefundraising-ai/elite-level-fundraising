"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { TeamActor } from "@/lib/permissions";
import { shouldShowDesktopRoster } from "./rosterHelpers";
import styles from "./Team.module.css";

type Section = "athletes" | "staff";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "athletes", label: "Athletes" },
  { id: "staff",    label: "Staff" },
];

// Phase 7: nested Athletes | Staff toggle inside the Roster tab. Same
// query-state pattern as TeamTabs, one level deeper (?section=). Default
// is "athletes" — preserves the pre-Phase-7 Team page as the first thing
// a member sees when they land on Roster.
//
// Desktop-density revision: the pill/segmented control below is kept
// unchanged for mobile (and for any actor who doesn't get TeamTabs'
// compact desktop nav) — the user explicitly approved the mobile roster
// and asked not to re-touch it. At desktop widths, coach-eligible actors
// now see a second, visually SECONDARY nav (small text links + a thin
// var(--team-primary) underline on the active item, no pill/box chrome)
// so it reads as subordinate to TeamTabs' own compact desktop nav
// directly above it, rather than two identical-looking boxed segmented
// controls stacked on top of each other.
//
// Eligibility uses the exact same shouldShowDesktopRoster(actor) gate as
// TeamTabs.tsx's showCompactDesktopNav and TeamView.tsx's showDesktop —
// deliberately, not a blind CSS breakpoint: boosters/athletes/parents
// don't get the new DesktopRosterTable at any width (see TeamView.tsx),
// so they must keep the pill control at every width too, exactly like
// TeamTabs already does for the primary tabs. Matching that existing
// actor-aware pattern here (rather than toggling purely on viewport
// width) avoids showing a secondary desktop nav for a roster surface
// those actors don't actually get.
export default function RosterTabs({
  athletes,
  staff,
  actor,
}: {
  athletes: ReactNode;
  staff:    ReactNode;
  actor: TeamActor;
}) {
  const searchParams = useSearchParams();
  const initial: Section = searchParams.get("section") === "staff" ? "staff" : "athletes";
  const [section, setSection] = useState<Section>(initial);
  const showCompactDesktopNav = shouldShowDesktopRoster(actor);

  const pillControl = (
    <div
      role="tablist"
      aria-label="Roster section"
      style={{
        display: "inline-flex", background: "var(--surface-light-elevated)", borderRadius: "var(--radius-md)", padding: 2,
        marginBottom: ".75rem", gap: 2,
      }}
    >
      {SECTIONS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={section === id}
          onClick={() => setSection(id)}
          className="elf-focus-ring"
          style={{
            padding: ".35rem .8rem",
            borderRadius: "var(--radius-sm)",
            border: "none",
            cursor: "pointer",
            fontSize: ".76rem",
            fontWeight: 700,
            background: section === id ? "var(--surface-light)" : "transparent",
            color: section === id ? "var(--text-primary-app)" : "var(--text-muted-app)",
            boxShadow: section === id ? "0 1px 2px rgba(0,0,0,.08)" : "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const secondaryDesktopNav = (
    <div
      role="tablist"
      aria-label="Roster section"
      style={{ display: "flex", gap: "1.1rem", marginBottom: ".85rem" }}
    >
      {SECTIONS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={section === id}
          onClick={() => setSection(id)}
          className="elf-focus-ring"
          style={{
            background: "none",
            border: "none",
            borderBottom: section === id ? "2px solid var(--team-primary)" : "2px solid transparent",
            cursor: "pointer",
            padding: "0 0 .35rem",
            fontSize: ".76rem",
            fontWeight: section === id ? 700 : 500,
            color: section === id ? "var(--text-primary-app)" : "var(--text-muted-app)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {showCompactDesktopNav ? (
        <>
          <div className={styles.mobileOnly}>{pillControl}</div>
          <div className={styles.desktopOnly}>{secondaryDesktopNav}</div>
        </>
      ) : (
        pillControl
      )}

      {section === "athletes" ? athletes : staff}
    </div>
  );
}
