"use client";

import { useRef, useState } from "react";
import type { TeamFileRow } from "@/lib/teamData";
import type { CoachSession } from "@/lib/teamSession";
import CoachBar from "../_components/CoachBar";
import Modal from "../_components/Modal";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_BYTES = 25 * 1024 * 1024;

const FILE_STYLE: Record<string, { bg: string; color: string; icon: string }> = {
  pdf:   { bg: "#fee2e2", color: "#dc2626", icon: "📄" },
  image: { bg: "#dbeafe", color: "#1d4ed8", icon: "🖼️" },
  doc:   { bg: "#ede9fe", color: "#6d28d9", icon: "📝" },
  other: { bg: "#f3f4f6", color: "#374151", icon: "📎" },
};

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1_024)     return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FilesView({
  slug,
  initialFiles,
  coach,
}: {
  slug: string;
  initialFiles: TeamFileRow[];
  coach: CoachSession | null;
}) {
  const [files,       setFiles]       = useState<TeamFileRow[]>(initialFiles);
  const [uploading,   setUploading]   = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [editing,     setEditing]     = useState<TeamFileRow | null>(null);
  const [editName,    setEditName]    = useState("");
  const [editSaving,  setEditSaving]  = useState(false);
  const [editError,   setEditError]   = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload ──

  const openUpload = () => { setUploadError(""); fileInputRef.current?.click(); };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!ALLOWED_MIME.includes(file.type)) {
      setUploadError("File type not allowed. Use PDF, PNG, JPG, DOC, or DOCX.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError("File exceeds 25 MB limit.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setUploadError("");

    try {
      // 1 — Get signed upload URL
      const signRes = await fetch(`/api/team/${slug}/files/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) throw new Error(signData.error ?? "Failed to start upload.");
      const { signedUploadUrl, storagePath, fileType } = signData as {
        signedUploadUrl: string;
        storagePath: string;
        fileType: string;
      };

      // 2 — Upload directly to Supabase Storage with progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.open("PUT", signedUploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      // 3 — Save metadata
      const metaRes = await fetch(`/api/team/${slug}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, storagePath, fileType, sizeBytes: file.size }),
      });
      const metaData = await metaRes.json();
      if (!metaRes.ok) throw new Error(metaData.error ?? "File uploaded but record save failed.");

      setFiles(prev => [metaData as TeamFileRow, ...prev]);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // ── Rename ──

  const openEdit  = (f: TeamFileRow) => { setEditing(f); setEditName(f.name); setEditError(""); };
  const closeEdit = () => { setEditing(null); setEditError(""); };

  const handleRename = async () => {
    if (!editing || !editName.trim()) { setEditError("Name is required."); return; }
    setEditSaving(true); setEditError("");
    const res  = await fetch(`/api/team/${slug}/files/${editing.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    const data = await res.json();
    setEditSaving(false);
    if (!res.ok) { setEditError(data.error ?? "Failed to rename."); return; }
    setFiles(prev => prev.map(f => f.id === editing.id ? { ...f, name: editName.trim() } : f));
    closeEdit();
  };

  // ── Delete ──

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    const res = await fetch(`/api/team/${slug}/files/${id}`, { method: "DELETE" });
    if (res.ok) setFiles(prev => prev.filter(f => f.id !== id));
  };

  // ── Render ──

  return (
    <>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".75rem" }}>
        <h2 style={{ margin: 0, fontSize: ".72rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".07em" }}>
          Files · {files.length} attachment{files.length !== 1 ? "s" : ""}
        </h2>
        <CoachBar coach={coach} label="Upload File" onAdd={openUpload} />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* Upload progress bar */}
      {uploading && (
        <div style={{ background: "#fff", borderRadius: 12, padding: "1rem 1.1rem", border: "1px solid #e5e7eb", marginBottom: ".875rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" }}>
            <span style={{ fontSize: ".82rem", color: "#374151", fontWeight: 600 }}>Uploading…</span>
            <span style={{ fontSize: ".78rem", color: "#6b7280" }}>{progress}%</span>
          </div>
          <div style={{ background: "#f3f4f6", borderRadius: 100, height: 6, overflow: "hidden" }}>
            <div style={{ background: "#0b1e3d", borderRadius: 100, height: "100%", width: `${progress}%`, transition: "width .1s ease" }} />
          </div>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <p style={{ margin: "0 0 .75rem", color: "#dc2626", fontSize: ".82rem" }}>{uploadError}</p>
      )}

      {/* File list */}
      {files.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: "2rem 1.25rem", textAlign: "center", color: "#9ca3af", fontSize: ".9rem", border: "1px solid #f0f0f0" }}>
          No files uploaded yet.
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: "1px solid #f0f0f0" }}>
          {files.map((file, i) => {
            const s    = FILE_STYLE[file.file_type] ?? FILE_STYLE["other"];
            const size = formatSize(file.size_bytes);
            return (
              <div key={file.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: ".875rem 1.1rem", borderBottom: i < files.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                {/* Icon */}
                <span style={{ fontSize: "1.5rem", flexShrink: 0, width: 36, textAlign: "center" }}>{s.icon}</span>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: ".9rem", color: "#111827", marginBottom: ".2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap" }}>
                    <span style={{ padding: ".1rem .45rem", borderRadius: 100, fontSize: ".6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", background: s.bg, color: s.color }}>
                      {file.file_type}
                    </span>
                    {size && <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>{size}</span>}
                    <span style={{ fontSize: ".72rem", color: "#9ca3af" }}>
                      {file.uploaded_by} · {formatDate(file.created_at)}
                    </span>
                  </div>
                  {coach && (
                    <div style={{ display: "flex", gap: ".35rem", marginTop: ".35rem" }}>
                      <button onClick={() => openEdit(file)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, color: "#6b7280", padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>
                        Rename
                      </button>
                      {coach.role === "head_coach" && (
                        <button onClick={() => handleDelete(file.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 600, color: "#dc2626", padding: 0, textDecoration: "underline", textUnderlineOffset: 2 }}>
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Download — routes through API to generate a signed URL */}
                <a
                  href={`/api/team/${slug}/files/${file.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flexShrink: 0, padding: ".4rem .8rem", background: "#f3f4f6", color: "#374151", borderRadius: 8, fontSize: ".78rem", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  Download
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Rename modal */}
      {editing && (
        <Modal title="Rename File" onClose={closeEdit}>
          <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
            <label style={lbl}>
              File Name *
              <input style={inp} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
            </label>
            {editError && <p style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{editError}</p>}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeEdit} style={{ padding: ".45rem .9rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleRename} disabled={editSaving} style={{ padding: ".45rem .9rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 8, fontSize: ".85rem", fontWeight: 600, cursor: editSaving ? "not-allowed" : "pointer", opacity: editSaving ? .7 : 1 }}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
