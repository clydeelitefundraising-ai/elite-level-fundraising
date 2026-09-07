"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import styles from "./Requests.module.css";

type PossibleMatch = {
  athlete: { id: string; name: string; event: string | null; class_year: string | null };
  similarity: number;
};

type PendingRequest = {
  id:              string;
  full_name:       string;
  class_year:      string;
  event:           string | null;
  created_at:      string;
  possibleMatches: PossibleMatch[];
};

type RosterAthlete = { id: string; name: string; event: string | null; class_year?: string | null };

type Collision = { existing: { id: string; name: string; class_year: string | null; event: string | null } };

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function RequestCard({
  slug, request, rosterAthletes, onActionComplete,
}: {
  slug: string;
  request: PendingRequest;
  rosterAthletes: RosterAthlete[];
  // Called after every attempt — success AND failure — so the list is
  // always refreshed against true server state. A failed approval may
  // still have changed server-side state (e.g. reverted a claim back to
  // pending); refreshing here means the UI never keeps showing a stale
  // pre-attempt snapshot. Safe to call unconditionally: React keeps this
  // card's own local error/collision state across the refresh since the
  // request's id (used as the list key) doesn't change.
  onActionComplete: () => void;
}) {
  const [linkAthleteId, setLinkAthleteId] = useState("");
  const [rosterSearch, setRosterSearch]   = useState("");
  const [busy, setBusy]                   = useState(false);
  const [error, setError]                 = useState("");
  const [collision, setCollision]         = useState<Collision | null>(null);
  const [showDecline, setShowDecline]     = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const filteredRoster = rosterSearch.trim()
    ? rosterAthletes.filter(a => a.name.toLowerCase().includes(rosterSearch.trim().toLowerCase()))
    : rosterAthletes;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setCollision(null);
    try {
      const res = await fetch(`/api/team/${slug}/athlete-requests/${request.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.collision) { setCollision(data.collision); return; }
        setError(data.error ?? "Action failed.");
        return;
      }
    } catch {
      setError("Network error. Please try again.");
      return;
    } finally {
      setBusy(false);
      // Always refresh — see onActionComplete's doc comment above.
      onActionComplete();
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowTop}>
        <div className={styles.avatarFallback}>{initials(request.full_name)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className={styles.rowName}>{request.full_name}</div>
          <div className={styles.rowMeta}>
            {request.class_year}{request.event ? ` · ${request.event}` : ""} · Requested {timeAgo(request.created_at)}
          </div>
        </div>
      </div>

      {request.possibleMatches.length > 0 && (
        <div className={styles.matchBox}>
          <div className={styles.matchLabel}>
            Suggested match{request.possibleMatches.length > 1 ? "es" : ""} — a convenience shortcut only, not automatic. Review before linking:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".2rem" }}>
            {request.possibleMatches.map(m => (
              <button
                key={m.athlete.id}
                type="button"
                onClick={() => setLinkAthleteId(m.athlete.id)}
                className={`${styles.matchButton} ${linkAthleteId === m.athlete.id ? styles.matchButtonActive : ""}`}
              >
                {m.athlete.name}{m.athlete.class_year ? ` · ${m.athlete.class_year}` : ""} — click to select below
              </button>
            ))}
          </div>
        </div>
      )}

      {collision && (
        <div className={styles.collisionBox}>
          An athlete named &quot;{collision.existing.name}&quot; already exists on this team. Link to them instead, or override to create a new athlete anyway.
        </div>
      )}

      {error && <div className={styles.errorText}>{error}</div>}

      {!showDecline ? (
        <div style={{ display: "flex", flexDirection: "column", gap: ".45rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <div className={styles.fieldLabel}>Link to Existing Athlete</div>
            <input
              type="text"
              placeholder="Search full roster by name…"
              value={rosterSearch}
              onChange={e => setRosterSearch(e.target.value)}
              className={styles.input}
            />
            <div style={{ display: "flex", gap: ".4rem" }}>
              <select
                value={linkAthleteId}
                onChange={e => setLinkAthleteId(e.target.value)}
                className={styles.select}
                style={{ flex: 1 }}
              >
                <option value="">
                  {rosterAthletes.length === 0 ? "— No athletes on this roster yet —" : "— Choose an athlete —"}
                </option>
                {filteredRoster.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.class_year ? ` · ${a.class_year}` : ""}{a.event ? ` · ${a.event}` : ""}
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !linkAthleteId}
                onClick={() => act({ action: "approve", linkAthleteId })}
                className={styles.linkBtn}
              >
                Link
              </button>
            </div>
          </div>
          <div className={styles.actionsRow}>
            <button
              disabled={busy}
              onClick={() => act({ action: "approve", overrideCollision: collision != null })}
              className={styles.approveBtn}
            >
              <Check size={14} strokeWidth={2.5} />
              {collision ? "Create Anyway" : "Approve — Create New Athlete"}
            </button>
            <button
              disabled={busy}
              onClick={() => setShowDecline(true)}
              className={styles.declineBtn}
            >
              <X size={14} strokeWidth={2.5} />
              Decline
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".45rem" }}>
          <input
            type="text"
            placeholder="Reason (optional)"
            value={declineReason}
            onChange={e => setDeclineReason(e.target.value)}
            className={styles.declineInput}
          />
          <div className={styles.actionsRow}>
            <button
              disabled={busy}
              onClick={() => act({ action: "decline", declineReason })}
              className={styles.confirmDeclineBtn}
            >
              <X size={14} strokeWidth={2.5} />
              Confirm Decline
            </button>
            <button
              disabled={busy}
              onClick={() => setShowDecline(false)}
              className={styles.cancelBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Head-Coach-only — the parent page only renders this when isHeadCoach(actor)
// is true, and the underlying API independently enforces the same check
// server-side regardless of what renders here (see athlete-requests/route.ts).
//
// rosterAthletes reuses the same roster data the parent page already
// fetched (getTeamAthletes) — deliberately not a separate athlete
// directory fetch/endpoint, per instruction.
//
// onCountChange/emptyState (Phase 3B-1): this panel now lives inside the
// Requests Center, which needs a live section-level count and an explicit
// "nothing pending" message rather than rendering nothing — both optional
// so this component's own default behavior (render nothing when
// requests.length === 0, no count reporting) is unchanged for any other
// caller. onCountChange mirrors the existing onUnreadChange lifted-callback
// pattern already used by MessagesView/CommunicationsView — no new
// event/global-state architecture introduced.
export default function AthleteRequestsPanel({
  slug, rosterAthletes, onCountChange, emptyState, hideHeader,
}: {
  slug: string;
  rosterAthletes: RosterAthlete[];
  onCountChange?: (count: number) => void;
  emptyState?: React.ReactNode;
  // The Requests Center's <RequestSection> already renders a category
  // header (title + count) around this panel — hideHeader avoids a
  // duplicate "Pending Athlete Requests N" row when used there. Defaults
  // to false so this component stays fully self-contained for any other
  // caller.
  hideHeader?: boolean;
}) {
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);

  const load = () => {
    fetch(`/api/team/${slug}/athlete-requests`)
      .then(r => r.ok ? r.json() : { requests: [] })
      .then(d => {
        const list: PendingRequest[] = d.requests ?? [];
        setRequests(list);
        onCountChange?.(list.length);
      })
      .catch(() => setRequests([]));
  };

  // onCountChange is excluded from deps deliberately: every current caller
  // passes a useState setter (RequestsView's setAthleteRequestCount), whose
  // identity React guarantees is stable across renders, so this can never
  // cause a stale closure here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [slug]);

  if (!requests || requests.length === 0) {
    return requests !== null && emptyState !== undefined ? <>{emptyState}</> : null;
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      {!hideHeader && (
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Pending Athlete Requests</h3>
          <span className={styles.sectionBadge}>{requests.length}</span>
        </div>
      )}
      <div className={styles.rowList}>
        {requests.map(r => (
          <RequestCard key={r.id} slug={slug} request={r} rosterAthletes={rosterAthletes} onActionComplete={() => load()} />
        ))}
      </div>
    </div>
  );
}
