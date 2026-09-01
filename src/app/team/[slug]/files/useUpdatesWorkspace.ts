"use client";

import { useState } from "react";
import type { AnnouncementRow, TeamFileRow } from "@/lib/teamData";
import { isStaff, isHeadCoach, type TeamActor } from "@/lib/permissions";

// D5: the announcement array, filter state, Add/Edit form state, upload
// state, and every CRUD/upload handler previously owned directly inside
// UpdatesView.tsx (verbatim logic, only relocated) — extracted into a hook
// so BOTH the existing mobile presentation (UpdatesView.tsx, unmodified in
// behavior) and the new desktop workspace (DesktopUpdatesView.tsx) can
// share ONE authoritative Updates workflow instead of two independent
// copies, exactly as D3's useAthleteRoster.ts and D4's
// useCalendarWorkspace.ts did before it. No behavior change: every field/
// function name, request shape, and state transition is identical to what
// UpdatesView.tsx did inline before D5.
//
// attachInputRef intentionally does NOT live here (unlike everything
// else) — it stays local to AnnouncementFormModal.tsx, the only component
// that ever needs it. Bundling a ref into a hook's returned state object
// trips eslint-plugin-react-hooks' "refs" rule on every property access
// off that object (hit and fixed the same way in D4's
// useCalendarWorkspace.ts) — every consumer of this hook (mobile view,
// desktop view, the modal) reads plain state/handlers off it, so no ref
// belongs in this bag.

// ── Constants ─────────────────────────────────────────────────────────────────

export const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const MAX_BYTES = 25 * 1024 * 1024;

export type RecipientScope = "everyone" | "athletes" | "parents" | "boosters" | "athlete_specific";

export const SCOPE_OPTIONS: { value: RecipientScope; label: string }[] = [
  { value: "everyone",        label: "Everyone"         },
  { value: "athletes",        label: "Athletes"         },
  { value: "parents",         label: "Parents"          },
  { value: "boosters",        label: "Boosters"         },
  { value: "athlete_specific", label: "Specific Athlete" },
];

export const SCOPE_LABELS: Record<RecipientScope, string> = {
  everyone:        "Everyone",
  athletes:        "Athletes",
  parents:         "Parents",
  boosters:        "Boosters",
  athlete_specific: "Specific Athlete",
};

// ── Form type ─────────────────────────────────────────────────────────────────

export type UForm = {
  title: string;
  body: string;
  category: string;
  priority: "normal" | "high" | "pinned";
  recipient_scope: RecipientScope;
  recipient_athlete_id: string | null;
  push_enabled: boolean;
  attachment_id: string | null;
  attachmentPreview: TeamFileRow | null;
};

export const BLANK_UPDATE_FORM: UForm = {
  title: "", body: "", category: "team", priority: "normal",
  recipient_scope: "everyone", recipient_athlete_id: null,
  push_enabled: true,
  attachment_id: null, attachmentPreview: null,
};

export function useUpdatesWorkspace(
  slug: string,
  initialUpdates: AnnouncementRow[],
  actor: TeamActor,
) {
  const canEdit   = isStaff(actor);
  const canDelete = isHeadCoach(actor);
  const [items,     setItems]     = useState<AnnouncementRow[]>(initialUpdates);
  const [form,      setForm]      = useState<UForm>(BLANK_UPDATE_FORM);
  const [editing,   setEditing]   = useState<AnnouncementRow | null>(null);
  const [showAdd,   setShowAdd]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  const [filterCat, setFilterCat] = useState("all");

  const [attUploading, setAttUploading] = useState(false);
  const [attProgress,  setAttProgress]  = useState(0);
  const [attError,     setAttError]     = useState("");

  // ── Modal handlers ────────────────────────────────────────────────────────

  const openAdd = () => { setForm(BLANK_UPDATE_FORM); setError(""); setAttError(""); setShowAdd(true); };
  const openEdit = (a: AnnouncementRow) => {
    setForm({
      title:                a.title,
      body:                 a.body,
      category:             a.category,
      priority:             a.priority,
      recipient_scope:      (a.recipient_scope ?? "everyone") as RecipientScope,
      recipient_athlete_id: a.recipient_athlete_id ?? null,
      push_enabled:         true,
      attachment_id:        a.attachment_id ?? null,
      attachmentPreview:    a.attachment    ?? null,
    });
    setError(""); setAttError(""); setEditing(a);
  };
  const closeModal = () => { setShowAdd(false); setEditing(null); setError(""); setAttError(""); };

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!form.title.trim()) { setError("Title is required."); return; }
    if (form.recipient_scope === "athlete_specific" && !form.recipient_athlete_id) {
      setError("Please select a specific athlete."); return;
    }
    setSaving(true); setError("");
    const payload: Record<string, unknown> = {
      title:                form.title,
      body:                 form.body,
      category:             form.category,
      priority:             form.priority,
      recipient_scope:      form.recipient_scope,
      recipient_athlete_id: form.recipient_athlete_id,
      push_enabled:         form.push_enabled,
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
  //
  // Takes the selected File directly (not the change event) — resetting
  // the <input>'s value is the caller's responsibility, since the ref onto
  // that input lives in AnnouncementFormModal.tsx, not here (see the
  // module-level comment above for why).

  const handleAttachmentSelect = async (file: File | null) => {
    if (!file) return;

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

  const clearAttachment = () => setForm(f => ({ ...f, attachment_id: null, attachmentPreview: null }));

  // ── Feed grouping ─────────────────────────────────────────────────────────
  //
  // Computed once per mount via a useState lazy initializer (not inline in
  // the render body, and not useMemo — the "purity" rule still flags an
  // impure call inside a useMemo factory) — new Date()/Date.now() are
  // impure calls that eslint-plugin-react-hooks' "purity" rule flags when
  // made directly during render (the same class of finding D4 hit and
  // fixed for its ref usage). This is the same one-time-impure-computation
  // idiom already established by useCalendarWorkspace.ts's
  // `useState<MonthKey>(() => monthKeyFromISO(arizonaTodayISO()))`. Same
  // day-bucket semantics as before: a session left open across midnight
  // without remounting simply keeps grouping by the day it was opened,
  // exactly as harmless in practice as the original per-render computation
  // was.
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
  const modalOpen = showAdd || isEditing;

  return {
    slug, canEdit, canDelete,
    items, filterCat, setFilterCat,
    filtered, pinned, todayItems, yesterdayItems, earlierItems,
    form, setForm, editing, showAdd, saving, error,
    attUploading, attProgress, attError,
    isEditing, modalOpen,
    openAdd, openEdit, closeModal,
    handleAdd, handleEdit, handleDelete,
    handleAttachmentSelect, clearAttachment,
  };
}

export type UpdatesWorkspaceState = ReturnType<typeof useUpdatesWorkspace>;
