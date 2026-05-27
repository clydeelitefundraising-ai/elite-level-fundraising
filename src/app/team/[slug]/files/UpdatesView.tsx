"use client";

import { useRef, useState } from "react";
import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";
import FilesView from "./FilesView";

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

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_BYTES = 25 * 1024 * 1024;

// ── Category styles ───────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { bg: string; color: string; accent: string }> = {
  "schedule":   { bg: "#dbeafe", color: "#1d4ed8", accent: "#3b82f6" },
  "fundraiser": { bg: "#fef3c7", color: "#b45309", accent: "#f59e0b" },
  "travel":     { bg: "#ede9fe", color: "#6d28d9", accent: "#8b5cf6" },
  "meet-info":  { bg: "#ccfbf1", color: "#0f766e", accent: "#14b8a6" },
  "team-alert": { bg: "#fee2e2", color: "#dc2626", accent: "#ef4444" },
  "team":       { bg: "#f3f4f6", color: "#374151", accent: "#9ca3af" },
};

const FILE_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  pdf:   { bg: "#fee2e2", color: "#dc2626", icon: "📄" },
  image: { bg: "#dbeafe", color: "#1d4ed8", icon: "🖼️" },
  doc:   { bg: "#ede9fe", color: "#6d28d9", icon: "📝" },
  other: { bg: "#f3f4f6", color: "#374151", icon: "📎" },
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

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1_024)     return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function roleLabel(raw: string): string {
  if (raw === "head_coach")      return "Head Coach";
  if (raw === "assistant_coach") return "Asst. Coach";
  return raw;
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: ".55rem", margin: ".1rem 0 .55rem" }}>
      <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#c0c8d4", textTransform: "uppercase", letterSpacing: ".09em", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, #ebebeb, transparent)" }} />
    </div>
  );
}

// ── Update card ───────────────────────────────────────────────────────────────

function UpdateCard({
  a,
  slug,
  coach,
  onEdit,
  onDelete,
}: {
  a: AnnouncementRow;
  slug: string;
  coach: CoachSession | null;
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
  const role        = roleLabel(a.author_role ?? "");
  const isHead      = (a.author_role ?? "").includes("head");
  const att         = a.attachment ?? null;
  const attStyle    = att ? (FILE_STYLE[att.file_type] ?? FILE_STYLE["other"]) : null;

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
      {/* Row 1: avatar + name + role badge + timestamp */}
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

      {/* Row 2: category + priority chips */}
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

      {/* Coach actions */}
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

// ── Form type ─────────────────────────────────────────────────────────────────

type UForm = {
  title: string;
  body: string;
  category: string;
  priority: "normal" | "high" | "pinned";
  attachment_id: string | null;
  attachmentPreview: TeamFileRow | null;
};

const BLANK: UForm = {
  title: "", body: "", category: "team", priority: "normal",
  attachment_id: null, attachmentPreview: null,
};

// ── Main component ────────────────────────────────────────────────────────────

export default function UpdatesView({
  slug,
  initialUpdates,
  initialFiles,
  coach,
}: {
  slug: string;
  initialUpdates: AnnouncementRow[];
  initialFiles: TeamFileRow[];
  coach: CoachSession | null;
}) {
  const [items,     setItems]     = useState<AnnouncementRow[]>(initialUpdates);
  const [form,      setForm]      = useState<UForm>(BLANK);
  const [editing,   setEditing]   = useState<AnnouncementRow | null>(null);
  const [showAdd,   setShowAdd]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [filterCat, setFilterCat] = useState("all");

  const [attUploading, setAttUploading] = useState(false);
  const [attProgress,  setAttProgress]  = useState(0);
  const [attError,     setAttError]     = useState("");
  const attachInputRef = useRef<HTMLInputElement>(null);

  // ── Modal handlers ────────────────────────────────────────────────────────

  const openAdd = () => { setForm(BLANK); setError(""); setAttError(""); setShowAdd(true); };
  const openEdit = (a: AnnouncementRow) => {
    setForm({
      title:             a.title,
      body:              a.body,
      category:          a.category,
      priority:          a.priority,
      attachment_id:     a.attachment_id ?? null,
      attachmentPreview: a.attachment    ?? null,
    });
    setError(""); setAttError(""); setEditing(a);
  };
  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); setAttError(""); };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const payload: Record<string, unknown> = {
      title: form.title, body: form.body,
      category: form.category, priority: form.priority,
    };
    if (form.attachment_id) payload.attachment_id = form.attachment_id;
    const res  = await fetch(`/api/team/${slug}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to post update."); return; }
    setItems(prev => [{ ...data, attachment: form.attachmentPreview }, ...prev]);
    closeModal();
  };

  const handleEdit = async () => {
    if (!editing || !form.title.trim()) { setError("Title is required."); return; }
    setSaving(true); setError("");
    const res  = await fetch(`/api/team/${slug}/announcements/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title, body: form.body,
        category: form.category, priority: form.priority,
        attachment_id: form.attachment_id,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update."); return; }
    setItems(prev => prev.map(a =>
      a.id === editing.id
        ? { ...a, title: form.title, body: form.body, category: form.category,
            priority: form.priority, attachment_id: form.attachment_id,
            attachment: form.attachmentPreview }
        : a
    ));
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this update?")) return;
    const res = await fetch(`/api/team/${slug}/announcements/${id}`, { method: "DELETE" });
    if (res.ok) setItems(prev => prev.filter(a => a.id !== id));
  };

  // ── Attachment upload ─────────────────────────────────────────────────────

  const handleAttachmentSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachInputRef.current) attachInputRef.current.value = "";

    if (!ALLOWED_MIME.includes(file.type)) { setAttError("File type not allowed. Use PDF, PNG, JPG, DOC, or DOCX."); return; }
    if (file.size > MAX_BYTES)             { setAttError("File exceeds 25 MB limit."); return; }

    setAttUploading(true); setAttProgress(0); setAttError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploaded = await new Promise<TeamFileRow>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setAttProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          try {
            const d = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(d as TeamFileRow);
            else reject(new Error(d.error ?? `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.open("POST", `/api/team/${slug}/files/upload`);
        xhr.send(formData);
      });

      setForm(f => ({ ...f, attachment_id: uploaded.id, attachmentPreview: uploaded }));
    } catch (err: unknown) {
      setAttError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAttUploading(false);
    }
  };

  // ── Feed grouping ─────────────────────────────────────────────────────────

  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  const filtered       = filterCat === "all" ? items : items.filter(a => a.category === filterCat);
  const pinned         = filtered.filter(a => a.priority === "pinned");
  const nonPinned      = filtered.filter(a => a.priority !== "pinned");
  const todayItems     = nonPinned.filter(a => a.created_at.slice(0, 10) === today);
  const yesterdayItems = nonPinned.filter(a => a.created_at.slice(0, 10) === yesterday);
  const earlierItems   = nonPinned.filter(a => a.created_at.slice(0, 10) < yesterday);

  const isEditing   = editing !== null;
  const modalOpen   = showAdd || isEditing;
  const previewStyle = form.attachmentPreview
    ? (FILE_STYLE[form.attachmentPreview.file_type] ?? FILE_STYLE["other"])
    : null;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* ── Section header ── */}
      <div style={{ marginBottom: ".5rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Updates
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Updates
          </h2>
          {items.length > 0 && (
            <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {items.length} post{items.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar coach={coach} label="Post Update" onAdd={openAdd} />
        </div>
      </div>

      {/* ── Filter chips ── */}
      <div style={{
        display: "flex", gap: ".35rem", overflowX: "auto",
        marginBottom: ".65rem", paddingBottom: ".2rem", scrollbarWidth: "none",
      } as React.CSSProperties}>
        {FILTER_CHIPS.map(chip => {
          const active = filterCat === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setFilterCat(chip.id)}
              style={{
                flexShrink: 0, padding: ".3rem .75rem", borderRadius: 100,
                border: active ? "none" : "1px solid #e5e7eb",
                background: active ? "#0b1e3d" : "#fff",
                color: active ? "#fff" : "#6b7280",
                fontSize: ".7rem", fontWeight: 600, cursor: "pointer",
                whiteSpace: "nowrap", lineHeight: 1.4,
                transition: "background .13s ease, color .13s ease, border-color .13s ease",
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* ── Feed ── */}
      {filtered.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "2.5rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: ".65rem", opacity: .35 }}>📢</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            {filterCat === "all" ? "No updates yet" : `No ${filterCat} posts yet`}
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {coach ? "Post your first update above." : "Check back soon."}
          </div>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <SectionLabel label="📌 Pinned" />
              {pinned.map(a => <UpdateCard key={a.id} a={a} slug={slug} coach={coach} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
          {todayItems.length > 0 && (
            <>
              <SectionLabel label="Today" />
              {todayItems.map(a => <UpdateCard key={a.id} a={a} slug={slug} coach={coach} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
          {yesterdayItems.length > 0 && (
            <>
              <SectionLabel label="Yesterday" />
              {yesterdayItems.map(a => <UpdateCard key={a.id} a={a} slug={slug} coach={coach} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
          {earlierItems.length > 0 && (
            <>
              <SectionLabel label="Earlier" />
              {earlierItems.map(a => <UpdateCard key={a.id} a={a} slug={slug} coach={coach} onEdit={openEdit} onDelete={handleDelete} />)}
            </>
          )}
        </>
      )}

      {/* ── Standalone files section ── */}
      <div style={{ marginTop: "1.75rem" }}>
        <FilesView slug={slug} initialFiles={initialFiles} coach={coach} />
      </div>

      {/* ── Composer modal ── */}
      {modalOpen && (
        <Modal title={isEditing ? "Edit Update" : "Post Update"} onClose={closeModal}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <label style={lbl}>
              Title *
              <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Bus departs at 6:45am" autoFocus />
            </label>
            <label style={lbl}>
              Message
              <textarea style={{ ...inp, minHeight: 80, resize: "vertical" } as React.CSSProperties} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} placeholder="Optional details…" />
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
                <select style={inp} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as UForm["priority"] }))}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="pinned">Pinned</option>
                </select>
              </label>
            </div>

            {/* Attachment */}
            <div>
              <div style={{ fontSize: ".72rem", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".4rem" }}>
                Attachment
              </div>
              {form.attachmentPreview && previewStyle ? (
                <div style={{ display: "flex", alignItems: "center", gap: ".55rem", padding: ".6rem .75rem", background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: previewStyle.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".9rem", flexShrink: 0 }}>
                    {previewStyle.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: ".82rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {form.attachmentPreview.name}
                    </div>
                    <div style={{ fontSize: ".65rem", color: "#9ca3af" }}>{formatSize(form.attachmentPreview.size_bytes)}</div>
                  </div>
                  <button
                    onClick={() => setForm(f => ({ ...f, attachment_id: null, attachmentPreview: null }))}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".75rem", color: "#9ca3af", padding: ".25rem", lineHeight: 1, flexShrink: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ) : attUploading ? (
                <div style={{ background: "#f8f9fb", border: "1px solid #e5e7eb", borderRadius: 10, padding: ".65rem .75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".35rem" }}>
                    <span style={{ fontSize: ".75rem", fontWeight: 600, color: "#374151" }}>Uploading…</span>
                    <span style={{ fontSize: ".7rem", color: "#6b7280" }}>{attProgress}%</span>
                  </div>
                  <div style={{ background: "#e5e7eb", borderRadius: 100, height: 5, overflow: "hidden" }}>
                    <div style={{ background: "linear-gradient(90deg, #0b1e3d, #1e4d7b)", height: "100%", width: `${attProgress}%`, borderRadius: 100, transition: "width .1s" }} />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setAttError(""); attachInputRef.current?.click(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: ".4rem",
                    padding: ".55rem .75rem", background: "#f8f9fb",
                    border: "1.5px dashed #d1d5db", borderRadius: 10,
                    cursor: "pointer", fontSize: ".78rem", fontWeight: 600,
                    color: "#6b7280", width: "100%", justifyContent: "center",
                    transition: "border-color .12s, background .12s",
                  }}
                >
                  📎 Attach a file
                </button>
              )}
              {attError && <p style={{ margin: ".3rem 0 0", color: "#dc2626", fontSize: ".75rem" }}>{attError}</p>}
              <input
                ref={attachInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                style={{ display: "none" }}
                onChange={handleAttachmentSelect}
              />
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
              <button
                onClick={isEditing ? handleEdit : handleAdd}
                disabled={saving || attUploading}
                style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: (saving || attUploading) ? "not-allowed" : "pointer", opacity: (saving || attUploading) ? .7 : 1 }}
              >
                {saving ? "Posting…" : isEditing ? "Save Changes" : "Post Update"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
