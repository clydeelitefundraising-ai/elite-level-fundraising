"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { NotificationRow } from "@/lib/notifications";
import { findAnnouncementNotification } from "@/lib/notifications";
import { Megaphone, MessageCircle, Paperclip, Calendar, DollarSign, Bell, type LucideIcon } from "lucide-react";

const TYPE_META: Record<string, { icon: LucideIcon; label: string; accent: string; bg: string }> = {
  announcement:   { icon: Megaphone,     label: "Update",     accent: "#3b82f6", bg: "#dbeafe" },
  message:        { icon: MessageCircle, label: "Message",    accent: "#8b5cf6", bg: "#ede9fe" },
  file_upload:    { icon: Paperclip,     label: "File",        accent: "#8b5cf6", bg: "#ede9fe" },
  calendar_event: { icon: Calendar,      label: "Event",       accent: "#0f766e", bg: "#ccfbf1" },
  fundraiser:     { icon: DollarSign,    label: "Fundraiser",  accent: "#f59e0b", bg: "#fef3c7" },
};

const SCOPE_LABELS: Record<string, string> = {
  athletes:        "Athletes",
  parents:         "Parents",
  boosters:        "Boosters",
  athlete_specific: "Specific Athlete",
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
  isCoach,
  expanded,
  highlighted,
  onTap,
  onDismiss,
  onToggleExpand,
}: {
  notif: NotificationRow;
  hasMember: boolean;
  isCoach: boolean;
  expanded: boolean;
  highlighted: boolean;
  onTap: (n: NotificationRow) => void;
  onDismiss: (id: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  const meta    = TYPE_META[notif.type] ?? TYPE_META.announcement;
  const isUnread = (hasMember || isCoach) && !notif.read_at;
  const [hovered, setHovered] = useState(false);
  const bodyIsLong = notif.body.length > 80;
  const scope = notif.recipient_scope;
  const showScopeBadge = isCoach && scope && scope !== "everyone";

  return (
    <div
      id={`notif-${notif.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:    isUnread ? "#fff" : "#f9fafb",
        borderRadius:  12,
        padding:       ".75rem .9rem",
        marginBottom:  ".45rem",
        boxShadow:     highlighted
          ? "0 0 0 2px #3b82f6, 0 4px 14px rgba(59,130,246,.25)"
          : hovered
          ? "0 4px 14px rgba(0,0,0,.09), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderLeft:    `3px solid ${isUnread ? meta.accent : "#e5e7eb"}`,
        display:       "flex",
        gap:           ".65rem",
        cursor:        "pointer",
        transform:     hovered ? "translateY(-1px)" : "none",
        transition:    "transform .13s ease, box-shadow .3s ease",
        position:      "relative",
      }}
      onClick={() => onTap(notif)}
    >
      {/* Type icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: meta.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <meta.icon size={17} strokeWidth={2} aria-hidden="true" style={{ color: meta.accent }} />
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
                ...(expanded || !bodyIsLong
                  ? { whiteSpace: "pre-wrap" as const }
                  : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }),
              }}>
                {notif.body}
              </span>
            )}
            {bodyIsLong && (
              <button
                onClick={e => { e.stopPropagation(); onToggleExpand(notif.id); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: ".68rem", color: meta.accent, fontWeight: 600,
                  padding: ".1rem 0", lineHeight: 1.4,
                }}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
          {/* Dismiss button (members only) */}
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
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginTop: ".3rem", flexWrap: "wrap" }}>
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
          {showScopeBadge && (
            <span style={{
              padding: ".05rem .32rem", borderRadius: 100,
              fontSize: ".5rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: ".04em",
              background: "#ecfdf5", color: "#065f46",
            }}>
              {SCOPE_LABELS[scope] ?? scope}
            </span>
          )}
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
  isCoach = false,
}: {
  slug: string;
  initial: NotificationRow[];
  hasMember: boolean;
  isCoach?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items,       setItems]       = useState<NotificationRow[]>(initial);
  const [marking,     setMarking]     = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const unreadItems = items.filter(n => !n.read_at);
  const readItems   = items.filter(n => n.read_at);
  const unreadCount = unreadItems.length;
  const canMarkRead = hasMember || isCoach;

  // Deep link from an announcement push/notification tap (see
  // src/app/api/team/[slug]/announcements/route.ts): ?announcementId=<id>
  // scrolls to and briefly highlights the matching notification row. `items`
  // is already scoped to what this actor can see (getNotificationsForMember),
  // so a malformed, unknown, or cross-team/account id simply matches nothing
  // and this is a silent no-op — the normal /notifications page renders
  // exactly as it would without the param.
  useEffect(() => {
    const match = findAnnouncementNotification(items, searchParams.get("announcementId"));
    if (!match) return;

    const el = document.getElementById(`notif-${match.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Deferred a tick: setting state synchronously in an effect body risks
    // a cascading render (react-hooks/set-state-in-effect); this is a
    // one-time "sync from the URL on mount" action, not a per-render
    // synchronization, so the defer changes nothing observable.
    const highlightTimer = setTimeout(() => setHighlightedId(match.id), 0);
    const clearTimer = setTimeout(() => setHighlightedId(null), 2500);
    return () => { clearTimeout(highlightTimer); clearTimeout(clearTimer); };
    // Runs once per mount against the initial list/query — re-scrolling on
    // every unrelated `items` mutation (dismiss, mark-read) would be jarring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = async (notif: NotificationRow) => {
    if (canMarkRead && !notif.read_at) {
      setItems(prev =>
        prev.map(n => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n),
      );
      const res = await fetch(`/api/team/${slug}/notifications/read`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: notif.id }),
      });
      if (res.ok && hasMember) {
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

  const handleToggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
          <div style={{ marginBottom: ".65rem", opacity: .3, display: "flex", justifyContent: "center" }}><Bell size={32} strokeWidth={1.75} aria-hidden="true" /></div>
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
              isCoach={isCoach}
              expanded={expandedIds.has(n.id)}
              highlighted={highlightedId === n.id}
              onTap={handleTap}
              onDismiss={handleDismiss}
              onToggleExpand={handleToggleExpand}
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
              isCoach={isCoach}
              expanded={expandedIds.has(n.id)}
              highlighted={highlightedId === n.id}
              onTap={handleTap}
              onDismiss={handleDismiss}
              onToggleExpand={handleToggleExpand}
            />
          ))}
        </>
      )}
    </div>
  );
}
