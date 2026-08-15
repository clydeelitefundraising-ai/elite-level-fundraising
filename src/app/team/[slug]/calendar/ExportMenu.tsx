"use client";

import { useState } from "react";

type Status = { enabled: boolean; createdAt?: string };
type Revealed = { url: string; webcalUrl: string; googleUrl: string };

// Phase 4C: compact "Export & Sync" menu — a single button that opens a
// small sheet, rather than several permanent header buttons crowding the
// existing Month/Agenda toggle + Add Event button on mobile.
//
// Subscription-token security note: the server stores only a SHA-256 hash
// of the token (never the raw value — see calendarSubscription.ts), so
// the raw subscription URL can only ever be shown once, at the exact
// moment it's created or regenerated. This component therefore only ever
// has the actual link available in `revealed` state right after a staff
// member issues one in THIS browser session — a member who opens the menu
// later (without having just generated it) sees "sync is enabled" and is
// expected to get the link from whoever generated it (e.g. shared via an
// Announcement), never a raw error either way.
export default function ExportMenu({ slug, canManage }: { slug: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [copied, setCopied] = useState(false);

  const openMenu = () => {
    setOpen(true);
    setError("");
    setLoadingStatus(true);
    fetch(`/api/team/${slug}/calendar/subscription`)
      .then(r => r.ok ? r.json() : { enabled: false })
      .then((s: Status) => setStatus(s))
      .catch(() => setStatus({ enabled: false }))
      .finally(() => setLoadingStatus(false));
  };

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

  const issue = async () => {
    setBusy(true); setError("");
    const res = await fetch(`/api/team/${slug}/calendar/subscription`, { method: "PUT" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error ?? "Failed to enable calendar sync."); return; }
    setRevealed({ url: data.url, webcalUrl: data.webcalUrl, googleUrl: data.googleUrl });
    setStatus({ enabled: true, createdAt: data.createdAt });
    setCopied(false);
  };

  const disable = async () => {
    setBusy(true); setError("");
    const res = await fetch(`/api/team/${slug}/calendar/subscription`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setError("Failed to disable calendar sync."); return; }
    setStatus({ enabled: false });
    setRevealed(null);
  };

  const copyLink = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy automatically — select and copy the link manually.");
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => (open ? setOpen(false) : openMenu())}
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
            <MenuItem label="Print Calendar" onClick={handlePrint} />
            <MenuItem label="Download Calendar (.ics)" onClick={handleDownload} />

            <SectionLabel>Calendar Sync</SectionLabel>
            <div style={{ padding: "0 .9rem .8rem" }}>
              {loadingStatus ? (
                <p style={syncNote}>Checking sync status…</p>
              ) : revealed ? (
                <SyncRevealed revealed={revealed} copied={copied} onCopy={copyLink} />
              ) : status?.enabled ? (
                canManage ? (
                  <>
                    <p style={syncNote}>Calendar sync is enabled for this team.</p>
                    <SyncButton label={busy ? "Working…" : "Regenerate Sync Link"} onClick={issue} disabled={busy} />
                    <SyncButton label={busy ? "Working…" : "Disable Calendar Sync"} onClick={disable} disabled={busy} danger />
                  </>
                ) : (
                  <p style={syncNote}>Calendar sync is enabled for this team. Ask a coach or booster to share the subscription link with you.</p>
                )
              ) : (
                canManage ? (
                  <>
                    <p style={syncNote}>Let athletes, parents, and staff subscribe to this calendar from Apple or Google Calendar.</p>
                    <SyncButton label={busy ? "Working…" : "Enable Calendar Sync"} onClick={issue} disabled={busy} />
                  </>
                ) : (
                  <p style={syncNote}>Calendar sync is not currently enabled for this team.</p>
                )
              )}
              {error && <p style={{ ...syncNote, color: "#dc2626" }}>{error}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SyncRevealed({ revealed, copied, onCopy }: { revealed: Revealed; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <p style={syncNote}>Save this link now — for your security it won&apos;t be shown again. Share it with your team (e.g. in an Announcement).</p>
      <div style={{
        fontSize: ".68rem", color: "#374151", background: "#f9fafb", border: "1px solid #e5e7eb",
        borderRadius: 8, padding: ".5rem .6rem", wordBreak: "break-all", marginBottom: ".5rem",
      }}>
        {revealed.url}
      </div>
      <SyncButton label={copied ? "Copied!" : "Copy Subscription Link"} onClick={onCopy} />
      <a href={revealed.webcalUrl} style={linkButton}>Add to Apple Calendar</a>
      <a href={revealed.googleUrl} target="_blank" rel="noopener noreferrer" style={linkButton}>Add to Google Calendar</a>
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

function SyncButton({ label, onClick, disabled, danger }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", textAlign: "center", marginBottom: ".4rem",
        padding: ".5rem .7rem", border: "none", borderRadius: 8,
        background: danger ? "#fef2f2" : "#0b1e3d", color: danger ? "#dc2626" : "#fff",
        fontSize: ".78rem", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? .6 : 1,
      }}
    >
      {label}
    </button>
  );
}

const linkButton: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "center", marginBottom: ".4rem", boxSizing: "border-box",
  padding: ".5rem .7rem", borderRadius: 8, background: "#f0f4ff", color: "#1d4ed8",
  fontSize: ".78rem", fontWeight: 700, textDecoration: "none",
};

const syncNote: React.CSSProperties = { margin: "0 0 .5rem", fontSize: ".76rem", color: "#6b7280", lineHeight: 1.4 };
