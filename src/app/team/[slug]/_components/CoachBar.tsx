"use client";

import { Plus } from "lucide-react";

// Phase 5: tokenized (was hardcoded navy #0b1e3d) + Lucide Plus icon
// (was a literal "+" text glyph). Shared across Home, Sponsors, Shop,
// Files/Updates (mobile+desktop), Calendar (mobile+desktop), and Team —
// every consumer inherits this visual update automatically. `show`/
// `label`/`onAdd` API and behavior are completely unchanged.
export default function CoachBar({
  show,
  label,
  onAdd,
}: {
  show: boolean;
  label: string;
  onAdd: () => void;
}) {
  if (!show) return null;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ".75rem" }}>
      <button
        onClick={onAdd}
        className="elf-focus-ring"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: ".35rem",
          padding: ".45rem .95rem",
          background: "var(--team-primary)",
          color: "var(--team-primary-foreground)",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontSize: ".82rem",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Plus size={15} aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
