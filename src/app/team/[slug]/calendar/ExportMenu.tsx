"use client";

import { useState } from "react";

type Status =
  | { enabled: false }
  | { enabled: true; createdAt: string; url: string; webcalUrl: string; googleUrl: string };

// Phase 4C: compact "Export & Sync" menu — a single button that opens a
// small sheet, rather than several permanent header buttons crowding the
// existing Month/Agenda toggle + Add Event button on mobile.
//
// Calendar Sync is true self-service for ANY authenticated team member:
// the server recomputes the current active subscription token from the
// active row's id + CALENDAR_SYNC_PEPPER on every GET (see
// calendarSubscription.ts) — nothing is ever cached client-side as
// authoritative, so reopening this menu after a staff regenerate/disable
// always reflects the current state, never a stale link.
export default function ExportMenu({ slug, canManage }: { slug: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refreshStatus = () => {
    setLoadingStatus(true);
    return fetch(`/api/team/${slug}/calendar/subscription`)
      .then(r => r.ok ? r.json() : { enabled: false })
      .then((s: Status) => setStatus(s))
      .catch(() => setStatus({ enabled: false }))
      .finally(() => setLoadingStatus(false));
  };

  const openMenu = () => {
    setOpen(true);
    setError("");
    setCopied(false);
    void refreshStatus();
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
    setStatus(data);
    setCopied(false);
  };

  const disable = async () => {
    setBusy(true); setError("");
    const res = await fetch(`/api/team/${slug}/calendar/subscription`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setError("Failed to disable calendar sync."); return; }
    setStatus({ enabled: false });
  };

  const copyLink = async () => {
    if (!status?.enabled) return;
    try {
      await navigator.clipboard.writeText(status.url);
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
              {loadingStatus || status === null ? (
                <p style={syncNote}>Checking sync status…</p>
              ) : status.enabled ? (
                <>
                  <SyncButton label={copied ? "Copied!" : "Copy Subscription Link"} onClick={copyLink} />
                  {/* target="_blank" is required in the iOS app, not just
                      cosmetic: without it, this same-window webcal:// link
                      goes through Capacitor's decidePolicyFor navigation
                      delegate, which only checks the URL's HOST against
                      allowNavigation (not the scheme) — since this URL's
                      host is our own domain, it gets allowed, WKWebView
                      then fails to actually load a webcal:// page, and
                      that failure lands on the app's offline screen.
                      target="_blank" instead routes through
                      createWebViewWith, which unconditionally hands the
                      URL to UIApplication.shared.open() — the correct
                      native "subscribe to calendar" handoff. Same pattern
                      already used one line below for Google Calendar. */}
                  <a href={status.webcalUrl} target="_blank" rel="noopener noreferrer" style={linkButton}>Add to Apple Calendar</a>
                  <a href={status.googleUrl} target="_blank" rel="noopener noreferrer" style={linkButton}>Add to Google Calendar</a>
                  {canManage && (
                    <>
                      <div style={{ height: 1, background: "#f3f4f6", margin: ".5rem 0" }} />
                      <SyncButton label={busy ? "Working…" : "Regenerate Sync Link"} onClick={issue} disabled={busy} />
                      <SyncButton label={busy ? "Working…" : "Disable Calendar Sync"} onClick={disable} disabled={busy} danger />
                    </>
                  )}
                </>
              ) : canManage ? (
                <>
                  <p style={syncNote}>Let athletes, parents, and staff subscribe to this calendar from Apple or Google Calendar.</p>
                  <SyncButton label={busy ? "Working…" : "Enable Calendar Sync"} onClick={issue} disabled={busy} />
                </>
              ) : (
                <p style={syncNote}>Calendar sync is not currently enabled for this team.</p>
              )}
              {error && <p style={{ ...syncNote, color: "#dc2626" }}>{error}</p>}
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
