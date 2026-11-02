"use client";

import { useState, type RefObject } from "react";
import { useDemoNav } from "./demoRouter";

// Twin of calendar/ExportMenu.tsx. The demo team has calendar sync turned
// on, so every role sees the subscribe options (and staff see Regenerate /
// Disable). Nothing is printed, downloaded, copied or opened.
export default function DemoExportMenu({ canManage }: { slug: string; canManage: boolean; printRef: RefObject<HTMLDivElement | null>; printFilename: string }) {
  const { notify } = useDemoNav();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const act = (message: string) => { setOpen(false); notify(message); };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="elf-focus-ring"
        style={{
          display: "inline-flex", alignItems: "center", gap: ".35rem",
          padding: ".45rem .8rem", background: "var(--surface-light-elevated)", color: "var(--text-secondary-app)",
          border: "none", borderRadius: "var(--radius-md)", fontSize: ".8rem", fontWeight: 600, cursor: "pointer",
        }}
      >
        Export
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div
            role="menu"
            aria-label="Export & Sync"
            style={{
              position: "absolute", right: 0, top: "calc(100% + .4rem)", zIndex: 61,
              background: "#fff", borderRadius: 12, width: 280,
              boxShadow: "0 8px 28px rgba(0,0,0,.16), 0 0 0 1px rgba(0,0,0,.05)",
              overflow: "hidden", maxHeight: "70vh", overflowY: "auto",
            }}
          >
            <SectionLabel>Export</SectionLabel>
            <MenuItem label="Print Calendar" onClick={() => act("Preview only — in the real app this prints or shares the month.")} />
            <MenuItem label="Download Calendar (.ics)" onClick={() => act("Preview only — in the real app this downloads the team calendar.")} />
            <SectionLabel>Calendar Sync</SectionLabel>
            <div style={{ padding: "0 .9rem .8rem" }}>
              {enabled ? (
                <>
                  <SyncButton label="Copy Subscription Link" onClick={() => act("Preview only — the demo team has no real subscription link.")} />
                  <button type="button" onClick={() => act("Preview only — in the real app this subscribes Apple Calendar.")} style={linkButton}>Add to Apple Calendar</button>
                  <button type="button" onClick={() => act("Preview only — in the real app this subscribes Google Calendar.")} style={linkButton}>Add to Google Calendar</button>
                  {canManage && (
                    <>
                      <div style={{ height: 1, background: "#f3f4f6", margin: ".5rem 0" }} />
                      <SyncButton label="Regenerate Sync Link" onClick={() => act("Preview only — no sync link was changed.")} />
                      <SyncButton label="Disable Calendar Sync" onClick={() => { setEnabled(false); notify("Preview only — sync was turned off in this demo only."); }} danger />
                    </>
                  )}
                </>
              ) : canManage ? (
                <>
                  <p style={syncNote}>Let athletes, parents, and staff subscribe to this calendar from Apple or Google Calendar.</p>
                  <SyncButton label="Enable Calendar Sync" onClick={() => { setEnabled(true); notify("Preview only — sync was turned on in this demo only."); }} />
                </>
              ) : (
                <p style={syncNote}>Calendar sync is not currently enabled for this team.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: ".6rem .9rem .4rem", fontSize: ".62rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".08em" }}>
      {children}
    </div>
  );
}

function MenuItem({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: ".65rem .9rem", border: "none", background: "none",
        fontSize: ".84rem", fontWeight: 600, color: "#111827",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .6 : 1,
      }}
    >
      {label}
    </button>
  );
}

function SyncButton({ label, onClick, disabled, danger }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", textAlign: "center", marginBottom: ".4rem",
        padding: ".5rem .7rem", border: "none", borderRadius: 8,
        background: danger ? "#fef2f2" : "var(--team-primary)", color: danger ? "#dc2626" : "var(--team-primary-foreground)",
        fontSize: ".78rem", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? .6 : 1,
      }}
    >
      {label}
    </button>
  );
}

// Same look as the real menu's Apple/Google links; rendered as buttons
// because the demo opens nothing outside itself.
const linkButton: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "center", marginBottom: ".4rem", boxSizing: "border-box",
  padding: ".5rem .7rem", borderRadius: 8, background: "var(--surface-light-elevated)", color: "var(--team-primary)",
  fontSize: ".78rem", fontWeight: 700, textDecoration: "none",
  border: "none", cursor: "pointer", fontFamily: "inherit",
};
const syncNote: React.CSSProperties = { margin: "0 0 .5rem", fontSize: ".76rem", color: "#6b7280", lineHeight: 1.4 };
