"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import Avatar from "../messages/_shared/Avatar";
import styles from "./Requests.module.css";

type PendingCommentApproval = {
  id:                  string;
  announcement_id:     string;
  announcement_title:  string;
  body:                string;
  created_at:          string;
  author_name:         string;
  author_role:         string;
  author_photo_url:    string | null;
};

const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coach", assistant_coach: "Asst. Coach", booster: "Booster",
  athlete: "Athlete", parent: "Parent",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ApprovalCard({
  slug, approval, onActionComplete,
}: {
  slug: string;
  approval: PendingCommentApproval;
  onActionComplete: () => void;
}) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  async function act(action: "approve" | "decline") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/comment-approvals/${approval.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Action failed."); return; }
    } catch {
      setError("Network error. Please try again.");
      return;
    } finally {
      setBusy(false);
      onActionComplete();
    }
  }

  return (
    <div className={styles.row}>
      <div className={styles.rowTop}>
        <Avatar name={approval.author_name} photoUrl={approval.author_photo_url} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.rowMeta} style={{ marginTop: 0 }}>
            <span className={styles.rowName}>{approval.author_name}</span>
            {ROLE_LABELS[approval.author_role] && (
              <span className={styles.roleLabel}>{ROLE_LABELS[approval.author_role]}</span>
            )}
            <span style={{ fontSize: ".64rem", color: "var(--text-muted-app)" }}>· {timeAgo(approval.created_at)}</span>
          </div>
          <div className={styles.contextLine}>
            On &ldquo;{approval.announcement_title}&rdquo;
          </div>
        </div>
      </div>

      <p className={styles.commentBody}>{approval.body}</p>

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

// Mirrors AthleteRequestsPanel.tsx's shape exactly (own data fetch,
// onCountChange lifted-callback, emptyState/hideHeader for the Requests
// Center wrapper) — same pattern, new category, per Phase 3B-1's
// established extension point.
export default function CommentApprovalsPanel({
  slug, onCountChange, emptyState, hideHeader,
}: {
  slug: string;
  onCountChange?: (count: number) => void;
  emptyState?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const [approvals, setApprovals] = useState<PendingCommentApproval[] | null>(null);

  const load = () => {
    fetch(`/api/team/${slug}/comment-approvals`)
      .then(r => r.ok ? r.json() : { approvals: [] })
      .then(d => {
        const list: PendingCommentApproval[] = d.approvals ?? [];
        setApprovals(list);
        onCountChange?.(list.length);
      })
      .catch(() => setApprovals([]));
  };

  // onCountChange excluded from deps deliberately — see
  // AthleteRequestsPanel.tsx's identical effect for the full rationale
  // (every current caller passes a stable useState setter).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [slug]);

  if (!approvals || approvals.length === 0) {
    return approvals !== null && emptyState !== undefined ? <>{emptyState}</> : null;
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      {!hideHeader && (
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Comment Approvals</h3>
          <span className={styles.sectionBadge}>{approvals.length}</span>
        </div>
      )}
      <div className={styles.rowList}>
        {approvals.map(a => (
          <ApprovalCard key={a.id} slug={slug} approval={a} onActionComplete={() => load()} />
        ))}
      </div>
    </div>
  );
}
