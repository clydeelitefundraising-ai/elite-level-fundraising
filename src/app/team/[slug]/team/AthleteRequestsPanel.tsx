"use client";

import { useEffect, useState } from "react";

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
    <div style={{
      background: "#fff", borderRadius: 12, padding: ".85rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      display: "flex", flexDirection: "column", gap: ".6rem",
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: ".92rem", color: "#111827" }}>{request.full_name}</div>
        <div style={{ fontSize: ".76rem", color: "#6b7280", marginTop: ".15rem" }}>
          {request.class_year}{request.event ? ` · ${request.event}` : ""} · Requested {timeAgo(request.created_at)}
        </div>
      </div>

      {request.possibleMatches.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: ".55rem .65rem" }}>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#92400e", marginBottom: ".3rem" }}>
            Suggested match{request.possibleMatches.length > 1 ? "es" : ""} — a convenience shortcut only, not automatic. Review before linking:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: ".2rem" }}>
            {request.possibleMatches.map(m => (
              <button
                key={m.athlete.id}
                type="button"
                onClick={() => setLinkAthleteId(m.athlete.id)}
                style={{
                  textAlign: "left", background: linkAthleteId === m.athlete.id ? "#fef3c7" : "transparent",
                  border: "none", borderRadius: 6, padding: ".2rem .35rem", cursor: "pointer",
                  fontSize: ".78rem", color: "#78350f",
                }}
              >
                {m.athlete.name}{m.athlete.class_year ? ` · ${m.athlete.class_year}` : ""} — click to select below
              </button>
            ))}
          </div>
        </div>
      )}

      {collision && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: ".55rem .65rem", fontSize: ".78rem", color: "#991b1b" }}>
          An athlete named &quot;{collision.existing.name}&quot; already exists on this team. Link to them instead, or override to create a new athlete anyway.
        </div>
      )}

      {error && (
        <div style={{ fontSize: ".78rem", color: "#dc2626" }}>{error}</div>
      )}

      {!showDecline ? (
        <div style={{ display: "flex", flexDirection: "column", gap: ".45rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <div style={{ fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Link to Existing Athlete
            </div>
            <input
              type="text"
              placeholder="Search full roster by name…"
              value={rosterSearch}
              onChange={e => setRosterSearch(e.target.value)}
              style={{ padding: ".4rem .5rem", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: ".78rem" }}
            />
            <div style={{ display: "flex", gap: ".4rem" }}>
              <select
                value={linkAthleteId}
                onChange={e => setLinkAthleteId(e.target.value)}
                style={{ flex: 1, padding: ".4rem .5rem", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: ".78rem" }}
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
                style={{ padding: ".4rem .7rem", borderRadius: 7, border: "1.5px solid #0b1e3d", background: "#fff", color: "#0b1e3d", fontWeight: 700, fontSize: ".76rem", cursor: busy || !linkAthleteId ? "not-allowed" : "pointer" }}
              >
                Link
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: ".4rem" }}>
            <button
              disabled={busy}
              onClick={() => act({ action: "approve", overrideCollision: collision != null })}
              style={{ flex: 1, padding: ".5rem", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".8rem", cursor: busy ? "not-allowed" : "pointer" }}
            >
              {collision ? "Create Anyway" : "Approve — Create New Athlete"}
            </button>
            <button
              disabled={busy}
              onClick={() => setShowDecline(true)}
              style={{ padding: ".5rem .8rem", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280", fontWeight: 700, fontSize: ".8rem", cursor: busy ? "not-allowed" : "pointer" }}
            >
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
            style={{ padding: ".45rem .6rem", borderRadius: 7, border: "1.5px solid #e5e7eb", fontSize: ".8rem" }}
          />
          <div style={{ display: "flex", gap: ".4rem" }}>
            <button
              disabled={busy}
              onClick={() => act({ action: "decline", declineReason })}
              style={{ flex: 1, padding: ".5rem", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: ".8rem", cursor: busy ? "not-allowed" : "pointer" }}
            >
              Confirm Decline
            </button>
            <button
              disabled={busy}
              onClick={() => setShowDecline(false)}
              style={{ padding: ".5rem .8rem", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280", fontWeight: 700, fontSize: ".8rem", cursor: busy ? "not-allowed" : "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Head-Coach-only — parent (TeamView.tsx) only renders this when
// isHeadCoach(actor) is true, and the underlying API independently
// enforces the same check server-side regardless of what renders here.
//
// rosterAthletes reuses the same roster data TeamView.tsx already fetched
// for the page (getTeamAthletes) — deliberately not a separate athlete
// directory fetch/endpoint, per instruction.
export default function AthleteRequestsPanel({
  slug, rosterAthletes,
}: {
  slug: string;
  rosterAthletes: RosterAthlete[];
}) {
  const [requests, setRequests] = useState<PendingRequest[] | null>(null);

  const load = () => {
    fetch(`/api/team/${slug}/athlete-requests`)
      .then(r => r.ok ? r.json() : { requests: [] })
      .then(d => setRequests(d.requests ?? []))
      .catch(() => setRequests([]));
  };

  useEffect(load, [slug]);

  if (!requests || requests.length === 0) return null;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".55rem" }}>
        <h3 style={{ margin: 0, fontSize: ".92rem", fontWeight: 800, color: "#0b1e3d" }}>
          Pending Athlete Requests
        </h3>
        <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, padding: ".12rem .48rem" }}>
          {requests.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
        {requests.map(r => (
          <RequestCard key={r.id} slug={slug} request={r} rosterAthletes={rosterAthletes} onActionComplete={() => load()} />
        ))}
      </div>
    </div>
  );
}
