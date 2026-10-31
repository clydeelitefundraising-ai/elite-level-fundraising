"use client";

import { useState } from "react";
import {
  Megaphone, Pin, AlertTriangle, Eye, ChevronUp, ChevronDown, ThumbsUp, MessageCircle, Paperclip, UploadCloud,
} from "lucide-react";
import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import { staffRoleLabel } from "@/lib/permissions";
import CoachBar from "@/app/team/[slug]/_components/CoachBar";
import Avatar from "@/app/team/[slug]/messages/_shared/Avatar";
import AnnouncementFormModal from "@/app/team/[slug]/files/AnnouncementFormModal";
import { CATEGORY_STYLE, FILE_STYLE, FILTER_CHIPS, SectionLabel, formatSize } from "@/app/team/[slug]/files/UpdateCard";
import { BLANK_UPDATE_FORM, SCOPE_LABELS, type RecipientScope, type UForm, type UpdatesWorkspaceState } from "@/app/team/[slug]/files/useUpdatesWorkspace";
import { DEMO_ROSTER, DEMO_SLUG } from "./demoData";
import {
  addComment, commentAuthor, deleteAnnouncement, deleteComment, editAnnouncement, likeStatus, postAnnouncement, toggleLike,
  visibleComments, type DemoPerson, type DemoStore,
} from "./commsData";
import { isVisibleToDemoRole } from "./demoData";
import type { DemoRole } from "./demoProtocol";

// Communications → Updates (and Team Files beneath it), as the Team App
// renders them on a phone, with fictional data held in the demo's store.
//
//   reused as-is  AnnouncementFormModal (Post/Edit Update — driven entirely
//                 by the workspace object below), SectionLabel, FILTER_CHIPS,
//                 CATEGORY_STYLE, FILE_STYLE, formatSize, SCOPE_LABELS,
//                 BLANK_UPDATE_FORM, CoachBar, Avatar
//   twins         UpdatesView, UpdateCard, LikeButton, CommentsSection,
//                 ReadReceiptPanel, FilesView — each of the real ones calls
//                 the API (seen receipts, likes, comments, read receipts,
//                 reports, uploads, downloads). Markup and styles are copied;
//                 teamAppDemo.test.ts checks they stay in step.
//
// Every save happens only in this browser tab and is announced with a
// "Preview only" notice.

type Notify = (message?: string) => void;
type SetStore = (fn: (s: DemoStore) => DemoStore) => void;

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60)     return "just now";
  if (sec < 3600)   return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)  return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
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

// ── Workspace (the shape AnnouncementFormModal and UpdatesView consume) ────

export function useDemoUpdatesWorkspace({ store, setStore, role, me, canEdit, canDelete, notify }: {
  store: DemoStore; setStore: SetStore; role: DemoRole; me: DemoPerson; canEdit: boolean; canDelete: boolean; notify: Notify;
}): UpdatesWorkspaceState {
  const [form, setForm] = useState<UForm>(BLANK_UPDATE_FORM);
  const [editing, setEditing] = useState<AnnouncementRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  const items = store.announcements.filter(a => isVisibleToDemoRole(a, role));
  const openAdd = () => { setForm(BLANK_UPDATE_FORM); setError(""); setShowAdd(true); };
  const openEdit = (a: AnnouncementRow) => {
    setForm({
      title: a.title, body: a.body, category: a.category, priority: a.priority,
      recipient_scope: (a.recipient_scope ?? "everyone") as RecipientScope,
      recipient_athlete_id: a.recipient_athlete_id ?? null, push_enabled: true,
      attachment_id: null, attachmentPreview: null,
    });
    setError(""); setEditing(a);
  };
  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); };
  const draft = () => ({
    title: form.title.trim(), body: form.body, category: form.category, priority: form.priority,
    recipient_scope: form.recipient_scope, recipient_athlete_id: form.recipient_scope === "athlete_specific" ? form.recipient_athlete_id : null,
  });
  const validate = () => {
    if (!form.title.trim()) { setError("Title is required."); return false; }
    if (form.recipient_scope === "athlete_specific" && !form.recipient_athlete_id) { setError("Please select a specific athlete."); return false; }
    return true;
  };
  const handleAdd = async () => {
    if (!validate()) return;
    setStore(s => postAnnouncement(s, me, draft(), new Date().toISOString()));
    closeModal();
    notify(`Preview only — posted in this demo, nothing was sent${form.push_enabled ? " and no notification went out" : ""}.`);
  };
  const handleEdit = async () => {
    if (!editing || !validate()) return;
    const target = editing.id;
    setStore(s => editAnnouncement(s, target, draft()));
    closeModal();
    notify("Preview only — the update was changed in this demo only.");
  };
  const handleDelete = async (announcementId: string) => {
    setStore(s => deleteAnnouncement(s, announcementId));
    notify("Preview only — removed from this demo. Reset demo to bring it back.");
  };
  const handleAttachmentSelect = async () => { notify("Preview only — attachments aren't uploaded in the demo."); };

  const [{ today, yesterday }] = useState(() => ({
    today:     new Date().toISOString().slice(0, 10),
    yesterday: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  }));
  const filtered       = filterCat === "all" ? items : items.filter(a => a.category === filterCat);
  const pinned         = filtered.filter(a => a.priority === "pinned");
  const nonPinned      = filtered.filter(a => a.priority !== "pinned");
  const todayItems     = nonPinned.filter(a => a.created_at.slice(0, 10) === today);
  const yesterdayItems = nonPinned.filter(a => a.created_at.slice(0, 10) === yesterday);
  const earlierItems   = nonPinned.filter(a => a.created_at.slice(0, 10) < yesterday);
  const isEditing = editing !== null;

  return {
    slug: DEMO_SLUG, canEdit, canDelete,
    items, filterCat, setFilterCat,
    filtered, pinned, todayItems, yesterdayItems, earlierItems,
    form, setForm, editing, showAdd, saving: false, error,
    attUploading: false, attProgress: 0, attError: "",
    isEditing, modalOpen: showAdd || isEditing,
    openAdd, openEdit, closeModal,
    handleAdd, handleEdit, handleDelete,
    handleAttachmentSelect, clearAttachment: () => setForm(f => ({ ...f, attachment_id: null, attachmentPreview: null })),
  } as UpdatesWorkspaceState;
}

// ── Updates section ─────────────────────────────────────────────────────────

type CardCtx = { store: DemoStore; setStore: SetStore; me: DemoPerson; notify: Notify };

export function DemoUpdatesSection({ workspace, ctx }: { workspace: UpdatesWorkspaceState; ctx: CardCtx }) {
  return (
    <>
      <DemoUpdatesView workspace={workspace} ctx={ctx} />
      <AnnouncementFormModal workspace={workspace} athletes={DEMO_ROSTER.map(a => ({ id: a.id, name: a.name }))} />
      <div style={{ marginTop: "1.75rem" }}>
        <DemoFilesView files={ctx.store.files} canUpload={workspace.canEdit} canDelete={workspace.canDelete} notify={ctx.notify} />
      </div>
    </>
  );
}

// Twin of files/UpdatesView.tsx (mobile Updates presentation).
function DemoUpdatesView({ workspace, ctx }: { workspace: UpdatesWorkspaceState; ctx: CardCtx }) {
  const {
    canEdit, canDelete,
    items, filterCat, setFilterCat,
    filtered, pinned, todayItems, yesterdayItems, earlierItems,
    openAdd, openEdit, handleDelete,
  } = workspace;
  const card = (a: AnnouncementRow) => <DemoUpdateCard key={a.id} a={a} canEdit={canEdit} canDelete={canDelete} onEdit={openEdit} onDelete={handleDelete} ctx={ctx} />;

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".5rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Updates
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "var(--text-primary-app)", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Updates
          </h2>
          {items.length > 0 && (
            <span style={{ background: "var(--surface-light-elevated)", color: "var(--text-muted-app)", borderRadius: "var(--radius-full)", fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {items.length} post{items.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={canEdit} label="Post Update" onAdd={openAdd} />
        </div>
      </div>

      <div style={{
        display: "flex", gap: ".35rem", overflowX: "auto",
        marginBottom: ".65rem", paddingBottom: ".2rem", scrollbarWidth: "none",
        WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent 100%)",
        maskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent 100%)",
      } as React.CSSProperties}>
        {FILTER_CHIPS.map(chip => {
          const active = filterCat === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setFilterCat(chip.id)}
              className="elf-focus-ring"
              style={{
                flexShrink: 0, padding: ".3rem .75rem", borderRadius: "var(--radius-full)",
                border: active ? "none" : "1px solid var(--border-app)",
                background: active ? "var(--team-primary)" : "var(--surface-light)",
                color: active ? "var(--team-primary-foreground)" : "var(--text-muted-app)",
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

      {filtered.length === 0 ? (
        <div style={{
          background: "var(--surface-light)", borderRadius: "var(--radius-md)", padding: "2.5rem 1.5rem",
          textAlign: "center", border: "1px solid var(--border-app)",
        }}>
          <Megaphone size={26} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--text-muted-app)", opacity: .5, marginBottom: ".65rem" }} />
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--text-primary-app)", marginBottom: ".3rem" }}>
            {filterCat === "all" ? "No updates yet" : `No ${filterCat} posts yet`}
          </div>
          <div style={{ fontSize: ".8rem", color: "var(--text-muted-app)" }}>
            {canEdit ? "Post your first update above." : "Check back soon."}
          </div>
        </div>
      ) : (
        <>
          {pinned.length > 0 && (<><SectionLabel label="Pinned" icon={Pin} />{pinned.map(card)}</>)}
          {todayItems.length > 0 && (<><SectionLabel label="Today" />{todayItems.map(card)}</>)}
          {yesterdayItems.length > 0 && (<><SectionLabel label="Yesterday" />{yesterdayItems.map(card)}</>)}
          {earlierItems.length > 0 && (<><SectionLabel label="Earlier" />{earlierItems.map(card)}</>)}
        </>
      )}
    </div>
  );
}

// Twin of files/UpdateCard.tsx's UpdateCard — without useSeenTracker,
// and with the API-backed parts (read receipts, likes, comments, reports)
// answered from the demo store.
function DemoUpdateCard({
  a, canEdit, canDelete, onEdit, onDelete, ctx,
}: {
  a: AnnouncementRow; canEdit: boolean; canDelete: boolean;
  onEdit: (a: AnnouncementRow) => void; onDelete: (id: string) => void; ctx: CardCtx;
}) {
  const cat         = CATEGORY_STYLE[a.category] ?? CATEGORY_STYLE["team"];
  const isPinned    = a.priority === "pinned";
  const isHigh      = a.priority === "high";
  const accentColor = isPinned ? "#6366f1" : isHigh ? "#dc2626" : cat.accent;
  const rowBg       = isPinned ? "#faf8ff" : isHigh ? "#fff9f8" : "transparent";
  const role        = staffRoleLabel(a.author_role ?? "");
  const isHead      = (a.author_role ?? "").includes("head");
  const scope       = a.recipient_scope ?? "everyone";

  return (
    <div
      id={`update-${a.id}`}
      style={{
        background: rowBg,
        borderLeft: `3px solid ${accentColor}`,
        borderBottom: "1px solid var(--border-app)",
        padding: ".75rem .85rem .75rem .75rem",
        boxShadow: "none",
        transition: "box-shadow .3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".35rem" }}>
        <Avatar name={a.author_name} photoUrl={a.author_photo_url} size={28} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: ".3rem" }}>
          <span style={{ fontWeight: 700, fontSize: ".84rem", color: "var(--text-primary-app)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {a.author_name}
          </span>
          {role && (
            <span style={{
              padding: ".06rem .34rem", borderRadius: "var(--radius-sm)", fontSize: ".52rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: ".04em",
              background: isHead ? "#dbeafe" : "var(--surface-light-elevated)",
              color:      isHead ? "#1d4ed8" : "var(--text-muted-app)",
              flexShrink: 0, whiteSpace: "nowrap",
            }}>
              {role}
            </span>
          )}
        </div>
        <span style={{ fontSize: ".66rem", color: "var(--text-muted-app)", flexShrink: 0 }}>{relativeTime(a.created_at)}</span>
      </div>

      <div style={{ display: "flex", gap: ".28rem", marginBottom: ".42rem", flexWrap: "wrap" }}>
        <span style={{ padding: ".07rem .38rem", borderRadius: "var(--radius-sm)", fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: cat.bg, color: cat.color }}>
          {a.category.replace("-", " ")}
        </span>
        {isPinned && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: ".2rem", padding: ".07rem .38rem", borderRadius: "var(--radius-sm)", fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#ede9fe", color: "#4338ca" }}>
            <Pin size={9} aria-hidden="true" />
            Pinned
          </span>
        )}
        {isHigh && !isPinned && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: ".2rem", padding: ".07rem .38rem", borderRadius: "var(--radius-sm)", fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#fee2e2", color: "#dc2626" }}>
            <AlertTriangle size={9} aria-hidden="true" />
            Important
          </span>
        )}
        {canEdit && scope !== "everyone" && (
          <span style={{ padding: ".07rem .38rem", borderRadius: "var(--radius-sm)", fontSize: ".53rem", fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", background: "#ecfdf5", color: "#065f46" }}>
            → {SCOPE_LABELS[scope as RecipientScope] ?? scope}
          </span>
        )}
      </div>

      <p style={{ margin: "0 0 .22rem", fontWeight: 700, fontSize: ".95rem", color: "var(--text-primary-app)", lineHeight: 1.3 }}>
        {a.title}
      </p>

      {a.body && (
        <p style={{ margin: 0, fontSize: ".82rem", color: "var(--text-muted-app)", lineHeight: 1.62 }}>
          {a.body}
        </p>
      )}

      {!canEdit && (
        <div style={{ marginTop: ".38rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => ctx.notify("Preview only — in the real app, reports go to the team's coaches and ELF.")}
            className="elf-focus-ring"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".64rem", fontWeight: 600, color: "var(--text-muted-app)", padding: 0 }}
          >
            Report
          </button>
        </div>
      )}

      {canEdit && (
        <div style={{ marginTop: ".38rem" }}>
          <div style={{ display: "flex", gap: ".15rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => onEdit(a)}
              className="elf-focus-ring"
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "var(--text-muted-app)", padding: ".1rem .35rem", borderRadius: "var(--radius-sm)", lineHeight: 1.4 }}
            >
              Edit
            </button>
            {canDelete && (
              <button
                onClick={() => onDelete(a.id)}
                className="elf-focus-ring"
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#dc2626", padding: ".1rem .35rem", borderRadius: "var(--radius-sm)", lineHeight: 1.4 }}
              >
                Delete
              </button>
            )}
          </div>
          <DemoReadReceiptPanel a={a} ctx={ctx} />
        </div>
      )}

      <DemoCommentsSection
        announcementId={a.id}
        leadingSlot={<DemoLikeButton announcementId={a.id} ctx={ctx} />}
        canModerate={canDelete}
        ctx={ctx}
      />
    </div>
  );
}

// Twin of UpdateCard.tsx's ReadReceiptPanel — "Check Seen" (staff only),
// answered with the demo's fictional readers.
function DemoReadReceiptPanel({ a, ctx }: { a: AnnouncementRow; ctx: CardCtx }) {
  const [open, setOpen] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const names = ctx.store.engagement.seen[a.id] ?? [];
  const total = a.recipient_scope === "parents" ? 2 : a.recipient_scope === "athletes" ? 3 : 5;
  const reads = names.slice(0, total).map((name, i) => ({ name, read_at: new Date(openedAt - (i + 1) * 7 * 60_000).toISOString() }));
  const data = { reads, total_targeted: total };
  const readCount = data.reads.length;

  return (
    <div style={{ marginTop: ".3rem" }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: ".66rem", fontWeight: 600, color: "var(--text-muted-app)", padding: 0, lineHeight: 1.4,
          display: "flex", alignItems: "center", gap: ".25rem",
        }}
      >
        <Eye size={12} aria-hidden="true" />
        {open ? `${readCount} / ${data.total_targeted} Seen` : "Check Seen"}
        {open
          ? <ChevronUp size={11} aria-hidden="true" style={{ opacity: .6 }} />
          : <ChevronDown size={11} aria-hidden="true" style={{ opacity: .6 }} />}
      </button>

      {open && (
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
                <li key={r.name} style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
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

// Twin of files/LikeButton.tsx.
function DemoLikeButton({ announcementId, ctx }: { announcementId: string; ctx: CardCtx }) {
  const status = likeStatus(ctx.store, announcementId, ctx.me.key);
  return (
    <button
      onClick={() => ctx.setStore(s => toggleLike(s, announcementId, ctx.me.key))}
      aria-pressed={status.liked_by_me}
      className="elf-focus-ring"
      style={{
        display: "inline-flex", alignItems: "center", gap: ".3rem",
        background: "none", border: "none", padding: 0,
        cursor: "pointer",
        fontSize: ".78rem", fontWeight: 700,
        color: status.liked_by_me ? "var(--team-primary)" : "var(--text-muted-app)",
      }}
    >
      <ThumbsUp
        size={13}
        aria-hidden="true"
        fill={status.liked_by_me ? "var(--team-primary)" : "none"}
        strokeWidth={2}
      />
      {status.count > 0 ? status.count : "Like"}
    </button>
  );
}

const ROLE_LABELS: Record<string, string> = {
  head_coach: "Head Coach", assistant_coach: "Asst. Coach", booster: "Booster",
  athlete: "Athlete", parent: "Parent",
};
const MAX_LENGTH = 1000;
const COLLAPSED_COUNT = 2;

// Twin of files/CommentsSection.tsx. A Head Coach's comment publishes
// immediately; anyone else's shows "Awaiting approval" to its author only.
function DemoCommentsSection({
  announcementId, leadingSlot, canModerate = false, ctx,
}: {
  announcementId: string; leadingSlot?: React.ReactNode; canModerate?: boolean; ctx: CardCtx;
}) {
  const [body, setBody] = useState("");
  const [expanded, setExpanded] = useState(false);
  const list = visibleComments(ctx.store.engagement, announcementId, ctx.me.key);
  const approvedCount = list.filter(c => c.status === "approved").length;
  const visible = expanded ? list : list.slice(-COLLAPSED_COUNT);
  const hiddenCount = list.length - visible.length;

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    ctx.setStore(s => addComment(s, announcementId, ctx.me, trimmed, new Date().toISOString()));
    setBody("");
    setExpanded(true);
    ctx.notify(ctx.me.role === "head_coach"
      ? "Preview only — your comment shows in this demo; nothing was sent."
      : "Preview only — in the real app a coach approves comments before the team sees them.");
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
          {visible.map(c => {
            const author = commentAuthor(c);
            const isOwn = c.authorKey === ctx.me.key;
            return (
              <div key={c.id} style={{ display: "flex", gap: ".5rem", alignItems: "flex-start" }}>
                <Avatar name={author.name} photoUrl={null} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: ".35rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: ".78rem", fontWeight: 700, color: "var(--text-primary-app)" }}>{author.name}</span>
                    {ROLE_LABELS[author.role] && (
                      <span style={{ fontSize: ".6rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".03em" }}>
                        {ROLE_LABELS[author.role]}
                      </span>
                    )}
                    <span style={{ fontSize: ".64rem", color: "var(--text-muted-app)" }}>{relativeTime(c.created_at)}</span>
                    {c.status === "pending" && (
                      <span style={{ fontSize: ".6rem", fontWeight: 700, color: "#b45309", background: "#fef3c7", borderRadius: "var(--radius-full)", padding: ".05rem .4rem" }}>
                        Awaiting approval
                      </span>
                    )}
                  </div>
                  <p style={{ margin: ".1rem 0 0", fontSize: ".8rem", color: "var(--text-muted-app)", lineHeight: 1.5, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                    {c.body}
                  </p>
                  <div style={{ display: "flex", gap: ".7rem", marginTop: ".15rem" }}>
                    {(isOwn || canModerate) && (
                      <button
                        onClick={() => { ctx.setStore(s => deleteComment(s, c.id)); ctx.notify("Preview only — removed from this demo."); }}
                        className="elf-focus-ring"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: ".64rem", fontWeight: 600, color: "#dc2626" }}
                      >
                        {isOwn ? "Delete" : "Remove (moderation)"}
                      </button>
                    )}
                    {!isOwn && (
                      <button
                        onClick={() => ctx.notify("Preview only — in the real app, reports go to the team's coaches and ELF.")}
                        className="elf-focus-ring"
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: ".64rem", fontWeight: 600, color: "var(--text-muted-app)" }}
                      >
                        Report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
          disabled={!body.trim()}
          aria-label="Post comment"
          className="elf-focus-ring"
          style={{
            padding: ".5rem .8rem", borderRadius: "var(--radius-md)", border: "none",
            background: !body.trim() ? "var(--surface-light-elevated)" : "var(--team-primary)",
            color: !body.trim() ? "var(--text-muted-app)" : "var(--team-primary-foreground)",
            fontSize: ".78rem", fontWeight: 700,
            cursor: !body.trim() ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          Post
        </button>
      </div>
    </div>
  );
}

// ── Team Files (twin of files/FilesView.tsx's list) ─────────────────────────

const PREVIEWABLE_TYPES = new Set(["pdf", "image"]);

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function DemoFilesView({ files, canUpload, canDelete, notify }: { files: TeamFileRow[]; canUpload: boolean; canDelete: boolean; notify: Notify }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const previewOnly = () => notify("Preview only — the sample files aren't real documents.");
  const openUpload = () => notify("Preview only — uploads are turned off in the demo.");

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".65rem" }}>
        <span style={{ fontSize: ".58rem", fontWeight: 700, color: "#b0b7c3", textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: ".1rem" }}>
          Documents
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            Team Files
          </h2>
          {files.length > 0 && (
            <span style={{ background: "#f0f4ff", color: "#1d4ed8", borderRadius: 100, fontSize: ".58rem", fontWeight: 700, padding: ".13rem .48rem", lineHeight: 1.4 }}>
              {files.length} file{files.length !== 1 ? "s" : ""}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <CoachBar show={canUpload} label="Upload File" onAdd={openUpload} />
        </div>
      </div>

      {canUpload && (
        <div
          onClick={openUpload}
          style={{
            border: `2px dashed ${"#d1d5db"}`,
            borderRadius: 12,
            padding: "1.5rem 1rem",
            textAlign: "center",
            cursor: "pointer",
            background: "#fafafa",
            marginBottom: ".75rem",
            transition: "all .15s ease",
          }}
        >
          <div style={{ marginBottom: ".35rem", opacity: .5, display: "flex", justifyContent: "center" }}><UploadCloud size={24} strokeWidth={2} aria-hidden="true" /></div>
          <div style={{ fontSize: ".82rem", fontWeight: 700, color: "#6b7280" }}>
            Tap to upload
          </div>
          <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".2rem" }}>
            PDF, PNG, JPG, DOC · max 25 MB
          </div>
        </div>
      )}

      {files.length === 0 ? (
        <div style={{
          display: "flex", alignItems: "center", gap: ".65rem",
          background: "#fafbfc", borderRadius: 10, padding: ".85rem 1rem",
          border: "1px solid #f0f1f3",
        }}>
          <Paperclip size={16} strokeWidth={2} color="#9ca3af" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: ".78rem", color: "#374151", textTransform: "uppercase", letterSpacing: ".04em" }}>
              No Team Files Yet
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
          {files.map((file, i) => {
            const s       = FILE_STYLE[file.file_type] ?? FILE_STYLE["other"];
            const size    = formatSize(file.size_bytes);
            const hovered = hoveredId === file.id;
            return (
              <div
                key={file.id}
                onMouseEnter={() => setHoveredId(file.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".75rem",
                  padding: ".75rem .9rem",
                  borderBottom: i < files.length - 1 ? "1px solid #f3f4f6" : "none",
                  background: hovered ? "#fafbff" : "#fff",
                  transition: "background .13s ease",
                }}
              >
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: s.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.1rem",
                  flexShrink: 0,
                  transition: "transform .13s ease",
                  transform: hovered ? "scale(1.06)" : "scale(1)",
                }}>
                  <s.icon size={18} strokeWidth={2} aria-hidden="true" style={{ color: s.color }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: ".18rem" }}>
                    {file.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap" }}>
                    <span style={{ padding: ".05rem .38rem", borderRadius: 100, fontSize: ".55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: s.bg, color: s.color, flexShrink: 0 }}>
                      {file.file_type}
                    </span>
                    {size && <span style={{ fontSize: ".68rem", color: "#9ca3af" }}>{size}</span>}
                  </div>
                  <div style={{ fontSize: ".65rem", color: "#9ca3af", marginTop: ".1rem" }}>
                    {file.uploaded_by} · {formatDate(file.created_at)}
                  </div>
                  {canUpload && (
                    <div style={{ display: "flex", gap: ".1rem", marginTop: ".2rem" }}>
                      <button
                        onClick={previewOnly}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
                      >
                        Rename
                      </button>
                      {canDelete && (
                        <button
                          onClick={previewOnly}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: ".35rem", flexShrink: 0 }}>
                  {PREVIEWABLE_TYPES.has(file.file_type) && (
                    <button
                      onClick={previewOnly}
                      style={{
                        padding: ".35rem .6rem",
                        background: "#f3f4f6",
                        color: "#374151",
                        border: "none",
                        borderRadius: 8,
                        fontSize: ".72rem",
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >
                      View
                    </button>
                  )}
                  <button
                    onClick={previewOnly}
                    style={{
                      padding: ".35rem .7rem",
                      background: "var(--team-primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: ".72rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      letterSpacing: ".01em",
                      transition: "background .13s ease",
                      cursor: "pointer",
                      opacity: 1,
                    }}
                  >
                    ↓ Download
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
