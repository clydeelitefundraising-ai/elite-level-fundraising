"use client";

import { useState, useEffect } from "react";
import type { AnnouncementRow, CalendarEventRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Style tokens ──────────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1px solid #d1d5db",
  borderRadius: 8,
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
  fontSize: ".75rem",
  fontWeight: 700,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: ".04em",
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

const FILTER_CHIPS = [
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

function labelDate(d: string): string {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (d === today)    return "Today";
  if (d === tomorrow) return "Tomorrow";
  const [y, m, day] = d.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
    .format(new Date(y, m - 1, day));
}

function roleLabel(raw: string): string {
  if (raw === "head_coach")      return "Head Coach";
  if (raw === "assistant_coach") return "Asst. Coach";
  return raw;
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".55rem", margin: "0 0 .5rem" }}>
      <span style={{ fontSize: ".62rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".08em", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "#ebebeb" }} />
    </div>
  );
}

function AnnouncementCard({
  a,
  coach,
  onEdit,
  onDelete,
}: {
  a: AnnouncementRow;
  coach: CoachSession | null;
  onEdit: (a: AnnouncementRow) => void;
  onDelete: (id: string) => void;
}) {
  const cat         = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE["team"];
  const isPinned    = a.priority === "pinned";
  const isHigh      = a.priority === "high";
  const avBg        = avatarColor(a.author_name);
  const accentColor = isPinned ? "#6366f1" : isHigh ? "#dc2626" : cat.accent;
  const cardBg      = isPinned ? "#faf8ff" : isHigh ? "#fff9f8" : "#fff";
  const role        = roleLabel(a.author_role ?? "");
  const isHead      = (a.author_role ?? "").includes("head");

  // Future-proofed: renders only when attachments field is populated
  const attachments = (a as AnnouncementRow & { attachments?: string[] }).attachments;
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  return (
    <div style={{
      background: cardBg,
      borderRadius: 12,
      padding: ".75rem .9rem .7rem .82rem",
      boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      borderLeft: `4px solid ${accentColor}`,
      marginBottom: ".55rem",
    }}>

      {/* ── Row 1: avatar + name + role badge + timestamp ── */}
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".35rem" }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: avBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: ".6rem",
          color: "#fff",
          flexShrink: 0,
          letterSpacing: ".02em",
        }}>
          {initials(a.author_name)}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: ".3rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".83rem", color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {a.author_name}
          </span>
          {role && (
            <span style={{
              padding: ".06rem .34rem",
              borderRadius: 100,
              fontSize: ".52rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".04em",
              background: isHead ? "#dbeafe" : "#f3f4f6",
              color:      isHead ? "#1d4ed8" : "#6b7280",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}>
              {role}
            </span>
          )}
        </div>

        {/* Timestamp with blue dot indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: ".28rem", flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#93c5fd" }} />
          <span style={{ fontSize: ".66rem", color: "#9ca3af" }}>
            {relativeTime(a.created_at)}
          </span>
        </div>
      </div>

      {/* ── Row 2: category + priority chips ── */}
      <div style={{ display: "flex", gap: ".28rem", marginBottom: ".42rem", flexWrap: "wrap" }}>
        <span style={{
          padding: ".07rem .38rem",
          borderRadius: 100,
          fontSize: ".53rem",
          fontWeight: 700,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          background: cat.bg,
          color: cat.color,
        }}>
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

      {/* ── Title ── */}
      <p style={{ margin: "0 0 .22rem", fontWeight: 800, fontSize: "1.01rem", color: "#0b1e3d", lineHeight: 1.28 }}>
        {a.title}
      </p>

      {/* ── Body ── */}
      {a.body && (
        <p style={{ margin: 0, fontSize: ".81rem", color: "#6b7280", lineHeight: 1.6 }}>
          {a.body}
        </p>
      )}

      {/* ── Attachment preview (future — renders only when data exists) ── */}
      {hasAttachments && (
        <div style={{ marginTop: ".5rem", display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
          {attachments!.map((url, i) => (
            <a key={i} href={url} style={{ fontSize: ".72rem", color: "#1d4ed8", background: "#eff6ff", borderRadius: 6, padding: ".2rem .55rem", textDecoration: "none", fontWeight: 500 }}>
              📎 Attachment {i + 1}
            </a>
          ))}
        </div>
      )}

      {/* ── Coach actions — low-prominence, bottom-right ── */}
      {coach && (
        <div style={{ display: "flex", gap: ".15rem", justifyContent: "flex-end", marginTop: ".38rem" }}>
          <button
            onClick={() => onEdit(a)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
          >
            Edit
          </button>
          {coach.role === "head_coach" && (
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: ".75rem", padding: ".75rem 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ flexShrink: 0, width: 44, textAlign: "center", paddingTop: ".15rem" }}>
        <div style={{ fontSize: ".65rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".05em" }}>
          {labelDate(ev.event_date).slice(0, 3)}
        </div>
        <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>
          {ev.event_date.split("-")[2]}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".4rem", marginBottom: ".2rem" }}>
          <span style={{ fontWeight: 600, fontSize: ".9rem", color: "#111827" }}>{ev.title}</span>
          <span style={{ padding: ".1rem .45rem", borderRadius: 100, fontSize: ".6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0 }}>
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

// ── Types ─────────────────────────────────────────────────────────────────────

type AForm = {
  title: string;
  body: string;
  category: string;
  priority: "normal" | "high" | "pinned";
};

const BLANK: AForm = { title: "", body: "", category: "team", priority: "normal" };

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeView({
  slug,
  initialAnnouncements,
  initialUpcoming,
  coach,
}: {
  slug: string;
  initialAnnouncements: AnnouncementRow[];
  initialUpcoming: CalendarEventRow[];
  coach: CoachSession | null;
}) {
  const [items,     setItems]     = useState<AnnouncementRow[]>(initialAnnouncements);
  const [form,      setForm]      = useState<AForm>(BLANK);
  const [editing,   setEditing]   = useState<AnnouncementRow | null>(null);
  const [showAdd,   setShowAdd]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [unread,    setUnread]    = useState(0);

  const next3 = initialUpcoming.slice(0, 3);

  // Compute unread count from localStorage after hydration
  useEffect(() => {
    const lastRead = localStorage.getItem(`elf_home_read_${slug}`);
    setUnread(lastRead
      ? items.filter(a => a.created_at > lastRead).length
      : items.length,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openAdd = () => { setForm(BLANK); setError(""); setShowAdd(true); };

  const openEdit = (a: AnnouncementRow) => {
    setForm({ title: a.title, body: a.body, category: a.category, priority: a.priority });
    setError("");
    setEditing(a);
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

  // ── Feed grouping (filter applied first) ──────────────────────────────────

  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const filtered       = filterCat === "all" ? items : items.filter(a => a.category === filterCat);
  const pinned         = filtered.filter(a => a.priority === "pinned");
  const nonPinned      = filtered.filter(a => a.priority !== "pinned");
  const todayItems     = nonPinned.filter(a => a.created_at.slice(0, 10) === today);
  const yesterdayItems = nonPinned.filter(a => a.created_at.slice(0, 10) === yesterday);
  const earlierItems   = nonPinned.filter(a => a.created_at.slice(0, 10) < yesterday);

  const isEditing = editing !== null;
  const modalOpen = showAdd || isEditing;

  return (
    <>
      {/* ── Upcoming Events ── */}
      {next3.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, padding: ".875rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: "1px solid #f0f0f0", marginBottom: ".75rem" }}>
          <h2 style={{ margin: "0 0 .25rem", fontSize: ".7rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
            Upcoming
          </h2>
          {next3.map((ev, i) => (
            <div key={ev.id} style={i === next3.length - 1 ? { borderBottom: "none" } : {}}>
              <UpcomingEventRow ev={ev} />
            </div>
          ))}
        </div>
      )}

      {/* ── Section header ── */}
      <div style={{ marginBottom: ".5rem" }}>
        <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".12rem" }}>
          Updates
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Communications
          </h2>
          {unread > 0 && (
            <span style={{
              background: "#dc2626",
              color: "#fff",
              borderRadius: 100,
              fontSize: ".57rem",
              fontWeight: 700,
              padding: ".14rem .48rem",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}>
              {unread} new
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar coach={coach} label="Post" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Category filter chips ── */}
      <div style={{
        display: "flex",
        gap: ".375rem",
        overflowX: "auto",
        marginBottom: ".6rem",
        paddingBottom: ".2rem",
        scrollbarWidth: "none",
      } as React.CSSProperties}>
        {FILTER_CHIPS.map(chip => {
          const active = filterCat === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setFilterCat(chip.id)}
              style={{
                flexShrink: 0,
                padding: ".28rem .7rem",
                borderRadius: 100,
                border: active ? "none" : "1px solid #e5e7eb",
                background: active ? "#0b1e3d" : "#fff",
                color: active ? "#fff" : "#6b7280",
                fontSize: ".7rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                lineHeight: 1.4,
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* ── Feed ── */}
      {filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: "2rem 1.25rem", textAlign: "center", color: "#9ca3af", fontSize: ".88rem", border: "1px solid #f0f0f0" }}>
          {filterCat === "all" ? "No announcements yet. Check back soon." : `No ${filterCat} posts yet.`}
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <SectionLabel label="📌 Pinned" />
              {pinned.map(a => (
                <AnnouncementCard key={a.id} a={a} coach={coach} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </>
          )}

          {todayItems.length > 0 && (
            <>
              <SectionLabel label="Today" />
              {todayItems.map(a => (
                <AnnouncementCard key={a.id} a={a} coach={coach} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </>
          )}

          {yesterdayItems.length > 0 && (
            <>
              <SectionLabel label="Yesterday" />
              {yesterdayItems.map(a => (
                <AnnouncementCard key={a.id} a={a} coach={coach} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </>
          )}

          {earlierItems.length > 0 && (
            <>
              <SectionLabel label="Earlier" />
              {earlierItems.map(a => (
                <AnnouncementCard key={a.id} a={a} coach={coach} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </>
          )}
        </>
      )}

      {/* ── Add / Edit Modal ── */}
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
            {error && <p style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{error}</p>}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeModal} style={{ padding: ".45rem .9rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={isEditing ? handleEdit : handleAdd} disabled={saving} style={{ padding: ".45rem .9rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1 }}>
                {saving ? "Saving…" : isEditing ? "Save Changes" : "Post"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
