"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "../../_store/AppStore";
import type { TeamUpdate, UpdateCategory, UpdateAttachment } from "../_data/mockData";

type Filter = "all" | UpdateCategory;

const categoryConfig: Record<UpdateCategory, { label: string; color: string; bg: string; text: string }> = {
  "schedule":   { label: "Schedule",   color: "#1A3A5C", bg: "rgba(26,58,92,0.10)",    text: "#1A3A5C" },
  "fundraiser": { label: "Fundraiser", color: "#C9A84C", bg: "rgba(201,168,76,0.14)", text: "#92700A" },
  "travel":     { label: "Travel",     color: "#7C3AED", bg: "rgba(124,58,237,0.09)", text: "#5B21B6" },
  "meet-info":  { label: "Meet Info",  color: "#0369A1", bg: "rgba(3,105,161,0.10)",  text: "#0369A1" },
  "team-alert": { label: "Team Alert", color: "#DC2626", bg: "rgba(220,38,38,0.09)",  text: "#B91C1C" },
};

const roleGradient: Record<string, string> = {
  "Head Coach":      "linear-gradient(135deg, #0B1E3D 0%, #1A3A5C 100%)",
  "Assistant Coach": "linear-gradient(135deg, #1A3A5C 0%, #2A5080 100%)",
  "Admin":           "linear-gradient(135deg, #374151 0%, #4B5563 100%)",
  "Booster Club":    "linear-gradient(135deg, #C9A84C 0%, #E0AA35 100%)",
};
const roleTextColor: Record<string, string> = {
  "Head Coach": "#C9A84C", "Assistant Coach": "#C9A84C",
  "Admin": "#FFFFFF",      "Booster Club": "#0B1E3D",
};

// ── Attachment icon ───────────────────────────────────────────────────────────

function AttachmentIcon({ type }: { type: UpdateAttachment["type"] }) {
  if (type === "pdf") {
    return (
      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      </div>
    );
  }
  if (type === "heat-sheet") {
    return (
      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "rgba(201,168,76,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#92700A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="9" y1="16" x2="13" y2="16" />
        </svg>
      </div>
    );
  }
  if (type === "drive") {
    return (
      <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "rgba(37,99,235,0.09)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: "rgba(124,58,237,0.09)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    </div>
  );
}

function AttachmentCard({ att }: { att: UpdateAttachment }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "#F9F7F4", borderRadius: 11, padding: "8px 10px",
      border: "1px solid #EDE9E3",
    }}>
      <AttachmentIcon type={att.type} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#0A0A0A", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {att.label}
        </p>
        {att.meta && (
          <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{att.meta}</p>
        )}
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C4BEB6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </div>
  );
}

// ── Update card ───────────────────────────────────────────────────────────────

function UpdateCard({ u, index = 0, isPinned = false }: { u: TeamUpdate; index?: number; isPinned?: boolean }) {
  const cfg = categoryConfig[u.category];

  const accentColor =
    u.category === "team-alert" ? "#DC2626"
    : u.priority === "high" ? cfg.color
    : u.read ? "#E5E7EB"
    : cfg.color;

  const cardBg =
    isPinned ? "rgba(201,168,76,0.04)"
    : u.priority === "high" && u.category === "team-alert" ? "rgba(220,38,38,0.025)"
    : "#FFFFFF";

  const boxShadow =
    isPinned
      ? "0 4px 20px rgba(0,0,0,0.10), 0 0 0 1.5px rgba(201,168,76,0.28)"
      : "0 2px 12px rgba(0,0,0,0.07)";

  return (
    <div
      className="ta-pressable ta-stagger-child"
      style={{
        display: "flex", alignItems: "stretch",
        background: cardBg, borderRadius: 18, overflow: "hidden",
        boxShadow,
        opacity: u.read && !isPinned ? 0.9 : 1,
        "--i": index,
      } as React.CSSProperties}
    >
      {/* Left category accent strip */}
      <div style={{ width: 4, flexShrink: 0, background: accentColor }} />

      {/* Main content */}
      <div style={{ flex: 1, padding: "12px 14px", minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>

        {/* Author row */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: roleGradient[u.authorRole] || roleGradient["Admin"],
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, fontWeight: 800,
            color: roleTextColor[u.authorRole] || "#FFFFFF",
          }}>
            {u.authorInitials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0A0A0A" }}>{u.author}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                background: "#F0EBE2", color: "#6B7280",
                textTransform: "uppercase", letterSpacing: "0.04em",
              }}>
                {u.authorRole}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
            {!u.read && (
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#0369A1", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 10, color: "#9CA3AF", whiteSpace: "nowrap" }}>{u.timestamp}</span>
          </div>
        </div>

        {/* Priority / pinned badges */}
        {(isPinned || u.priority === "high") && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {isPinned && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                background: "rgba(201,168,76,0.15)", color: "#92700A",
                textTransform: "uppercase", letterSpacing: "0.07em",
              }}>
                📌 Pinned
              </span>
            )}
            {u.priority === "high" && !isPinned && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                background: u.category === "team-alert" ? "rgba(220,38,38,0.10)" : "rgba(201,168,76,0.15)",
                color: u.category === "team-alert" ? "#B91C1C" : "#92700A",
                textTransform: "uppercase", letterSpacing: "0.07em",
              }}>
                ⚡ Important
              </span>
            )}
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
              background: cfg.bg, color: cfg.text,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>
              {cfg.label}
            </span>
          </div>
        )}

        {/* Title */}
        <p style={{
          fontSize: isPinned ? 15 : 14,
          fontWeight: !u.read || isPinned ? 800 : 600,
          color: "#0A0A0A",
          lineHeight: 1.25,
        }}>
          {u.title}
        </p>

        {/* Body — 2-line clamp (3 for pinned) */}
        <p style={{
          fontSize: 12, color: u.read ? "#9CA3AF" : "#4B5563", lineHeight: 1.55,
          display: "-webkit-box",
          WebkitLineClamp: isPinned ? 3 : 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        } as React.CSSProperties}>
          {u.body}
        </p>

        {/* Category badge for normal-priority items (high/pinned already show it above) */}
        {u.priority === "normal" && (
          <span style={{
            alignSelf: "flex-start",
            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
            background: cfg.bg, color: cfg.text,
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            {cfg.label}
          </span>
        )}

        {/* Attachments */}
        {u.attachments && u.attachments.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 1 }}>
            {u.attachments.map((att, i) => (
              <AttachmentCard key={i} att={att} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UpdatesPage() {
  const { teamUpdates } = useAppStore();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(
    () => filter === "all" ? teamUpdates : teamUpdates.filter(u => u.category === filter),
    [filter, teamUpdates],
  );

  const pinned  = filtered.filter(u => u.priority === "pinned");
  const feed    = filtered.filter(u => u.priority !== "pinned");
  const unread  = filtered.filter(u => !u.read).length;

  // Group feed items by timeGroup, preserving source order
  const groups = useMemo(() => {
    const map: Record<string, TeamUpdate[]> = {};
    const order: string[] = [];
    feed.forEach(u => {
      if (!map[u.timeGroup]) { map[u.timeGroup] = []; order.push(u.timeGroup); }
      map[u.timeGroup].push(u);
    });
    return order.map(g => ({
      key: g,
      label: g === "today" ? "Today" : g === "yesterday" ? "Yesterday" : g,
      items: map[g],
    }));
  }, [feed]);

  return (
    <div className="ta-page-enter">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Updates
            </p>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#0A0A0A", marginTop: 3 }}>
              Team Communications
            </p>
          </div>
          {unread > 0 && (
            <div style={{
              marginTop: 4, padding: "4px 11px", borderRadius: 100,
              background: "#0369A1",
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF" }}>
                {unread} new
              </span>
            </div>
          )}
        </div>

        {/* ── Category filter pills ── */}
        {/* TODO (Supabase): derive counts from live data */}
        <div className="ta-no-scrollbar" style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 2 }}>
          <button
            onClick={() => setFilter("all")}
            style={{
              flexShrink: 0, padding: "6px 13px", borderRadius: 100,
              background: filter === "all" ? "#0B1E3D" : "#FFFFFF",
              color:      filter === "all" ? "#FFFFFF" : "#6B7280",
              fontSize: 12, fontWeight: 600,
              border: filter === "all" ? "none" : "1.5px solid #E5E7EB",
              cursor: "pointer",
            }}
          >
            All
          </button>
          {(Object.entries(categoryConfig) as [UpdateCategory, (typeof categoryConfig)[UpdateCategory]][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                flexShrink: 0, padding: "6px 13px", borderRadius: 100,
                background: filter === key ? cfg.color : "#FFFFFF",
                color:      filter === key ? "#FFFFFF" : cfg.text,
                fontSize: 12, fontWeight: 600,
                border: filter === key ? "none" : `1.5px solid ${cfg.color}40`,
                cursor: "pointer",
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        {/* ── Pinned section ── */}
        {pinned.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                📌 Pinned
              </p>
              <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
            </div>
            {pinned.map((u, i) => (
              <UpdateCard key={u.id} u={u} index={i} isPinned />
            ))}
          </div>
        )}

        {/* ── Time-grouped feed ── */}
        {groups.map(group => (
          <div key={group.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                {group.label}
              </p>
              <div style={{ flex: 1, height: 1, background: "#EDE9E3" }} />
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 100,
                background: "#F5F0EA", color: "#9CA3AF", whiteSpace: "nowrap",
              }}>
                {group.items.length}
              </span>
            </div>
            {group.items.map((u, i) => (
              <UpdateCard key={u.id} u={u} index={i} />
            ))}
          </div>
        ))}

        {/* ── Empty state ── */}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📭</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0A0A0A" }}>No updates yet</p>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6 }}>
              {filter !== "all"
                ? `No ${categoryConfig[filter as UpdateCategory].label.toLowerCase()} posts yet.`
                : "Check back when your coach posts something."}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
