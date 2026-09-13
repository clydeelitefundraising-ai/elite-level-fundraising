"use client";

import { useEffect, useState } from "react";
import styles from "./Requests.module.css";

type ContentReport = {
  id:               string;
  target_type:      "announcement" | "comment" | "message" | "attachment" | "user";
  target_id:        string;
  reporter_name:    string;
  reason:           string;
  details:          string | null;
  status:           "open" | "reviewing" | "actioned" | "dismissed";
  created_at:       string;
};

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment", inappropriate_content: "Inappropriate content",
  spam: "Spam", safety_concern: "Safety concern", impersonation: "Impersonation", other: "Other",
};
const TARGET_LABELS: Record<string, string> = {
  announcement: "Announcement", comment: "Comment", message: "Message", attachment: "Attachment", user: "User",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ReportCard({ slug, report, onActionComplete }: { slug: string; report: ContentReport; onActionComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function act(status: "actioned" | "dismissed") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolutionNote: note.trim() || undefined }),
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
            <span className={styles.rowName}>{TARGET_LABELS[report.target_type]} reported</span>
            <span className={styles.roleLabel}>{REASON_LABELS[report.reason] ?? report.reason}</span>
            <span style={{ fontSize: ".64rem", color: "var(--text-muted-app)" }}>· {timeAgo(report.created_at)}</span>
          </div>
          <div className={styles.contextLine}>Reported by {report.reporter_name}</div>
        </div>
      </div>

      {report.details && <p className={styles.commentBody}>{report.details}</p>}

      {error && <div className={styles.errorText}>{error}</div>}

      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Resolution note (optional)…"
        rows={2}
        style={{ width: "100%", boxSizing: "border-box", marginTop: ".4rem", padding: ".4rem .55rem", borderRadius: 6, border: "1px solid var(--border-app)", fontSize: ".78rem", fontFamily: "inherit", resize: "vertical" }}
      />

      <div className={styles.actionsRow}>
        <button disabled={busy} onClick={() => act("actioned")} className={styles.approveBtn}>
          Mark Actioned
        </button>
        <button disabled={busy} onClick={() => act("dismissed")} className={styles.declineBtn}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Same shape as CommentApprovalsPanel.tsx (own data fetch, lifted
// onCountChange callback, emptyState/hideHeader for the Requests Center
// wrapper) — new category added the same way Comment Approvals was.
export default function ReportsPanel({
  slug, onCountChange, emptyState, hideHeader,
}: {
  slug: string;
  onCountChange?: (count: number) => void;
  emptyState?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const [reports, setReports] = useState<ContentReport[] | null>(null);

  const load = () => {
    fetch(`/api/team/${slug}/reports`)
      .then(r => r.ok ? r.json() : { reports: [] })
      .then(d => {
        const list: ContentReport[] = (d.reports ?? []).filter((r: ContentReport) => r.status === "open" || r.status === "reviewing");
        setReports(list);
        onCountChange?.(list.length);
      })
      .catch(() => setReports([]));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [slug]);

  if (!reports || reports.length === 0) {
    return reports !== null && emptyState !== undefined ? <>{emptyState}</> : null;
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      {!hideHeader && (
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Reports</h3>
          <span className={styles.sectionBadge}>{reports.length}</span>
        </div>
      )}
      <div className={styles.rowList}>
        {reports.map(r => (
          <ReportCard key={r.id} slug={slug} report={r} onActionComplete={() => load()} />
        ))}
      </div>
    </div>
  );
}
