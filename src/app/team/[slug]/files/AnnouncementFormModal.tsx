"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import Modal from "../_components/Modal";
import { FILE_STYLE, formatSize } from "./UpdateCard";
import { SCOPE_OPTIONS, type UForm, type UpdatesWorkspaceState } from "./useUpdatesWorkspace";

// D5: the Post/Edit Update modal, extracted verbatim from UpdatesView.tsx's
// original body and rendered EXACTLY ONCE by UpdatesWorkspaceView.tsx —
// never by UpdatesView.tsx or DesktopUpdatesView.tsx individually. Modal
// renders via createPortal(document.body): a display:none ancestor (the
// mobileOnly/desktopOnly CSS toggle) does NOT hide portaled content, so if
// both presentations each rendered their own copy, an eligible desktop
// actor would see two overlapping modals — identical to D3's
// AthleteFormModal.tsx / D4's EventFormModal.tsx precedent.
//
// attachInputRef lives here (not in useUpdatesWorkspace.ts) since this is
// the only component that ever needs it — see that hook's module comment.

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid var(--border-app)",
  borderRadius: "var(--radius-md)",
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
  fontSize: "1rem",
  width: "100%",
  boxSizing: "border-box",
  color: "var(--text-primary-app)",
  background: "var(--surface-light)",
};

const lbl: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: ".3rem",
  fontSize: ".72rem",
  fontWeight: 700,
  color: "var(--text-muted-app)",
  textTransform: "uppercase",
  letterSpacing: ".05em",
};

export default function AnnouncementFormModal({
  workspace,
  athletes,
}: {
  workspace: UpdatesWorkspaceState;
  athletes: { id: string; name: string }[];
}) {
  const {
    isEditing, modalOpen, saving, error, form, setForm,
    attUploading, attProgress, attError,
    closeModal, handleAdd, handleEdit, handleAttachmentSelect, clearAttachment,
  } = workspace;

  const attachInputRef = useRef<HTMLInputElement>(null);

  if (!modalOpen) return null;

  const previewStyle = form.attachmentPreview
    ? (FILE_STYLE[form.attachmentPreview.file_type] ?? FILE_STYLE["other"])
    : null;

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (attachInputRef.current) attachInputRef.current.value = "";
    await handleAttachmentSelect(file);
  };

  return (
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

        {/* ── Recipient scope — only shown when composing, not editing ── */}
        {!isEditing && (
          <div>
            <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".45rem" }}>
              Send To
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".3rem" }}>
              {SCOPE_OPTIONS.map(opt => {
                const active = form.recipient_scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      recipient_scope:      opt.value,
                      recipient_athlete_id: opt.value !== "athlete_specific" ? null : f.recipient_athlete_id,
                    }))}
                    className="elf-focus-ring"
                    style={{
                      padding: ".3rem .7rem", borderRadius: "var(--radius-full)",
                      border: active ? "none" : "1.5px solid var(--border-app)",
                      background: active ? "var(--team-primary)" : "var(--surface-light)",
                      color: active ? "var(--team-primary-foreground)" : "var(--text-muted-app)",
                      fontSize: ".75rem", fontWeight: 600,
                      cursor: "pointer", lineHeight: 1.4,
                      transition: "background .12s, color .12s",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {form.recipient_scope === "athlete_specific" && (
              <div style={{ marginTop: ".5rem" }}>
                <select
                  style={{ ...inp, marginTop: ".2rem" }}
                  value={form.recipient_athlete_id ?? ""}
                  onChange={e => setForm(f => ({ ...f, recipient_athlete_id: e.target.value || null }))}
                >
                  <option value="">— Select an athlete —</option>
                  {athletes.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Push toggle */}
            <label style={{ display: "flex", alignItems: "center", gap: ".5rem", marginTop: ".55rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={form.push_enabled}
                onChange={e => setForm(f => ({ ...f, push_enabled: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <span style={{ fontSize: ".78rem", color: "var(--text-muted-app)", fontWeight: 600 }}>
                Send push notification
              </span>
            </label>
          </div>
        )}

        {/* Attachment */}
        <div>
          <div style={{ fontSize: ".72rem", fontWeight: 700, color: "var(--text-muted-app)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: ".4rem" }}>
            Attachment
          </div>
          {form.attachmentPreview && previewStyle ? (
            <div style={{ display: "flex", alignItems: "center", gap: ".55rem", padding: ".6rem .75rem", background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)", borderRadius: "var(--radius-md)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "var(--radius-sm)", background: previewStyle.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <previewStyle.icon size={15} aria-hidden="true" style={{ color: previewStyle.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: ".82rem", color: "var(--text-primary-app)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {form.attachmentPreview.name}
                </div>
                <div style={{ fontSize: ".65rem", color: "var(--text-muted-app)" }}>{formatSize(form.attachmentPreview.size_bytes)}</div>
              </div>
              <button
                onClick={clearAttachment}
                className="elf-focus-ring"
                aria-label="Remove attachment"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted-app)", padding: ".25rem", lineHeight: 1, flexShrink: 0 }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ) : attUploading ? (
            <div style={{ background: "var(--surface-light-elevated)", border: "1px solid var(--border-app)", borderRadius: "var(--radius-md)", padding: ".65rem .75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: ".35rem" }}>
                <span style={{ fontSize: ".75rem", fontWeight: 600, color: "var(--text-muted-app)" }}>Uploading…</span>
                <span style={{ fontSize: ".7rem", color: "var(--text-muted-app)" }}>{attProgress}%</span>
              </div>
              <div style={{ background: "var(--border-app)", borderRadius: "var(--radius-full)", height: 5, overflow: "hidden" }}>
                <div style={{ background: "var(--team-primary)", height: "100%", width: `${attProgress}%`, borderRadius: "var(--radius-full)", transition: "width .1s" }} />
              </div>
            </div>
          ) : (
            <button
              onClick={() => attachInputRef.current?.click()}
              className="elf-focus-ring"
              style={{
                display: "flex", alignItems: "center", gap: ".4rem",
                padding: ".55rem .75rem", background: "var(--surface-light-elevated)",
                border: "1.5px dashed var(--border-app)", borderRadius: "var(--radius-md)",
                cursor: "pointer", fontSize: ".78rem", fontWeight: 600,
                color: "var(--text-muted-app)", width: "100%", justifyContent: "center",
                transition: "border-color .12s, background .12s",
              }}
            >
              <Paperclip size={14} aria-hidden="true" />
              Attach a file
            </button>
          )}
          {attError && <p style={{ margin: ".3rem 0 0", color: "#dc2626", fontSize: ".75rem" }}>{attError}</p>}
          <input
            ref={attachInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            style={{ display: "none" }}
            onChange={onFileInputChange}
          />
        </div>

        {error && (
          <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
          <button onClick={closeModal} className="elf-focus-ring" style={{ padding: ".5rem 1rem", background: "var(--surface-light-elevated)", color: "var(--text-primary-app)", border: "none", borderRadius: "var(--radius-md)", fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={isEditing ? handleEdit : handleAdd}
            disabled={saving || attUploading}
            className="elf-focus-ring"
            style={{ padding: ".5rem 1rem", background: "var(--team-primary)", color: "var(--team-primary-foreground)", border: "none", borderRadius: "var(--radius-md)", fontSize: ".85rem", fontWeight: 600, cursor: (saving || attUploading) ? "not-allowed" : "pointer", opacity: (saving || attUploading) ? .7 : 1 }}
          >
            {saving ? "Posting…" : isEditing ? "Save Changes" : "Post Update"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
