"use client";

import { useState } from "react";

// Phase 4C: compact "Export & Sync" menu — a single button that opens a
// small sheet, rather than several permanent header buttons crowding the
// existing Month/Agenda toggle + Add Event button on mobile.
//
// This first slice ships Print + Download only. Apple/Google subscription
// links and the staff regenerate/disable actions land in a follow-up once
// the calendar_subscription_tokens migration is approved and applied —
// intentionally not stubbed here with dead/disabled buttons.
export default function ExportMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);

  const handlePrint = () => {
    setOpen(false);
    // Print always reflects whatever month CalendarView currently has
    // visible — see PrintMonthView, which reads visibleMonth directly.
    window.print();
  };

  const handleDownload = () => {
    setOpen(false);
    window.location.href = `/api/team/${slug}/calendar/download`;
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", gap: ".35rem",
          padding: ".45rem .8rem", background: "#f3f4f6", color: "#374151",
          border: "none", borderRadius: 8, fontSize: ".8rem", fontWeight: 600, cursor: "pointer",
        }}
      >
        Export
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 60 }}
          />
          <div
            role="menu"
            aria-label="Export & Sync"
            style={{
              position: "absolute", right: 0, top: "calc(100% + .4rem)", zIndex: 61,
              background: "#fff", borderRadius: 12, minWidth: 220,
              boxShadow: "0 8px 28px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.05)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: ".6rem .9rem .4rem", fontSize: ".62rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
              Export &amp; Sync
            </div>
            <MenuItem label="Print Calendar" onClick={handlePrint} />
            <MenuItem label="Download Calendar (.ics)" onClick={handleDownload} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: ".65rem .9rem", border: "none", background: "none",
        fontSize: ".84rem", fontWeight: 600, color: "#111827", cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
