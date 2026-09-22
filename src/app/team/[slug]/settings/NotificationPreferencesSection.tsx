"use client";

import { useEffect, useRef, useState } from "react";
import { parsePreferencesResponse, toggledPreferences, type Preferences, type PushCategory } from "@/lib/notificationPreferences";

const CATEGORIES: { key: PushCategory; label: string; description: string }[] = [
  { key: "team_updates", label: "Team Updates", description: "Announcements and file uploads from your coach" },
  { key: "messages", label: "Messages", description: "Direct messages from coaches, staff and teammates" },
  { key: "calendar", label: "Calendar", description: "New and updated practices, games and events" },
  { key: "requests", label: "Requests", description: "Team join requests and approvals" },
];

type RowState = { saving: boolean; error: boolean };
const IDLE_ROW_STATE: RowState = { saving: false, error: false };

// Phase 2E: exposes the existing account-level push_preferences categories
// (already enforced server-side by both the APNs and FCM senders — see
// isCategoryEnabled() in src/lib/apns.ts / src/lib/fcm.ts) through the
// existing GET/PATCH /api/push/preferences endpoints. No new endpoint, no
// schema change, no direct Supabase access from the client.
//
// Distinct from PushOptIn.tsx (the bell icon in the header): that controls
// an unrelated feature, web-push (VAPID) subscription. These four toggles
// instead control which categories of native app push notifications (iOS
// APNs / Android FCM) the signed-in account receives, on every device where
// they're signed in — not scoped to one team or one platform.
//
// Every PATCH sends the complete four-category object, not just the changed
// key: updatePushPreferences() (src/lib/pushDevices.ts) upserts by spreading
// its own all-true defaults underneath whatever the caller passes, so a
// partial {category: value} body would silently reset every other category
// back to true. Always sending the full known state sidesteps that without
// touching the shared sender/preferences library code.
export default function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [rowState, setRowState] = useState<Record<PushCategory, RowState>>({
    team_updates: IDLE_ROW_STATE,
    messages: IDLE_ROW_STATE,
    calendar: IDLE_ROW_STATE,
    requests: IDLE_ROW_STATE,
  });

  // Per-category request counter: only the response matching the latest
  // request for that category may update saving/error state, so a slow
  // earlier response can never clobber a faster later one (rapid toggling,
  // out-of-order network responses).
  const seqRef = useRef<Record<PushCategory, number>>({ team_updates: 0, messages: 0, calendar: 0, requests: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/push/preferences");
        if (!res.ok) throw new Error("load failed");
        const json = await res.json();
        if (cancelled) return;
        setPrefs(parsePreferencesResponse(json));
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleToggle(key: PushCategory) {
    if (!prefs) return;
    const nextPrefs = toggledPreferences(prefs, key);
    const nextValue = nextPrefs[key];
    const mySeq = ++seqRef.current[key];

    setPrefs(nextPrefs); // optimistic — instant feedback
    setRowState(s => ({ ...s, [key]: { saving: true, error: false } }));

    try {
      const res = await fetch("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPrefs), // full state — see file header
      });
      if (mySeq !== seqRef.current[key]) return; // superseded by a newer toggle of this same category
      if (!res.ok) throw new Error("save failed");
      setRowState(s => ({ ...s, [key]: IDLE_ROW_STATE }));
    } catch {
      if (mySeq !== seqRef.current[key]) return; // superseded — let the newer request own the row's UI
      setPrefs(prev => (prev ? { ...prev, [key]: !nextValue } : prev)); // revert the optimistic flip
      setRowState(s => ({ ...s, [key]: { saving: false, error: true } }));
    }
  }

  return (
    <>
      <div style={{ marginBottom: ".4rem", marginTop: "1.25rem" }}>
        <span style={{ fontSize: ".65rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".09em" }}>
          Notification Preferences
        </span>
      </div>
      <p style={{ fontSize: ".78rem", color: "var(--text-muted-app)", margin: "0 0 .6rem", lineHeight: 1.45 }}>
        Choose which team notifications you receive on this account, on every device where you&rsquo;re signed in.
      </p>
      <div style={{
        background: "var(--surface-light)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-app)",
        overflow: "hidden",
      }}>
        {loadError && (
          <div style={{ padding: ".75rem .9rem", fontSize: ".8rem", color: "var(--color-error)" }}>
            Couldn&rsquo;t load notification preferences.
          </div>
        )}
        {!loadError && !prefs && (
          <div style={{ padding: ".75rem .9rem", fontSize: ".8rem", color: "var(--text-muted-app)" }}>
            Loading…
          </div>
        )}
        {prefs && CATEGORIES.map(({ key, label, description }, i) => (
          <div key={key}>
            {i > 0 && <div style={{ borderTop: "1px solid var(--border-app)" }} />}
            <div style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: ".84rem", color: "var(--text-primary-app)" }}>{label}</div>
                <div style={{ fontSize: ".72rem", color: "var(--text-muted-app)", marginTop: 1 }}>{description}</div>
                {rowState[key].error && (
                  <div style={{ fontSize: ".72rem", color: "var(--color-error)", marginTop: 2 }}>
                    Couldn&rsquo;t save — try again.
                  </div>
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                aria-label={label}
                disabled={rowState[key].saving}
                onClick={() => handleToggle(key)}
                className="elf-focus-ring"
                style={{
                  width: 42,
                  height: 24,
                  borderRadius: 12,
                  flexShrink: 0,
                  border: "none",
                  cursor: rowState[key].saving ? "default" : "pointer",
                  background: prefs[key] ? "#0b1e3d" : "var(--border-app)",
                  opacity: rowState[key].saving ? 0.6 : 1,
                  position: "relative",
                  transition: "background .15s ease",
                }}
              >
                <span style={{
                  position: "absolute",
                  top: 2,
                  left: prefs[key] ? 20 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left .15s ease",
                }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: ".6rem",
  padding: ".75rem .9rem",
};
