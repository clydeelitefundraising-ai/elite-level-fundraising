"use client";

import { useEffect, useState } from "react";
import {
  PUBLIC_PHOTO_CONFIRMATION_TEXT, PUBLIC_PHOTO_SETTING_DESCRIPTION, PUBLIC_PHOTO_SETTING_TITLE,
} from "@/lib/publicAthletePhotos";

type RosterRow = { id: string; name: string; has_photo: boolean; excluded: boolean; inherited?: boolean };
type State = {
  enabled: boolean;
  available: boolean;
  changed_at: string | null;
  changed_by: string | null;
  confirmation_version: string;
  athletes: RosterRow[];
};

const errorBox = { margin: ".65rem 0 0", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "var(--color-error)", fontSize: ".78rem" } as const;

/** Case-insensitive name match; an empty query shows everyone, in roster order. */
export function filterAthletesByName<T extends { name: string }>(athletes: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return athletes;
  return athletes.filter(a => a.name.toLowerCase().includes(q));
}

function changedLine(s: State): string | null {
  if (!s.changed_at || !s.changed_by) return null;
  const when = new Date(s.changed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s.enabled ? "Turned on" : "Turned off"} by ${s.changed_by} on ${when}.`;
}

// Phase T7 — Head-Coach-only Team Settings section: whether athletes' ELF
// Team App profile photos may appear on this team's public fundraising
// pages. Off by default; turning it on requires the media-permission
// confirmation below (re-checked server-side). While on, the Head Coach can
// hide any individual athlete. Same card/switch styling as
// CoachFundraisingSection.tsx.
export default function PublicAthletePhotosSection({ slug }: { slug: string }) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  // Settings Redesign: search the already-loaded roster by name. A pure
  // display filter — it never changes which athletes are saved or hidden.
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${slug}/settings/public-athlete-photos`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) { setLoadError(data.error ?? "Failed to load this setting."); return; }
        setState(data as State);
      })
      .catch(() => { if (!cancelled) setLoadError("Failed to load this setting."); });
    return () => { cancelled = true; };
  }, [slug]);

  async function save(enabled: boolean) {
    if (!state) return;
    setError("");
    setWorking(true);
    try {
      const res = await fetch(`/api/team/${slug}/settings/public-athlete-photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enabled ? { enabled, confirm: true, confirmation_version: state.confirmation_version } : { enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Failed to save this setting."); return; }
      // Athletes hidden in an earlier season start hidden again (server-side,
      // before photos turned on) — reflect that in the list.
      const carried = new Set<string>(Array.isArray(data.carried_over) ? data.carried_over : []);
      setState({
        ...state, enabled: data.enabled, changed_at: data.changed_at, changed_by: data.changed_by,
        athletes: state.athletes.map(a => (carried.has(a.id) ? { ...a, excluded: true, inherited: true } : a)),
      });
      setConfirming(false);
      setAgreed(false);
    } catch {
      setError("Failed to save this setting.");
    } finally {
      setWorking(false);
    }
  }

  async function setExcluded(row: RosterRow, excluded: boolean) {
    if (!state) return;
    setError("");
    setSavingId(row.id);
    try {
      const res = await fetch(`/api/team/${slug}/settings/public-athlete-photos/athletes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ athlete_id: row.id, excluded }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Failed to save."); return; }
      setState({ ...state, athletes: state.athletes.map(a => (a.id === row.id ? { ...a, excluded } : a)) });
    } catch {
      setError("Failed to save.");
    } finally {
      setSavingId(null);
    }
  }

  const on = state?.enabled ?? false;
  const line = state ? changedLine(state) : null;
  const visible = state ? filterAthletesByName(state.athletes, query) : [];
  const hiddenCount = state ? state.athletes.filter(a => a.excluded).length : 0;

  return (
    <div style={{ background: "var(--surface-light)", borderRadius: "var(--radius-lg)", padding: "1rem", border: "1px solid var(--border-app)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ flex: 1 }}>
          <p id="public-photos-title" style={{ margin: "0 0 .3rem", fontSize: ".82rem", fontWeight: 700, color: "var(--text-primary-app)" }}>
            {PUBLIC_PHOTO_SETTING_TITLE}
          </p>
          <p style={{ margin: 0, fontSize: ".78rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>
            {PUBLIC_PHOTO_SETTING_DESCRIPTION}
          </p>
          {line && <p style={{ margin: ".4rem 0 0", fontSize: ".72rem", color: "var(--text-muted-app)" }}>{line}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="public-photos-title"
          disabled={!state || !state.available || working || confirming}
          onClick={() => { if (on) void save(false); else { setConfirming(true); setError(""); } }}
          style={{
            flexShrink: 0, width: 44, height: 26, borderRadius: 100, border: "none", padding: 0, position: "relative",
            background: on ? "var(--team-primary)" : "var(--border-app)",
            cursor: !state || !state.available || working ? "not-allowed" : "pointer",
          }}
        >
          <span style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .15s ease", boxShadow: "0 1px 3px rgba(0,0,0,.25)" }} />
        </button>
      </div>

      {loadError && <p role="alert" style={errorBox}>{loadError}</p>}
      {state && !state.available && (
        <p style={{ margin: ".65rem 0 0", fontSize: ".78rem", color: "var(--text-muted-app)" }}>This setting isn&apos;t available yet.</p>
      )}

      {confirming && !on && (
        <div role="group" aria-label="Confirm media permissions" style={{ marginTop: ".85rem", padding: ".85rem", borderRadius: 10, background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)" }}>
          <label style={{ display: "flex", gap: ".6rem", alignItems: "flex-start", fontSize: ".8rem", lineHeight: 1.5, color: "var(--text-primary-app)", cursor: "pointer" }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ width: 18, height: 18, marginTop: ".1rem", flexShrink: 0, accentColor: "var(--team-primary)" }} />
            <span>{PUBLIC_PHOTO_CONFIRMATION_TEXT}</span>
          </label>
          <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", marginTop: ".75rem", flexWrap: "wrap" }}>
            <button type="button" className="elf-focus-ring" onClick={() => { setConfirming(false); setAgreed(false); }} disabled={working}
              style={{ padding: ".5rem .9rem", borderRadius: 8, border: "1px solid var(--border-app)", background: "#fff", fontWeight: 700, fontSize: ".8rem", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" className="elf-focus-ring" onClick={() => void save(true)} disabled={!agreed || working}
              style={{ padding: ".5rem .9rem", borderRadius: 8, border: "none", background: agreed ? "var(--team-primary)" : "var(--border-app)", color: "#fff", fontWeight: 700, fontSize: ".8rem", cursor: agreed && !working ? "pointer" : "not-allowed" }}>
              {working ? "Saving…" : "Turn on public photos"}
            </button>
          </div>
        </div>
      )}

      {error && <p role="alert" style={errorBox}>{error}</p>}

      {on && state && (
        <div style={{ marginTop: "1rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: ".35rem" }}>
            Athletes
          </div>
          <p style={{ margin: "0 0 .6rem", fontSize: ".75rem", color: "var(--text-secondary-app)", lineHeight: 1.5 }}>
            Uncheck any athlete whose photo may not be published — their fundraising page shows your team logo instead.
          </p>
          {state.athletes.length > 0 && (
            <div style={{ marginBottom: ".6rem" }}>
              <label htmlFor="public-photos-search" style={{ display: "block", fontSize: ".72rem", fontWeight: 700, color: "var(--text-secondary-app)", marginBottom: ".25rem" }}>
                Search athletes
              </label>
              <input
                id="public-photos-search"
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Type a name"
                autoComplete="off"
                style={{ width: "100%", boxSizing: "border-box", minHeight: 40, padding: ".5rem .7rem", borderRadius: 9, border: "1.5px solid var(--border-app)", background: "var(--surface-light)", fontSize: ".85rem", color: "var(--text-primary-app)" }}
              />
              <p aria-live="polite" data-testid="public-photos-count" style={{ margin: ".35rem 0 0", fontSize: ".72rem", color: "var(--text-muted-app)" }}>
                {query.trim()
                  ? `Showing ${visible.length} of ${state.athletes.length} athletes`
                  : `${state.athletes.length} athletes · ${hiddenCount} hidden`}
              </p>
            </div>
          )}
          {state.athletes.length === 0 ? (
            <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-muted-app)" }}>No athletes on the roster yet.</p>
          ) : visible.length === 0 ? (
            <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-muted-app)" }}>No athletes match &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: ".4rem" }}>
              {visible.map(a => (
                <li key={a.id}>
                  <label style={{ display: "flex", alignItems: "center", gap: ".7rem", padding: ".55rem .8rem", borderRadius: 9, background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)", opacity: savingId === a.id ? .7 : 1, cursor: "pointer" }}>
                    <input type="checkbox" checked={!a.excluded} disabled={savingId === a.id} onChange={e => void setExcluded(a, !e.target.checked)}
                      aria-label={`Show ${a.name}'s photo publicly`} style={{ width: 16, height: 16, flexShrink: 0, accentColor: "var(--team-primary)" }} />
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: ".85rem", color: "var(--text-primary-app)", overflowWrap: "anywhere" }}>{a.name}</span>
                    <span style={{ flexShrink: 0, fontSize: ".72rem", color: "var(--text-muted-app)" }}>
                      {a.excluded ? (a.inherited ? "Hidden · carried over from last season" : "Hidden") : a.has_photo ? "Photo shown" : "No photo yet"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
