"use client";

import { useState } from "react";
import Modal from "../_components/Modal";
import { TASK_AUDIENCES, TASK_AUDIENCE_LABELS, TASK_LIMITS, type TaskAudience } from "@/lib/teamTasks";

// Create / edit a To-Do task (Head Coach). Validation here is only for
// quick feedback — the API (validateTaskInput + team-file ownership check)
// is the authority. Inputs use a 16px font so iOS doesn't zoom on focus.

type Attachment = { id: string; name: string; file_type: "pdf" | "image" | "doc"; size_bytes: number };

export type EditableTask = {
  id: string;
  title: string;
  instructions: string | null;
  body_text: string | null;
  audience: string;
  version: number;
  resources: { kind: "link" | "file"; url: string | null; attachment_id: string | null; label: string | null; attachment: Attachment | null }[];
};

type LinkDraft = { key: number; url: string; label: string };

const inp: React.CSSProperties = {
  padding: ".55rem .75rem", border: "1.5px solid #e5e7eb", borderRadius: 9, fontSize: "1rem",
  width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff", minHeight: 44,
};
const lbl: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: ".3rem", fontSize: ".72rem", fontWeight: 700,
  color: "#374151", textTransform: "uppercase", letterSpacing: ".05em",
};
const smallBtn: React.CSSProperties = {
  minHeight: 40, padding: ".35rem .7rem", background: "#f3f4f6", color: "#0b1e3d", border: "none",
  borderRadius: 8, fontSize: ".78rem", fontWeight: 700, cursor: "pointer",
};
const removeBtn: React.CSSProperties = {
  minHeight: 40, minWidth: 40, background: "none", border: "none", cursor: "pointer",
  color: "#dc2626", fontSize: ".75rem", fontWeight: 700, flexShrink: 0,
};

let nextKey = 1;

export default function TaskFormModal({
  slug, task, onClose, onSaved,
}: {
  slug: string;
  task: EditableTask | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [audience, setAudience] = useState<TaskAudience | "">(
    (TASK_AUDIENCES as readonly string[]).includes(task?.audience ?? "") ? (task!.audience as TaskAudience) : "",
  );
  const [instructions, setInstructions] = useState(task?.instructions ?? "");
  const [bodyText, setBodyText] = useState(task?.body_text ?? "");
  const [links, setLinks] = useState<LinkDraft[]>(
    (task?.resources ?? []).filter(r => r.kind === "link").map(r => ({ key: nextKey++, url: r.url ?? "", label: r.label ?? "" })),
  );
  const [files, setFiles] = useState<Attachment[]>(
    (task?.resources ?? []).filter(r => r.kind === "file" && r.attachment).map(r => r.attachment!),
  );
  const [teamFiles, setTeamFiles] = useState<Attachment[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addFile = (f: Attachment) => setFiles(prev => (prev.some(p => p.id === f.id) ? prev : [...prev, f]));
  const tooMany = links.length + files.length >= TASK_LIMITS.resources;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      // Same Head-Coach-only team-file upload Clearance uses (private storage).
      const res = await fetch(`/api/team/${slug}/clearance/upload`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Upload failed."); return; }
      addFile(data.file);
    } catch {
      setError("Network error uploading file.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const openPicker = async () => {
    setPickerOpen(true);
    if (teamFiles) return;
    try {
      const res = await fetch(`/api/team/${slug}/todo/files`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Couldn't load team files."); setPickerOpen(false); return; }
      setTeamFiles(data.files ?? []);
    } catch {
      setError("Network error loading team files.");
      setPickerOpen(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (!title.trim()) { setError("Title is required."); return; }
    if (!audience) { setError("Choose who the task is for."); return; }
    if (links.some(l => !l.url.trim())) { setError("Enter a web address for each link, or remove the empty link."); return; }

    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        audience,
        instructions: instructions.trim() || null,
        body_text: bodyText.trim() || null,
        resources: [
          ...links.map(l => ({ kind: "link", url: l.url.trim(), label: l.label.trim() || null })),
          ...files.map(f => ({ kind: "file", attachment_id: f.id })),
        ],
        ...(task ? { expected_version: task.version } : {}),
      };
      const res = await fetch(
        task ? `/api/team/${slug}/todo/tasks/${task.id}` : `/api/team/${slug}/todo/tasks`,
        { method: task ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? "Failed to save task."); return; }
      onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const unattachedTeamFiles = (teamFiles ?? []).filter(f => !files.some(p => p.id === f.id));

  return (
    <Modal title={task ? "Edit Task" : "Create Task"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".9rem" }}>
        <label style={lbl}>
          Title *
          <input style={inp} value={title} maxLength={TASK_LIMITS.title} onChange={e => setTitle(e.target.value)} placeholder="Turn in physical form" autoFocus />
        </label>

        <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
          <legend style={{ ...lbl, marginBottom: ".35rem" }}>Who is this for? *</legend>
          <div role="radiogroup" style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
            {TASK_AUDIENCES.map(a => (
              <label
                key={a}
                style={{
                  display: "inline-flex", alignItems: "center", gap: ".4rem", minHeight: 44, padding: "0 .8rem",
                  borderRadius: 9, cursor: "pointer", fontSize: ".85rem", fontWeight: 600,
                  border: audience === a ? "1.5px solid #0b1e3d" : "1.5px solid #e5e7eb",
                  background: audience === a ? "#eef2ff" : "#fff", color: "#0b1e3d",
                }}
              >
                <input type="radio" name="task-audience" value={a} checked={audience === a} onChange={() => setAudience(a)} />
                {TASK_AUDIENCE_LABELS[a]}
              </label>
            ))}
          </div>
        </fieldset>

        <label style={lbl}>
          Instructions
          <textarea
            style={{ ...inp, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
            value={instructions}
            maxLength={TASK_LIMITS.instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="What needs to be done, and by when."
          />
        </label>

        <label style={lbl}>
          Details (optional)
          <textarea
            style={{ ...inp, minHeight: 80, resize: "vertical", fontFamily: "inherit" }}
            value={bodyText}
            maxLength={TASK_LIMITS.body}
            onChange={e => setBodyText(e.target.value)}
            placeholder="Any longer text families should read, e.g. a code of conduct."
          />
        </label>

        <div style={lbl}>
          Links
          {links.map(l => (
            <div key={l.key} style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", alignItems: "center" }}>
              <input
                style={{ ...inp, flex: "2 1 12rem", minWidth: 0 }}
                value={l.url}
                inputMode="url"
                aria-label="Link web address"
                placeholder="https://"
                onChange={e => setLinks(prev => prev.map(p => (p.key === l.key ? { ...p, url: e.target.value } : p)))}
              />
              <input
                style={{ ...inp, flex: "1 1 8rem", minWidth: 0 }}
                value={l.label}
                maxLength={TASK_LIMITS.label}
                aria-label="Link label (optional)"
                placeholder="Label (optional)"
                onChange={e => setLinks(prev => prev.map(p => (p.key === l.key ? { ...p, label: e.target.value } : p)))}
              />
              <button type="button" style={removeBtn} aria-label="Remove link" onClick={() => setLinks(prev => prev.filter(p => p.key !== l.key))}>
                Remove
              </button>
            </div>
          ))}
          <div>
            <button type="button" style={smallBtn} disabled={tooMany} onClick={() => setLinks(prev => [...prev, { key: nextKey++, url: "", label: "" }])}>
              + Add Link
            </button>
          </div>
        </div>

        <div style={lbl}>
          Documents
          {files.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 9, padding: ".2rem .2rem .2rem .65rem" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: ".82rem", fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.name}
              </span>
              <button type="button" style={removeBtn} aria-label={`Remove ${f.name}`} onClick={() => setFiles(prev => prev.filter(p => p.id !== f.id))}>
                Remove
              </button>
            </div>
          ))}
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", alignItems: "center" }}>
            <label style={{ ...smallBtn, position: "relative", display: "inline-flex", alignItems: "center", textTransform: "none", letterSpacing: 0, opacity: uploading || tooMany ? .6 : 1 }}>
              {uploading ? "Uploading…" : "Upload Document"}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={handleUpload} disabled={uploading || tooMany} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
            </label>
            <button type="button" style={smallBtn} disabled={tooMany} onClick={openPicker}>Choose Team File</button>
          </div>
          {pickerOpen && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 9, maxHeight: 220, overflowY: "auto", background: "#fff", textTransform: "none", letterSpacing: 0 }}>
              {teamFiles === null ? (
                <p style={{ margin: 0, padding: ".6rem .75rem", fontSize: ".8rem", fontWeight: 500, color: "#6b7280" }}>Loading…</p>
              ) : unattachedTeamFiles.length === 0 ? (
                <p style={{ margin: 0, padding: ".6rem .75rem", fontSize: ".8rem", fontWeight: 500, color: "#6b7280" }}>No other team files.</p>
              ) : unattachedTeamFiles.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { addFile(f); setPickerOpen(false); }}
                  style={{ display: "block", width: "100%", minHeight: 44, textAlign: "left", padding: ".5rem .75rem", background: "none", border: "none", borderBottom: "1px solid #f3f4f6", cursor: "pointer", fontSize: ".85rem", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p role="alert" style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{error}</p>}

        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} style={{ ...smallBtn, minHeight: 44, padding: ".5rem 1rem", color: "#374151" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || uploading}
            style={{ ...smallBtn, minHeight: 44, padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", opacity: saving || uploading ? .7 : 1, cursor: saving || uploading ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving…" : task ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
