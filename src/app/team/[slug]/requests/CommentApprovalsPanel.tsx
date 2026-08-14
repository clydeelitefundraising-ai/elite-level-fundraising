"use client";

import { useEffect, useState } from "react";
import Avatar from "../messages/_shared/Avatar";

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
    <div style={{
      background: "#fff", borderRadius: 12, padding: ".85rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      display: "flex", flexDirection: "column", gap: ".55rem",
    }}>
      <div style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}>
        <Avatar name={approval.author_name} photoUrl={approval.author_photo_url} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: ".35rem", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: ".84rem", color: "#111827" }}>{approval.author_name}</span>
            {ROLE_LABELS[approval.author_role] && (
              <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".03em" }}>
                {ROLE_LABELS[approval.author_role]}
              </span>
            )}
            <span style={{ fontSize: ".64rem", color: "#9ca3af" }}>· {timeAgo(approval.created_at)}</span>
          </div>
          <div style={{ fontSize: ".7rem", color: "#9ca3af", marginTop: ".05rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            On &ldquo;{approval.announcement_title}&rdquo;
          </div>
        </div>
      </div>

      <p style={{
        margin: 0, fontSize: ".82rem", color: "#374151", lineHeight: 1.55,
        background: "#f8f9fb", borderRadius: 8, padding: ".55rem .65rem",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {approval.body}
      </p>

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
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".55rem" }}>
          <h3 style={{ margin: 0, fontSize: ".92rem", fontWeight: 800, color: "#0b1e3d" }}>
            Comment Approvals
          </h3>
          <span style={{ background: "#fee2e2", color: "#b91c1c", borderRadius: 100, fontSize: ".62rem", fontWeight: 700, padding: ".12rem .48rem" }}>
            {approvals.length}
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: ".55rem" }}>
        {approvals.map(a => (
          <ApprovalCard key={a.id} slug={slug} approval={a} onActionComplete={() => load()} />
        ))}
      </div>
    </div>
  );
}
