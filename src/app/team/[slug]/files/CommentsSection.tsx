"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import Avatar from "../messages/_shared/Avatar";

type Comment = {
  id:               string;
  announcement_id:  string;
  body:             string;
  status:           "pending" | "approved" | "declined";
  created_at:       string;
  is_own:           boolean;
  author_name:      string;
  author_role:      string;
  author_photo_url: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coach", assistant_coach: "Asst. Coach", booster: "Booster",
  athlete: "Athlete", parent: "Parent",
};

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)    return "just now";
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

const MAX_LENGTH = 1000;
const COLLAPSED_COUNT = 2;

// Comments beneath a single announcement (Phase 3B-2). Visibility is
// already fully resolved server-side — GET returns exactly what this
// viewer may see (every approved comment + this viewer's own pending/
// declined ones), so this component just renders that list in order and
// never has to re-derive who can see what.
export default function CommentsSection({
  slug,
  announcementId,
  leadingSlot,
}: {
  slug: string;
  announcementId: string;
  // Rendered on the same row as the comment-count label — used by
  // UpdateCard to place LikeButton directly beside it, matching the
  // "👍 18   💬 4 Comments" layout (Phase 11b).
  leadingSlot?: React.ReactNode;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body,      setBody]    = useState("");
  const [sending,   setSending] = useState(false);
  const [error,     setError]   = useState("");
  const [expanded,  setExpanded] = useState(false);

  const load = () => {
    fetch(`/api/team/${slug}/announcements/${announcementId}/comments`)
      .then(r => r.ok ? r.json() : { comments: [] })
      .then(d => setComments(d.comments ?? []))
      .catch(() => setComments([]));
  };

  useEffect(load, [slug, announcementId]);

  const list          = comments ?? [];
  const approvedCount = list.filter(c => c.status === "approved").length;
  const visible        = expanded ? list : list.slice(-COLLAPSED_COUNT);
  const hiddenCount     = list.length - visible.length;

  const handleSubmit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/team/${slug}/announcements/${announcementId}/comments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ body: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "Failed to post comment. Please try again."); return; }
      setBody("");
      setExpanded(true);
      load();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const res = await fetch(`/api/team/${slug}/announcements/${announcementId}/comments/${id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  return (
    <div style={{ marginTop: ".55rem", paddingTop: ".55rem", borderTop: "1px solid var(--border-app)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", marginBottom: approvedCount > 0 || list.length > 0 ? ".5rem" : ".4rem" }}>
        {leadingSlot}
        <MessageCircle size={12} aria-hidden="true" style={{ color: "var(--text-muted-app)" }} />
        <span style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)" }}>
          {approvedCount > 0 ? `${approvedCount} comment${approvedCount !== 1 ? "s" : ""}` : "Comments"}
        </span>
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="elf-focus-ring"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: ".45rem", fontSize: ".72rem", fontWeight: 600, color: "var(--text-muted-app)" }}
        >
          View {hiddenCount} earlier comment{hiddenCount !== 1 ? "s" : ""}
        </button>
      )}

      {visible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", marginBottom: ".55rem" }}>
          {visible.map(c => (
            <div key={c.id} style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}>
              <Avatar name={c.author_name} photoUrl={c.author_photo_url} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: ".35rem", flexWrap: "wrap" }}>
                  <span style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text-primary-app)" }}>{c.author_name}</span>
                  {ROLE_LABELS[c.author_role] && (
                    <span style={{ fontSize: ".6rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".03em" }}>
                      {ROLE_LABELS[c.author_role]}
                    </span>
                  )}
                  <span style={{ fontSize: ".64rem", color: "var(--text-muted-app)" }}>{relativeTime(c.created_at)}</span>
                  {c.status === "pending" && (
                    <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#b45309", background: "#fef3c7", borderRadius: "var(--radius-full)", padding: ".05rem .4rem" }}>
                      Awaiting approval
                    </span>
                  )}
                  {c.status === "declined" && (
                    <span style={{ fontSize: ".6rem", fontWeight: 700, color: "var(--text-muted-app)", background: "var(--surface-light-elevated)", borderRadius: "var(--radius-full)", padding: ".05rem .4rem" }}>
                      Not approved
                    </span>
                  )}
                </div>
                <p style={{ margin: ".1rem 0 0", fontSize: ".8rem", color: "var(--text-muted-app)", lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                  {c.body}
                </p>
                {c.is_own && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="elf-focus-ring"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: ".15rem", fontSize: ".64rem", fontWeight: 600, color: "#dc2626" }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ fontSize: ".72rem", color: "#dc2626", marginBottom: ".4rem" }}>{error}</div>
      )}

      <div style={{ display: "flex", gap: ".4rem", alignItems: "flex-end" }}>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write a comment…"
          aria-label="Write a comment"
          maxLength={MAX_LENGTH}
          rows={1}
          style={{
            flex: 1, resize: "none", padding: ".5rem .65rem",
            borderRadius: "var(--radius-md)", border: "1.5px solid var(--border-app)",
            fontSize: "1rem", lineHeight: 1.4, color: "var(--text-primary-app)",
            fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={sending || !body.trim()}
          aria-label="Post comment"
          className="elf-focus-ring"
          style={{
            padding: ".5rem .8rem", borderRadius: "var(--radius-md)", border: "none",
            background: sending || !body.trim() ? "var(--surface-light-elevated)" : "var(--team-primary)",
            color: sending || !body.trim() ? "var(--text-muted-app)" : "var(--team-primary-foreground)",
            fontSize: ".78rem", fontWeight: 700,
            cursor: sending || !body.trim() ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          {sending ? "…" : "Post"}
        </button>
      </div>
    </div>
  );
}
