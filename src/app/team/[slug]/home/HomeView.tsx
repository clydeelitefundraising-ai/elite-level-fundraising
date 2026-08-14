"use client";

import { useState, useEffect } from "react";
import type { AnnouncementRow, CalendarEventRow, SponsorRow } from "@/lib/teamData";
import { isStaff, isHeadCoach, staffRoleLabel, type TeamActor } from "@/lib/permissions";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Style tokens ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  fontSize: ".875rem",
  width: "100%",
  boxSizing: "border-box",
  color: "#111827",
  background: "#fff",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

// ── Category + event type colors ──────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { bg: string; color: string; accent: string }> = {
  "schedule":   { bg: "#dbeafe", color: "#1d4ed8", accent: "#3b82f6" },
  "fundraiser": { bg: "#fef3c7", color: "#b45309", accent: "#f59e0b" },
  "travel":     { bg: "#ede9fe", color: "#6d28d9", accent: "#8b5cf6" },
  "meet-info":  { bg: "#ccfbf1", color: "#0f766e", accent: "#14b8a6" },
  "team-alert": { bg: "#fee2e2", color: "#dc2626", accent: "#ef4444" },
  "team":       { bg: "#f3f4f6", color: "#374151", accent: "#9ca3af" },
};

const EVENT_TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  practice:   { bg: "#dbeafe", color: "#1d4ed8" },
  meet:       { bg: "#ede9fe", color: "#6d28d9" },
  fundraiser: { bg: "#fef3c7", color: "#b45309" },
  team:       { bg: "#f3f4f6", color: "#374151" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 10000) return `$${(dollars / 1000).toFixed(0)}k`;
  return dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

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

function labelDate(d: string): string {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (d === today)    return "Today";
  if (d === tomorrow) return "Tomorrow";
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
    .format(new Date(y, m - 1, day));
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function AnnouncementCard({
  a,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: {
  a: AnnouncementRow;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (a: AnnouncementRow) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const cat         = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE["team"];
  const isPinned    = a.priority === "pinned";
  const isHigh      = a.priority === "high";
  const avBg        = avatarColor(a.author_name);
  const accentColor = isPinned ? "#6366f1" : isHigh ? "#dc2626" : cat.accent;
  const cardBg      = isPinned ? "#faf8ff" : isHigh ? "#fff9f8" : "#fff";
  const role        = staffRoleLabel(a.author_role ?? "");
  const isHead      = (a.author_role ?? "").includes("head");
  const att         = a.attachment ?? null;

  return (
    <div
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
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".35rem" }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%", background: avBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: ".62rem", color: "#fff", flexShrink: 0, letterSpacing: ".02em",
        }}>
          {initials(a.author_name)}
        </div>
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
      </div>

      <p style={{ margin: "0 0 .22rem", fontWeight: 800, fontSize: "1rem", color: "#0b1e3d", lineHeight: 1.3 }}>
        {a.title}
      </p>

      {a.body && (
        <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280", lineHeight: 1.62 }}>
          {a.body}
        </p>
      )}

      {att && (
        <a
          href={`/api/team/${a.campaign_slug}/files/${att.id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: ".4rem", marginTop: ".5rem", padding: ".45rem .65rem", background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 9, textDecoration: "none" }}
        >
          <span style={{ fontSize: ".8rem" }}>📎</span>
          <span style={{ fontSize: ".75rem", fontWeight: 600, color: "#0b1e3d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
            {att.name}
          </span>
          <span style={{ fontSize: ".7rem", color: "#9ca3af", flexShrink: 0 }}>↓</span>
        </a>
      )}

      {canEdit && (
        <div style={{ display: "flex", gap: ".15rem", justifyContent: "flex-end", marginTop: ".38rem" }}>
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
      )}
    </div>
  );
}

function UpcomingEventRow({ ev }: { ev: CalendarEventRow }) {
  const s = EVENT_TYPE_STYLE[ev.type] ?? EVENT_TYPE_STYLE["team"];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", padding: ".7rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ flexShrink: 0, width: 44, textAlign: "center", paddingTop: ".1rem" }}>
        <div style={{ fontSize: ".62rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>
          {labelDate(ev.event_date).slice(0, 3)}
        </div>
        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>
          {ev.event_date.split("-")[2]}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".18rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".9rem", color: "#111827" }}>{ev.title}</span>
          <span style={{ padding: ".08rem .42rem", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0 }}>
            {ev.type}
          </span>
        </div>
        {(ev.event_time || ev.location) && (
          <div style={{ fontSize: ".78rem", color: "#6b7280" }}>
            {[ev.event_time, ev.location].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Requests entry point (Phase 3B-1, Head Coach only) ─────────────────────
//
// Deliberately NOT the approval cards themselves — this is only a link to
// the dedicated Requests Center (/team/[slug]/requests), per the explicit
// product requirement that Home never render approve/decline controls
// directly. Stays visible at zero (not hidden/collapsed) so the feature
// remains discoverable, but drops the alarming red badge when there's
// nothing pending.
function RequestsEntryCard({ slug, count }: { slug: string; count: number }) {
  const hasPending = count > 0;
  return (
    <a
      href={`/team/${slug}/requests`}
      style={{
        display: "flex", alignItems: "center", gap: ".7rem",
        background: "#fff", borderRadius: 14, padding: ".9rem 1rem",
        marginBottom: ".8rem", textDecoration: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        borderLeft: hasPending ? "4px solid #dc2626" : "4px solid transparent",
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "1.1rem",
        background: hasPending ? "#fee2e2" : "#f3f4f6",
      }}>
        📋
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
          <span style={{ fontWeight: 800, fontSize: ".92rem", color: "#0b1e3d" }}>Requests</span>
          {hasPending && (
            <span style={{
              background: "#dc2626", color: "#fff", borderRadius: 100,
              fontSize: ".62rem", fontWeight: 700, padding: ".08rem .44rem", lineHeight: 1.4,
            }}>
              {count}
            </span>
          )}
        </div>
        <div style={{ fontSize: ".76rem", color: hasPending ? "#6b7280" : "#9ca3af", marginTop: ".1rem" }}>
          {hasPending
            ? `Athlete and team approval${count !== 1 ? "s" : ""} waiting`
            : "No pending requests"}
        </div>
      </div>
      <span style={{ fontSize: ".9rem", color: "#c1c7d0", flexShrink: 0 }}>→</span>
    </a>
  );
}

function FundraiserSnapshot({
  slug,
  raisedCents,
  goalCents,
  primaryColor,
}: {
  slug: string;
  raisedCents: number;
  goalCents: number;
  topAthleteName: string | null;
  primaryColor: string;
}) {
  if (raisedCents === 0) return null;

  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;

  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      marginBottom: ".8rem",
    }}>
      <div style={{ padding: ".75rem 1rem", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: ".1rem" }}>Fundraiser</div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#0b1e3d" }}>Team Progress</div>
        </div>
        <a
          href={`/team/${slug}/fundraiser`}
          style={{ padding: ".4rem .9rem", background: primaryColor, color: "#fff", borderRadius: 20, fontSize: ".75rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          View Fundraiser →
        </a>
      </div>

      <div style={{ padding: ".85rem 1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: ".55rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.5rem", color: "#0b1e3d", lineHeight: 1 }}>{fmtMoney(raisedCents)}</div>
            <div style={{ fontSize: ".62rem", color: "#9ca3af", marginTop: ".12rem" }}>raised</div>
          </div>
          {goalCents > 0 && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#374151" }}>{fmtMoney(goalCents)}</div>
              <div style={{ fontSize: ".62rem", color: "#9ca3af", marginTop: ".12rem" }}>goal</div>
            </div>
          )}
        </div>

        {goalCents > 0 && (
          <div>
            <div style={{ background: "#eaecef", borderRadius: 100, height: 8, overflow: "hidden", marginBottom: ".3rem" }}>
              <div style={{ background: primaryColor, height: "100%", width: `${pct}%`, borderRadius: 100, transition: "width .5s ease" }} />
            </div>
            <div style={{ fontSize: ".65rem", color: "#9ca3af", textAlign: "right" }}>{pct}% of goal</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type AForm = {
  title: string;
  body: string;
  category: string;
  priority: "normal" | "high" | "pinned";
};

const BLANK: AForm = { title: "", body: "", category: "team", priority: "normal" };

type HomeViewProps = {
  slug: string;
  initialAnnouncements: AnnouncementRow[];
  initialUpcoming: CalendarEventRow[];
  actor: TeamActor;
  sponsors?: SponsorRow[];
  raisedCents?: number;
  goalCents?: number;
  topAthleteName?: string | null;
  primaryColor?: string;
  pendingRequestCount?: number;
};

// ── Role-based entry point (future-proofed for role dashboards) ────────────────

export default function HomeView(props: HomeViewProps) {
  // Future: switch on actor role to render AthleteHome, ParentHome, CoachHome, etc.
  return <HomeContent {...props} />;
}

// ── Main content ──────────────────────────────────────────────────────────────

function HomeContent({
  slug,
  initialAnnouncements,
  initialUpcoming,
  actor,
  sponsors = [],
  raisedCents = 0,
  goalCents = 0,
  topAthleteName = null,
  primaryColor = "#0b1e3d",
  pendingRequestCount = 0,
}: HomeViewProps) {
  const canEdit   = isStaff(actor);
  const canDelete = isHeadCoach(actor);
  // Separately named (rather than reusing canDelete) so the Requests-card
  // gate below reads clearly on its own — same underlying check.
  const isHeadCoachViewer = canDelete;
  const [items,     setItems]     = useState<AnnouncementRow[]>(initialAnnouncements);
  const [form,    setForm]    = useState<AForm>(BLANK);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const [unread,  setUnread]  = useState(0);

  const next3 = initialUpcoming.slice(0, 3);

  useEffect(() => {
    const lastRead = localStorage.getItem(`elf_home_read_${slug}`);
    setUnread(lastRead
      ? items.filter(a => a.created_at > lastRead).length
      : items.length,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openAdd  = () => { setForm(BLANK); setError(""); setShowAdd(true); };
  const openEdit = (a: AnnouncementRow) => {
    setForm({ title: a.title, body: a.body, category: a.category, priority: a.priority });
    setError(""); setEditing(a);
  };
  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); };

  const handleAdd = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const res  = await fetch(`/api/team/${slug}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to post announcement."); return; }
    setItems(prev => [data, ...prev]);
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const res  = await fetch(`/api/team/${slug}/announcements/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update announcement."); return; }
    setItems(prev => prev.map(a => a.id === editing.id ? { ...a, ...form } : a));
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    const res = await fetch(`/api/team/${slug}/announcements/${id}`, { method: "DELETE" });
    if (res.ok) setItems(prev => prev.filter(a => a.id !== id));
  };

  const pinned    = items.filter(a => a.priority === "pinned");
  const nonPinned = items.filter(a => a.priority !== "pinned");
  const preview   = [...pinned, ...nonPinned].slice(0, 3);

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>

      {/* 0 — Requests entry point (Head Coach only, Phase 3B-1) */}
      {isHeadCoachViewer && <RequestsEntryCard slug={slug} count={pendingRequestCount} />}

      {/* 1 — Upcoming Events */}
      {next3.length > 0 && (
        <div style={{
          background: "#fff",
          borderRadius: 14,
          padding: ".9rem 1rem",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          marginBottom: ".8rem",
        }}>
          <h2 style={{ margin: "0 0 .2rem", fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".09em" }}>
            Upcoming
          </h2>
          {next3.map((ev, i) => (
            <div key={ev.id} style={i === next3.length - 1 ? { borderBottom: "none" } : {}}>
              <UpcomingEventRow ev={ev} />
            </div>
          ))}
        </div>
      )}

      {/* 2 — Team Communications */}
      <div style={{ marginBottom: ".5rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Updates
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Communications
          </h2>
          {unread > 0 && (
            <span style={{
              background: "#dc2626", color: "#fff", borderRadius: 100,
              fontSize: ".55rem", fontWeight: 700, padding: ".14rem .48rem",
              lineHeight: 1.4, whiteSpace: "nowrap",
            }}>
              {unread} new
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={canEdit} label="Post" onAdd={openAdd} />
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
          marginBottom: ".8rem",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>📣</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            No announcements yet
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {canEdit ? "Use the Post button to get started." : "Check back soon."}
          </div>
        </div>
      ) : (
        <>
          {preview.map(a => (
            <AnnouncementCard key={a.id} a={a} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={handleDelete} />
          ))}
          <a
            href={`/team/${slug}/communications?tab=updates`}
            style={{
              display: "block",
              textAlign: "center",
              padding: ".55rem",
              marginTop: ".1rem",
              marginBottom: ".8rem",
              fontSize: ".75rem",
              fontWeight: 700,
              color: "#0b1e3d",
              textDecoration: "none",
              opacity: .7,
            }}
          >
            View all updates →
          </a>
        </>
      )}

      {/* 3 — Sponsors */}
      {sponsors.length > 0 && (
        <div style={{ marginTop: ".25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".5rem" }}>
            <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em" }}>
              Our Sponsors
            </span>
            <a
              href={`/team/${slug}/sponsors`}
              style={{ fontSize: ".7rem", fontWeight: 700, color: "#0b1e3d", textDecoration: "none" }}
            >
              View All →
            </a>
          </div>
          <div style={{ display: "flex", gap: ".5rem", overflowX: "auto", paddingBottom: ".25rem", scrollbarWidth: "none" } as React.CSSProperties}>
            {sponsors.slice(0, 5).map(s => (
              <a
                key={s.id}
                href={s.url || `/team/${slug}/sponsors`}
                target={s.url ? "_blank" : undefined}
                rel={s.url ? "noopener noreferrer" : undefined}
                style={{
                  flexShrink: 0,
                  width: 80,
                  background: "#fff",
                  borderRadius: 12,
                  padding: ".6rem .4rem .5rem",
                  boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: ".3rem",
                  textDecoration: "none",
                }}
              >
                {s.logo_url ? (
                  <img
                    src={s.logo_url}
                    alt={s.name}
                    style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 6 }}
                  />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: 6,
                    background: "#f0f4ff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: ".9rem", color: "#1d4ed8",
                  }}>
                    {s.name.trim()[0]?.toUpperCase() ?? "S"}
                  </div>
                )}
                <span style={{
                  fontSize: ".58rem", fontWeight: 700, color: "#374151",
                  textAlign: "center", lineHeight: 1.25,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>
                  {s.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 4 — Fundraiser Snapshot (compact, secondary) */}
      <FundraiserSnapshot
        slug={slug}
        raisedCents={raisedCents}
        goalCents={goalCents}
        topAthleteName={topAthleteName}
        primaryColor={primaryColor}
      />

      {/* Announcement modal */}
      {modalOpen && (
        <Modal title={isEditing ? "Edit Announcement" : "New Announcement"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <label style={lbl}>
              Title *
              <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Practice moved to Tuesday" autoFocus />
            </label>
            <label style={lbl}>
              Body
              <textarea style={{ ...inp, minHeight: 80, resize: "vertical" }} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Optional details…" />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <label style={lbl}>
                Category
                <select style={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="team">Team</option>
                  <option value="schedule">Schedule</option>
                  <option value="fundraiser">Fundraiser</option>
                  <option value="travel">Travel</option>
                  <option value="meet-info">Meet Info</option>
                  <option value="team-alert">Team Alert</option>
                </select>
              </label>
              <label style={lbl}>
                Priority
                <select style={inp} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as AForm["priority"] }))}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="pinned">Pinned</option>
                </select>
              </label>
            </div>
            {error && (
              <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeModal} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Post"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
