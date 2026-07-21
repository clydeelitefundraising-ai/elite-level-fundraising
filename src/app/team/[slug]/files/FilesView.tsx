"use client";

import { useRef, useState } from "react";
import type { TeamFileRow } from "@/lib/teamData";
import { isStaff, isHeadCoach, type TeamActor } from "@/lib/permissions";
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
  actor,
}: {
  slug: string;
  initialFiles: TeamFileRow[];
  actor: TeamActor;
}) {
  const canUpload = isStaff(actor);
  const canDelete = isHeadCoach(actor);
  const [files,        setFiles]        = useState<TeamFileRow[]>(initialFiles);
  const [uploading,    setUploading]    = useState(false);
  const [uploadFile,   setUploadFile]   = useState("");
  const [progress,     setProgress]     = useState(0);
  const [uploadError,  setUploadError]  = useState("");
  const [dragOver,     setDragOver]     = useState(false);
  const [editing,      setEditing]      = useState<TeamFileRow | null>(null);
  const [editName,     setEditName]     = useState("");
  const [editSaving,   setEditSaving]   = useState(false);
  const [editError,    setEditError]    = useState("");
  const [hoveredId,    setHoveredId]    = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload ──

  const openUpload = () => { setUploadError(""); fileInputRef.current?.click(); };

  const processUpload = async (file: File) => {
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
    setUploadFile(file.name);
    setUploadError("");

    try {
      const form = new FormData();
      form.append("file", file);

      // XHR to our own API (same origin) — no CORS, progress tracking works
      const newFile = await new Promise<TeamFileRow>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data as TeamFileRow);
            else reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload."));
        xhr.open("POST", `/api/team/${slug}/files/upload`);
        xhr.send(form);
      });

      setFiles(prev => [newFile, ...prev]);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadFile("");
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    await processUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processUpload(file);
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
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      {/* ── Section header ── */}
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* Upload zone — staff only */}
      {canUpload && !uploading && (
        <div
          onClick={openUpload}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? "#0b1e3d" : "#d1d5db"}`,
            borderRadius: 12,
            padding: "1.5rem 1rem",
            textAlign: "center",
            cursor: "pointer",
            background: dragOver ? "#f0f4ff" : "#fafafa",
            marginBottom: ".75rem",
            transition: "all .15s ease",
          }}
        >
          <div style={{ fontSize: "1.5rem", marginBottom: ".35rem", opacity: dragOver ? 1 : .5 }}>☁️</div>
          <div style={{ fontSize: ".82rem", fontWeight: 700, color: dragOver ? "#0b1e3d" : "#6b7280" }}>
            {dragOver ? "Drop to upload" : "Tap to upload"}
          </div>
          <div style={{ fontSize: ".68rem", color: "#9ca3af", marginTop: ".2rem" }}>
            PDF, PNG, JPG, DOC · max 25 MB
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div style={{ background: "#fff", borderRadius: 12, padding: ".875rem 1rem", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)", marginBottom: ".75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".45rem" }}>
            <span style={{ fontSize: ".78rem", fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
              {uploadFile || "Uploading…"}
            </span>
            <span style={{ fontSize: ".72rem", color: "#6b7280", flexShrink: 0 }}>{progress}%</span>
          </div>
          <div style={{ background: "#f3f4f6", borderRadius: 100, height: 8, overflow: "hidden" }}>
            <div style={{
              background: "linear-gradient(90deg, #0b1e3d, #1e4d7b)",
              borderRadius: 100,
              height: "100%",
              width: `${progress}%`,
              transition: "width .1s ease",
            }} />
          </div>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <p style={{ margin: "0 0 .75rem", padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
          {uploadError}
        </p>
      )}

      {/* File list */}
      {files.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "3rem 1.5rem",
          textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <div style={{ fontSize: "2.25rem", marginBottom: ".75rem", opacity: .3 }}>📎</div>
          <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#374151", marginBottom: ".3rem" }}>
            No files uploaded yet
          </div>
          <div style={{ fontSize: ".8rem", color: "#9ca3af" }}>
            {canUpload ? "Upload your first file above." : "Files coming soon."}
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
                {/* Colored icon circle */}
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
                  {s.icon}
                </div>

                {/* Info */}
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
                        onClick={() => openEdit(file)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#b0b7c3", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
                      >
                        Rename
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(file.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".67rem", fontWeight: 600, color: "#fca5a5", padding: ".1rem .35rem", borderRadius: 5, lineHeight: 1.4 }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Download — navy pill */}
                <a
                  href={`/api/team/${slug}/files/${file.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flexShrink: 0,
                    padding: ".35rem .7rem",
                    background: hovered ? "#1e4d7b" : "#0b1e3d",
                    color: "#fff",
                    borderRadius: 8,
                    fontSize: ".72rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    letterSpacing: ".01em",
                    transition: "background .13s ease",
                  }}
                >
                  ↓ Download
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
            {editError && (
              <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
                {editError}
              </p>
            )}
            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", paddingTop: ".25rem" }}>
              <button onClick={closeEdit} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleRename} disabled={editSaving} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: editSaving ? "not-allowed" : "pointer", opacity: editSaving ? .7 : 1 }}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
