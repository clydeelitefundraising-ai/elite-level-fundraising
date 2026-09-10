"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import styles from "./Requests.module.css";

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
    <div className={styles.row}>
      <div className={styles.rowTop}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.rowMeta} style={{ marginTop: 0 }}>
            <span className={styles.rowName}>{request.parent_name}</span>
            <span style={{ fontSize: ".64rem", color: "var(--text-muted-app)" }}>· {timeAgo(request.created_at)}</span>
          </div>
          <div className={styles.contextLine}>
            Requesting access as parent of <strong>{request.athlete_name}</strong>
          </div>
        </div>
      </div>

      {error && <div className={styles.errorText}>{error}</div>}

      <div className={styles.actionsRow}>
        <button disabled={busy} onClick={() => act("approve")} className={styles.approveBtn}>
          <Check size={14} strokeWidth={2.5} />
          Approve
        </button>
        <button disabled={busy} onClick={() => act("decline")} className={styles.declineBtn}>
          <X size={14} strokeWidth={2.5} />
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
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Parent Access Requests</h3>
          <span className={styles.sectionBadge}>{requests.length}</span>
        </div>
      )}
      <div className={styles.rowList}>
        {requests.map(r => (
          <RequestCard key={r.id} slug={slug} request={r} onActionComplete={() => load()} />
        ))}
      </div>
    </div>
  );
}
