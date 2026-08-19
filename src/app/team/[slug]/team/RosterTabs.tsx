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
          display: "inline-flex", background: "#eef0f4", borderRadius: 9, padding: 2,
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
            style={{
              padding: ".35rem .8rem",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontSize: ".76rem",
              fontWeight: 700,
              background: section === id ? "#fff" : "transparent",
              color: section === id ? "#0b1e3d" : "#6b7280",
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
