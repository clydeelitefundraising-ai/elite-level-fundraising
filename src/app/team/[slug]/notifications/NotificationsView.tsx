"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { NotificationRow } from "@/lib/notifications";

const TYPE_META: Record<string, { icon: string; label: string; accent: string; bg: string }> = {
  announcement:   { icon: "📢", label: "Update",     accent: "#3b82f6", bg: "#dbeafe" },
  file_upload:    { icon: "📎", label: "File",        accent: "#8b5cf6", bg: "#ede9fe" },
  calendar_event: { icon: "📅", label: "Event",       accent: "#0f766e", bg: "#ccfbf1" },
  fundraiser:     { icon: "💰", label: "Fundraiser",  accent: "#f59e0b", bg: "#fef3c7" },
};

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)     return "just now";
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".55rem", margin: ".5rem 0 .45rem" }}>
      <span style={{
        fontSize: ".6rem", fontWeight: 700, color: "#c0c8d4",
        textTransform: "uppercase", letterSpacing: ".09em", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #ebebeb, transparent)" }} />
    </div>
  );
}

function NotifCard({
  notif,
  hasMember,
  onTap,
  onDismiss,
}: {
  notif: NotificationRow;
  hasMember: boolean;
  onTap: (n: NotificationRow) => void;
  onDismiss: (id: string) => void;
}) {
  const meta    = TYPE_META[notif.type] ?? TYPE_META.announcement;
  const isUnread = hasMember && !notif.read_at;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:    isUnread ? "#fff" : "#f9fafb",
        borderRadius:  12,
        padding:       ".75rem .9rem",
        marginBottom:  ".45rem",
        boxShadow:     hovered
          ? "0 4px 14px rgba(0,0,0,.09), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderLeft:    `3px solid ${isUnread ? meta.accent : "#e5e7eb"}`,
        display:       "flex",
        gap:           ".65rem",
        cursor:        notif.reference_url ? "pointer" : "default",
        transform:     hovered ? "translateY(-1px)" : "none",
        transition:    "transform .13s ease, box-shadow .13s ease",
        position:      "relative",
      }}
      onClick={() => onTap(notif)}
    >
      {/* Type icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: meta.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: ".95rem", flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: ".4rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              fontWeight: isUnread ? 800 : 600,
              fontSize:   ".88rem",
              color:      "#0b1e3d",
              lineHeight: 1.3,
              display:    "block",
            }}>
              {notif.title}
            </span>
            {notif.body && (
              <span style={{
                fontSize:     ".77rem",
                color:        "#6b7280",
                display:      "block",
                marginTop:    ".12rem",
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
              }}>
                {notif.body}
              </span>
            )}
          </div>
          {/* Dismiss button */}
          {hasMember && (
            <button
              onClick={e => { e.stopPropagation(); onDismiss(notif.id); }}
              aria-label="Dismiss notification"
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: ".75rem", color: "#d1d5db", padding: ".1rem .2rem",
                lineHeight: 1, flexShrink: 0, borderRadius: 4,
                transition: "color .12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#9ca3af")}
              onMouseLeave={e => (e.currentTarget.style.color = "#d1d5db")}
            >
              ✕
            </button>
          )}
        </div>

        {/* Footer row */}
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginTop: ".3rem" }}>
          <span style={{
            padding:    ".05rem .32rem",
            borderRadius: 100,
            fontSize:   ".5rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".04em",
            background: meta.bg,
            color:      meta.accent,
          }}>
            {meta.label}
          </span>
          <span style={{ fontSize: ".65rem", color: "#9ca3af" }}>
            {relativeTime(notif.created_at)}
          </span>
          {isUnread && (
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: meta.accent, marginLeft: ".1rem",
            }} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsView({
  slug,
  initial,
  hasMember,
}: {
  slug: string;
  initial: NotificationRow[];
  hasMember: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>(initial);
  const [marking, setMarking] = useState(false);

  const unreadItems = items.filter(n => !n.read_at);
  const readItems   = items.filter(n => n.read_at);
  const unreadCount = unreadItems.length;

  const handleTap = async (notif: NotificationRow) => {
    if (hasMember && !notif.read_at) {
      setItems(prev =>
        prev.map(n => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n),
      );
      const res = await fetch(`/api/team/${slug}/notifications/read`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: notif.id }),
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent("elf:notification-read"));
      }
    }
    if (notif.reference_url) {
      router.push(notif.reference_url);
    }
  };

  const handleDismiss = async (id: string) => {
    setItems(prev => prev.filter(n => n.id !== id));
    void fetch(`/api/team/${slug}/notifications/${id}`, { method: "DELETE" });
  };

  const handleMarkAllRead = async () => {
    if (marking || !hasMember || unreadCount === 0) return;
    setMarking(true);
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })));
    const res = await fetch(`/api/team/${slug}/notifications/read`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({}),
    });
    if (res.ok) {
      window.dispatchEvent(new CustomEvent("elf:notifications-read-all"));
    }
    setMarking(false);
  };

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* Header */}
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{
          fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3",
          textTransform: "uppercase", letterSpacing: ".1em",
          display: "block", marginBottom: ".1rem",
        }}>
          Inbox
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{
            margin: 0, fontSize: "1.1rem", fontWeight: 800,
            color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2,
          }}>
            Notifications
          </h2>
          {unreadCount > 0 && (
            <span style={{
              background: "#ef4444", color: "#fff", borderRadius: 100,
              fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4,
            }}>
              {unreadCount} new
            </span>
          )}
          <div style={{ flex: 1 }} />
          {hasMember && unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={marking}
              style={{
                background: "none", border: "1px solid #e5e7eb",
                borderRadius: 8, padding: ".3rem .65rem",
                fontSize: ".7rem", fontWeight: 600, color: "#374151",
                cursor: marking ? "default" : "pointer",
                opacity: marking ? .6 : 1,
                transition: "opacity .15s",
              }}
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .3 }}>🔔</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            You're all caught up
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            New updates from coaches will appear here.
          </div>
        </div>
      )}

      {/* Unread section */}
      {unreadItems.length > 0 && (
        <>
          <SectionLabel label="New" />
          {unreadItems.map(n => (
            <NotifCard
              key={n.id}
              notif={n}
              hasMember={hasMember}
              onTap={handleTap}
              onDismiss={handleDismiss}
            />
          ))}
        </>
      )}

      {/* Read section */}
      {readItems.length > 0 && (
        <>
          <SectionLabel label="Earlier" />
          {readItems.map(n => (
            <NotifCard
              key={n.id}
              notif={n}
              hasMember={hasMember}
              onTap={handleTap}
              onDismiss={handleDismiss}
            />
          ))}
        </>
      )}

      {/* Coach view note */}
      {!hasMember && items.length > 0 && (
        <p style={{
          textAlign: "center", fontSize: ".72rem", color: "#9ca3af",
          marginTop: "1rem",
        }}>
          Coaches see all notifications. Read tracking is for athletes and parents.
        </p>
      )}
    </div>
  );
}
