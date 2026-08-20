"use client";

import { useState, type RefObject } from "react";
import { Capacitor } from "@capacitor/core";
import { AppLauncher } from "@capacitor/app-launcher";
import { renderElementToImage, shareFileOrFallback } from "../_components/nativeFileShare";

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
export default function ExportMenu({
  slug,
  canManage,
  printRef,
  printFilename,
}: {
  slug: string;
  canManage: boolean;
  printRef: RefObject<HTMLDivElement | null>;
  printFilename: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);

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

  // Phase 8c: window.print() is a silent no-op inside the installed iOS
  // app (WKWebView implements no print pipeline) — same root cause as
  // Phase 8b's Team QR fix. Rasterizes the exact .elf-calendar-print DOM
  // node CalendarView already keeps mounted (built from visibleMonth,
  // never selectedDate — see printRef's origin in CalendarView.tsx) and
  // offers it via the Web Share API. Desktop/browser is unaffected: when
  // file sharing isn't available, this falls straight through to the
  // original window.print() call, unchanged.
  const handlePrint = async () => {
    setOpen(false);
    const fallback = () => window.print();
    const node = printRef.current;
    if (!node) { fallback(); return; }
    setPreparingPrint(true);
    try {
      const file = await renderElementToImage(node, { width: 850, filename: printFilename });
      await shareFileOrFallback(file, fallback);
    } catch {
      fallback();
    } finally {
      setPreparingPrint(false);
    }
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

  // In the installed iOS/Android app, a same-window (or even
  // target="_blank") click on a webcal:// link is unreliable — Capacitor's
  // WKWebView navigation delegate can end up trying to load the custom
  // scheme itself (it can't) instead of always handing it to the OS,
  // landing on ELF's offline screen instead of the native "Subscribe to
  // Calendar" flow. AppLauncher.openUrl() calls UIApplication.shared.open()
  // (iOS) / an equivalent Intent (Android) directly through the native
  // bridge — a deterministic API call, not dependent on WebKit's
  // click/new-window heuristics — so it's used explicitly whenever running
  // inside the native app. Plain browsers are untouched: they never enter
  // this branch, and keep the ordinary <a href="webcal://..."> behavior.
  const openAppleCalendar = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!Capacitor.isNativePlatform() || !status?.enabled) return;
    e.preventDefault();
    setOpen(false);
    void AppLauncher.openUrl({ url: status.webcalUrl });
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
            <MenuItem label={preparingPrint ? "Preparing…" : "Print Calendar"} onClick={handlePrint} disabled={preparingPrint} />
            <MenuItem label="Download Calendar (.ics)" onClick={handleDownload} />

            <SectionLabel>Calendar Sync</SectionLabel>
            <div style={{ padding: "0 .9rem .8rem" }}>
              {loadingStatus || status === null ? (
                <p style={syncNote}>Checking sync status…</p>
              ) : status.enabled ? (
                <>
                  <SyncButton label={copied ? "Copied!" : "Copy Subscription Link"} onClick={copyLink} />
                  {/* target="_blank"/rel stay as a plain-browser fallback
                      (harmless, matches the Google Calendar link below);
                      onClick={openAppleCalendar} is what actually matters
                      inside the native app — see that handler above for
                      why a plain webcal:// link can't be trusted to reach
                      the OS reliably from inside Capacitor's WebView. */}
                  <a href={status.webcalUrl} target="_blank" rel="noopener noreferrer" onClick={openAppleCalendar} style={linkButton}>Add to Apple Calendar</a>
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
