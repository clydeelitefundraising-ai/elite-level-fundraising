"use client";

import type { CoachSession } from "@/lib/teamSession";

export default function CoachBar({
  coach,
  label,
  onAdd,
}: {
  coach: CoachSession | null;
  label: string;
  onAdd: () => void;
}) {
  if (!coach) return null;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: ".75rem" }}>
      <button
        onClick={onAdd}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: ".35rem",
          padding: ".45rem .95rem",
          background: "#0b1e3d",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: ".82rem",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "1rem", lineHeight: 1, marginTop: -1 }}>+</span>
        {label}
      </button>
    </div>
  );
}
