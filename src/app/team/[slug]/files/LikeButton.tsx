"use client";

import { useEffect, useState } from "react";

// Post Likes (Phase 11b) — optimistic tap-to-toggle, one like per account
// per post, no moderation (unlike comments). Reads/writes go through
// GET/POST /api/team/[slug]/announcements/[id]/like, which resolves the
// viewer's ActorKey server-side the same way comments does — this
// component never sends who's liking, only which post.
export default function LikeButton({
  slug,
  announcementId,
  primaryColor = "#0b1e3d",
}: {
  slug: string;
  announcementId: string;
  primaryColor?: string;
}) {
  const [status, setStatus] = useState<{ count: number; liked_by_me: boolean } | null>(null);
  const [busy,   setBusy]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team/${slug}/announcements/${announcementId}/like`)
      .then(r => r.ok ? r.json() : { count: 0, liked_by_me: false })
      .then(d => { if (!cancelled) setStatus(d); })
      .catch(() => { if (!cancelled) setStatus({ count: 0, liked_by_me: false }); });
    return () => { cancelled = true; };
  }, [slug, announcementId]);

  const handleToggle = async () => {
    if (!status || busy) return;
    setBusy(true);
    // Optimistic update — rolled back on failure below.
    const prev = status;
    const optimistic = {
      count: prev.liked_by_me ? prev.count - 1 : prev.count + 1,
      liked_by_me: !prev.liked_by_me,
    };
    setStatus(optimistic);
    try {
      const res = await fetch(`/api/team/${slug}/announcements/${announcementId}/like`, { method: "POST" });
      if (!res.ok) { setStatus(prev); return; }
      const data = await res.json();
      setStatus({ count: data.count, liked_by_me: data.liked_by_me });
    } catch {
      setStatus(prev);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      aria-pressed={status.liked_by_me}
      style={{
        display: "inline-flex", alignItems: "center", gap: ".3rem",
        background: "none", border: "none", padding: 0,
        cursor: busy ? "default" : "pointer",
        fontSize: ".78rem", fontWeight: 700,
        color: status.liked_by_me ? primaryColor : "#9ca3af",
      }}
    >
      <span style={{ fontSize: "1rem", filter: status.liked_by_me ? "none" : "grayscale(1)", opacity: status.liked_by_me ? 1 : .55 }}>
        👍
      </span>
      {status.count > 0 ? status.count : "Like"}
    </button>
  );
}
