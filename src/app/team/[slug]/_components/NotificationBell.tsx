"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function NotificationBell({
  slug,
  initialCount,
}: {
  slug: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);

  // Sync when server re-renders pass a new initialCount (e.g. after router.refresh)
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  // Decrement immediately when a read event fires from NotificationsView
  useEffect(() => {
    const onRead    = () => setCount(c => Math.max(0, c - 1));
    const onReadAll = () => setCount(0);
    window.addEventListener("elf:notification-read",     onRead);
    window.addEventListener("elf:notifications-read-all", onReadAll);
    return () => {
      window.removeEventListener("elf:notification-read",     onRead);
      window.removeEventListener("elf:notifications-read-all", onReadAll);
    };
  }, []);

  return (
    <Link
      href={`/team/${slug}/notifications`}
      aria-label={count > 0 ? `Notifications — ${count} unread` : "Notifications"}
      className="elf-focus-ring"
      style={{
        position: "relative",
        width: 34,
        height: 34,
        borderRadius: "50%",
        // Phase 3: was rgba(255,255,255,.12), tuned for the header's old
        // filled team-color background — now that TeamHeader is white,
        // that value read as a barely-visible pill. This is only mounted
        // inside TeamHeader (verified — no other call site).
        background: "var(--surface-light-elevated)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1rem",
        flexShrink: 0,
        textDecoration: "none",
        transition: "background .18s ease",
      }}
    >
      🔔
      {count > 0 && (
        <span
          style={{
            position: "absolute",
            top: 3,
            right: 3,
            background: "var(--color-error)",
            color: "#fff",
            borderRadius: 100,
            fontSize: ".48rem",
            fontWeight: 800,
            padding: ".08rem .22rem",
            lineHeight: 1.5,
            minWidth: 13,
            textAlign: "center",
            border: "1.5px solid var(--canvas)",
            pointerEvents: "none",
          }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
