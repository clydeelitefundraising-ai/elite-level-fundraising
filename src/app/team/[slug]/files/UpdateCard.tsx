"use client";

import { useRef, useState } from "react";
import type { AnnouncementRow } from "@/lib/teamData";
import { staffRoleLabel } from "@/lib/permissions";
import type { ReadReceiptsResult } from "@/lib/notifications";
import CommentsSection from "./CommentsSection";
import Avatar from "../messages/_shared/Avatar";
import { useSeenTracker } from "../_components/useSeenTracker";
import { type RecipientScope, SCOPE_LABELS } from "./useUpdatesWorkspace";

// D5: the announcement card, its section-divider label, and the lazy
// read-receipts panel — extracted verbatim (identical styling/behavior)
// from UpdatesView.tsx's original body so the existing mobile feed and the
// new desktop feed (DesktopUpdatesView.tsx) render the SAME card component
// instead of two independent copies. CommentsSection is untouched and
// unmodified — D5 Batch 1 explicitly does not change comment presentation.

// ── Category / attachment styles (shared by the card and the composer's
//    attachment preview in AnnouncementFormModal.tsx) ──────────────────────

export const CATEGORY_STYLE: Record<string, { bg: string; color: string; accent: string }> = {
  "schedule":   { bg: "#dbeafe", color: "#1d4ed8", accent: "#3b82f6" },
  "fundraiser": { bg: "#fef3c7", color: "#b45309", accent: "#f59e0b" },
  "travel":     { bg: "#ede9fe", color: "#6d28d9", accent: "#8b5cf6" },
  "meet-info":  { bg: "#ccfbf1", color: "#0f766e", accent: "#14b8a6" },
  "team-alert": { bg: "#fee2e2", color: "#dc2626", accent: "#ef4444" },
  "team":       { bg: "#f3f4f6", color: "#374151", accent: "#9ca3af" },
};

export const FILE_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  pdf:   { bg: "#fee2e2", color: "#dc2626", icon: "📄" },
  image: { bg: "#dbeafe", color: "#1d4ed8", icon: "🖼️" },
  doc:   { bg: "#ede9fe", color: "#6d28d9", icon: "📝" },
  other: { bg: "#f3f4f6", color: "#374151", icon: "📎" },
};

export const FILTER_CHIPS = [
  { id: "all",        label: "All"        },
  { id: "schedule",   label: "Schedule"   },
  { id: "fundraiser", label: "Fundraiser" },
  { id: "travel",     label: "Travel"     },
  { id: "meet-info",  label: "Meet Info"  },
  { id: "team",       label: "Team"       },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function avatarColor(name: string): string {
  const palette = ["#0b2044", "#92400e", "#1e3a8a", "#5b21b6", "#065f46", "#9f1239", "#1e4d7b", "#78350f"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)     return "just now";
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1_024)     return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

// ── Section divider ───────────────────────────────────────────────────────────

export function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".55rem", margin: ".1rem 0 .55rem" }}>
      <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#c0c8d4", textTransform: "uppercase", letterSpacing: ".09em", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #ebebeb, transparent)" }} />
    </div>
  );
}

// ── Read receipts panel (lazy-loaded, coach-only) ─────────────────────────────

function ReadReceiptPanel({ slug, announcementId }: { slug: string; announcementId: string }) {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState<ReadReceiptsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (!open && !data && !loading) {
      setLoading(true);
      const res = await fetch(`/api/team/${slug}/announcements/${announcementId}/reads`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    }
    setOpen(o => !o);
  };

  const readCount = data?.reads.length ?? 0;
  const total     = data?.total_targeted ?? 0;

  return (
    <div style={{ marginTop: ".3rem" }}>
      <button
        onClick={e => { e.stopPropagation(); toggle(); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: ".66rem", fontWeight: 600, color: "#9ca3af", padding: 0, lineHeight: 1.4,
          display: "flex", alignItems: "center", gap: ".25rem",
        }}
      >
        <span style={{ fontSize: ".7rem" }}>👁</span>
        {loading ? "Loading…" : data ? `${readCount} / ${total} Seen` : "Check Seen"}
        <span style={{ fontSize: ".6rem", opacity: .6 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && data && (
        <div style={{
          marginTop: ".35rem", padding: ".5rem .6rem",
          background: "#f8f9fb", borderRadius: 8,
          border: "1px solid #e5e7eb",
        }}>
          {data.reads.length === 0 ? (
            <p style={{ margin: 0, fontSize: ".72rem", color: "#9ca3af" }}>No one has seen this yet.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: ".2rem" }}>
              {data.reads.map(r => (
                <li key={`${r.kind}:${r.id}`} style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: avatarColor(r.name),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: ".5rem", fontWeight: 800, color: "#fff", flexShrink: 0,
                  }}>
                    {initials(r.name)}
                  </span>
                  <span style={{ flex: 1, fontSize: ".72rem", color: "#374151", fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontSize: ".62rem", color: "#9ca3af" }}>{relativeTime(r.read_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Update card ───────────────────────────────────────────────────────────────

export function UpdateCard({
  a,
  slug,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  a: AnnouncementRow;
  slug: string;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (a: AnnouncementRow) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const cat         = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE["team"];
  const isPinned    = a.priority === "pinned";
  const isHigh      = a.priority === "high";
  const accentColor = isPinned ? "#6366f1" : isHigh ? "#dc2626" : cat.accent;
  const cardBg      = isPinned ? "#faf8ff" : isHigh ? "#fff9f8" : "#fff";
  const role        = staffRoleLabel(a.author_role ?? "");
  const isHead      = (a.author_role ?? "").includes("head");
  const att         = a.attachment ?? null;
  const attStyle    = att ? (FILE_STYLE[att.file_type] ?? FILE_STYLE["other"]) : null;
  const scope       = a.recipient_scope ?? "everyone";

  // Phase 9: marks this announcement Seen automatically once it's been
  // genuinely visible on screen for a dwell threshold — no tap required.
  // Same hook/module-level dedupe as HomeView.tsx's AnnouncementCard, so
  // the same announcement showing on both surfaces still produces only
  // one persisted receipt.
  const cardRef = useRef<HTMLDivElement>(null);
  useSeenTracker(cardRef, slug, a.id);

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: cardBg,
        borderRadius: 13,
        padding: ".8rem .95rem .75rem .85rem",
        boxShadow: hovered
          ? "0 4px 18px rgba(0,0,0,.10), 0 0 0 1px rgba(0,0,0,.05)"
          : "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderLeft: `4px solid ${accentColor}`,
        marginBottom: ".55rem",
        transform: hovered ? "translateY(-1px)" : "none",
        transition: "transform .14s ease, box-shadow .14s ease",
      }}
    >
      {/* Row 1: avatar + name + role badge + timestamp */}
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".35rem" }}>
        <Avatar name={a.author_name} photoUrl={a.author_photo_url} size={30} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: ".3rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".84rem", color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {a.author_name}
          </span>
          {role && (
            <span style={{
              padding: ".06rem .34rem", borderRadius: 100, fontSize: ".52rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: ".04em",
              background: isHead ? "#dbeafe" : "#f3f4f6",
              color:      isHead ? "#1d4ed8" : "#6b7280",
              flexShrink: 0, whiteSpace: "nowrap",
            }}>
              {role}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: ".28rem", flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#93c5fd" }} />
          <span style={{ fontSize: ".66rem", color: "#9ca3af" }}>{relativeTime(a.created_at)}</span>
        </div>
      </div>

      {/* Row 2: category + priority + scope chips */}
      <div style={{ display: "flex", gap: ".28rem", marginBottom: ".42rem", flexWrap: "wrap" }}>
        <span style={{ padding: ".07rem .38rem", borderRadius: 100, fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: cat.bg, color: cat.color }}>
          {a.category.replace("-", " ")}
        </span>
        {isPinned && (
          <span style={{ padding: ".07rem .38rem", borderRadius: 100, fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#ede9fe", color: "#4338ca" }}>
            📌 Pinned
          </span>
        )}
        {isHigh && !isPinned && (
          <span style={{ padding: ".07rem .38rem", borderRadius: 100, fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#fee2e2", color: "#dc2626" }}>
            ⚠️ Important
          </span>
        )}
        {canEdit && scope !== "everyone" && (
          <span style={{ padding: ".07rem .38rem", borderRadius: 100, fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#ecfdf5", color: "#065f46" }}>
            → {SCOPE_LABELS[scope as RecipientScope] ?? scope}
          </span>
        )}
      </div>

      {/* Title */}
      <p style={{ margin: "0 0 .22rem", fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", lineHeight: 1.3 }}>
        {a.title}
      </p>

      {/* Body */}
      {a.body && (
        <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280", lineHeight: 1.62 }}>
          {a.body}
        </p>
      )}

      {/* Attachment row */}
      {att && attStyle && (
        <a
          href={`/api/team/${slug}/files/${att.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: ".55rem",
            marginTop: ".6rem", padding: ".55rem .7rem",
            background: "#f8f9fb", border: "1px solid #e5e7eb",
            borderRadius: 10, textDecoration: "none",
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: attStyle.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: ".9rem", flexShrink: 0,
          }}>
            {attStyle.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: ".8rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {att.name}
            </div>
            <div style={{ fontSize: ".64rem", color: "#9ca3af" }}>{formatSize(att.size_bytes)}</div>
          </div>
          <span style={{ fontSize: ".75rem", color: "#0b1e3d", fontWeight: 700, flexShrink: 0 }}>↓</span>
        </a>
      )}

      {/* Staff actions + read receipts */}
      {canEdit && (
        <div style={{ marginTop: ".38rem" }}>
          <div style={{ display: "flex", gap: ".15rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => onEdit(a)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
            >
              Edit
            </button>
            {canDelete && (
              <button
                onClick={() => onDelete(a.id)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
              >
                Delete
              </button>
            )}
          </div>
          <ReadReceiptPanel slug={slug} announcementId={a.id} />
        </div>
      )}

      {/* Comments (Phase 3B-2) — reads/writes are already scoped per-viewer
          server-side, so this renders identically regardless of role. D5
          explicitly does not change comment presentation — CommentsSection
          is reused completely unmodified. */}
      <CommentsSection slug={slug} announcementId={a.id} />
    </div>
  );
}
