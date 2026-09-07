"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

type Section = "athletes" | "staff";

// Phase 7: nested Athletes | Staff toggle inside the Roster tab. Same
// query-state pattern as TeamTabs, one level deeper (?section=). Default
// is "athletes" — preserves the pre-Phase-7 Team page as the first thing
// a member sees when they land on Roster.
export default function RosterTabs({
  athletes,
  staff,
}: {
  athletes: ReactNode;
  staff:    ReactNode;
}) {
  const searchParams = useSearchParams();
  const initial: Section = searchParams.get("section") === "staff" ? "staff" : "athletes";
  const [section, setSection] = useState<Section>(initial);

  return (
    <div>
      <div
        role="tablist"
        aria-label="Roster section"
        style={{
          display: "inline-flex", background: "var(--surface-light-elevated)", borderRadius: "var(--radius-md)", padding: 2,
          marginBottom: ".75rem", gap: 2,
        }}
      >
        {([
          { id: "athletes" as const, label: "Athletes" },
          { id: "staff" as const,    label: "Staff" },
        ]).map(({ id, label }) => (
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

      {section === "athletes" ? athletes : staff}
    </div>
  );
}
