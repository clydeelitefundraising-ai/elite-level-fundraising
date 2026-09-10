"use client";

import { useEffect, useState } from "react";

type PendingParentAccessRequest = {
  id:           string;
  parent_name:  string;
  athlete_name: string;
  created_at:   string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function RequestCard({
  slug, request, onActionComplete,
}: {
  slug: string;
  request: PendingParentAccessRequest;
  onActionComplete: () => void;
}) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  async function act(action: "approve" | "decline") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/parent-access-requests/${request.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "Action failed. Please try again."); return; }
    } catch {
      setError("Network error. Please check your connection and try again.");
      return;
    } finally {
      setBusy(false);
      onActionComplete();
    }
  }

  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: ".85rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      display: "flex", flexDirection: "column", gap: ".55rem",
    }}>
      <div>
        <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: ".2rem" }}>
          Parent Access Request · {timeAgo(request.created_at)}
        </div>
        <div style={{ fontWeight: 800, fontSize: ".92rem", color: "#111827" }}>{request.parent_name}</div>
        <div style={{ fontSize: ".82rem", color: "#6b7280", marginTop: ".1rem" }}>
          Requesting access as parent of <strong style={{ color: "#374151" }}>{request.athlete_name}</strong>
        </div>
      </div>

      {error && <div style={{ fontSize: ".78rem", color: "#dc2626" }}>{error}</div>}

      <div style={{ display: "flex", gap: ".4rem" }}>
        <button
          disabled={busy}
          onClick={() => act("approve")}
          style={{ flex: 1, padding: ".5rem", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontWeight: 700, fontSize: ".8rem", cursor: busy ? "not-allowed" : "pointer" }}
        >
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => act("decline")}
          style={{ padding: ".5rem .9rem", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#fff", color: "#6b7280", fontWeight: 700, fontSize: ".8rem", cursor: busy ? "not-allowed" : "pointer" }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

// Mirrors CommentApprovalsPanel.tsx's shape exactly (own data fetch,
// onCountChange lifted-callback, emptyState/hideHeader for the Requests
// Center wrapper) — same pattern, new category, per Phase 3B-1's
// established extension point.
export default function ParentAccessRequestsPanel({
  slug, onCountChange, emptyState, hideHeader,
}: {
  slug: string;
  onCountChange?: (count: number) => void;
  emptyState?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const [requests, setRequests] = useState<PendingParentAccessRequest[] | null>(null);

  const load = () => {
    fetch(`/api/team/${slug}/parent-access-requests`)
      .then(r => r.ok ? r.json() : { requests: [] })
      .then(d => {
        const list: PendingParentAccessRequest[] = d.requests ?? [];
        setRequests(list);
        onCountChange?.(list.length);
      })
      .catch(() => setRequests([]));
  };

  // onCountChange excluded from deps deliberately — see
  // AthleteRequestsPanel.tsx's identical effect for the full rationale
  // (every current caller passes a stable useState setter).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [slug]);

  if (!requests || requests.length === 0) {
    return requests !== null && emptyState !== undefined ? <>{emptyState}</> : null;
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      {!hideHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".55rem" }}>
          <h3 style={{ margin: 0, fontSize: ".92rem", fontWeight: 800, color: "#0b1e3d" }}>
            Parent Access Requests
          </h3>
          <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, padding: ".12rem .48rem" }}>
            {requests.length}
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
        {requests.map(r => (
          <RequestCard key={r.id} slug={slug} request={r} onActionComplete={() => load()} />
        ))}
      </div>
    </div>
  );
}
