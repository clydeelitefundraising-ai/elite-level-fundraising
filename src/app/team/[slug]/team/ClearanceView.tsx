"use client";

import { useEffect, useState } from "react";
import Modal from "../_components/Modal";

type Attachment = { id: string; name: string; file_type: "pdf" | "image" | "doc"; size_bytes: number };

type ClearanceResource = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  attachment_id: string | null;
  attachment: Attachment | null;
  sort_order: number;
  created_at: string;
};

const inp: React.CSSProperties = {
  padding: ".5rem .75rem",
  border: "1.5px solid #e5e7eb",
  borderRadius: 9,
  // 16px minimum — iOS WebKit auto-zooms the viewport when focusing a form
  // control smaller than this (Phase 8).
  fontSize: "1rem",
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

function ResourceCard({
  resource, slug, canManage, isFirst, isLast, onEdit, onDeleted, onReordered,
}: {
  resource: ClearanceResource;
  slug: string;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (r: ClearanceResource) => void;
  onDeleted: () => void;
  onReordered: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Remove "${resource.title}" from Clearance? This does not delete an uploaded file — just this listing.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/team/${slug}/clearance/${resource.id}`, { method: "DELETE" });
      if (res.ok) onDeleted();
      else { const data = await res.json().catch(() => ({})); alert(data.error ?? "Failed to delete resource."); }
    } finally {
      setBusy(false);
    }
  };

  const move = async (direction: "up" | "down") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/team/${slug}/clearance/${resource.id}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      });
      if (res.ok) onReordered();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      background: "#fff", borderRadius: 12, padding: ".9rem 1rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
    }}>
      <div style={{ fontWeight: 700, fontSize: ".92rem", color: "#0b1e3d", marginBottom: resource.description ? ".2rem" : ".5rem" }}>
        {resource.title}
      </div>
      {resource.description && (
        <p style={{ margin: "0 0 .55rem", fontSize: ".8rem", color: "#6b7280", lineHeight: 1.5 }}>
          {resource.description}
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginTop: ".3rem" }}>
        {resource.url && (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: ".4rem .75rem", background: "#0b1e3d", color: "#fff", borderRadius: 8, fontSize: ".78rem", fontWeight: 700, textDecoration: "none" }}
          >
            Open Link
          </a>
        )}
        {resource.attachment && (
          <a
            href={`/api/team/${slug}/files/${resource.attachment.id}`}
            style={{ padding: ".4rem .75rem", background: "#f3f4f6", color: "#0b1e3d", borderRadius: 8, fontSize: ".78rem", fontWeight: 700, textDecoration: "none" }}
          >
            View/Download Attachment
          </a>
        )}
      </div>

      {canManage && (
        <div style={{ display: "flex", gap: ".4rem", marginTop: ".65rem", paddingTop: ".55rem", borderTop: "1px solid #f3f4f6" }}>
          <button disabled={busy} onClick={() => onEdit(resource)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 700, color: "#0b1e3d", padding: ".25rem .4rem" }}>
            Edit
          </button>
          <button disabled={busy || isFirst} onClick={() => move("up")} style={{ background: "none", border: "none", cursor: isFirst ? "default" : "pointer", fontSize: ".72rem", fontWeight: 700, color: isFirst ? "#d1d5db" : "#374151", padding: ".25rem .4rem" }}>
            Move Up
          </button>
          <button disabled={busy || isLast} onClick={() => move("down")} style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", fontSize: ".72rem", fontWeight: 700, color: isLast ? "#d1d5db" : "#374151", padding: ".25rem .4rem" }}>
            Move Down
          </button>
          <div style={{ flex: 1 }} />
          <button disabled={busy} onClick={handleDelete} style={{ background: "none", border: "none", cursor: "pointer", fontSize: ".72rem", fontWeight: 700, color: "#dc2626", padding: ".25rem .4rem" }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function EditModal({
  slug, resource, onClose, onSaved,
}: {
  slug: string;
  resource: ClearanceResource | null; // null = creating new
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(resource?.title ?? "");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [url, setUrl] = useState(resource?.url ?? "");
  const [attachment, setAttachment] = useState<Attachment | null>(resource?.attachment ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/team/${slug}/clearance/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Upload failed."); return; }
      setAttachment(data.file);
    } catch {
      setError("Network error uploading file.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (!title.trim()) { setError("Title is required."); return; }
    if (!url.trim() && !attachment) { setError("Provide a link, an attachment, or both."); return; }

    setSaving(true);
    try {
      const body = JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        url: url.trim() || null,
        attachment_id: attachment?.id ?? null,
      });
      const res = await fetch(
        resource ? `/api/team/${slug}/clearance/${resource.id}` : `/api/team/${slug}/clearance`,
        { method: resource ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body },
      );
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save resource."); return; }
      onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={resource ? "Edit Clearance Resource" : "Add Clearance Resource"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: ".875rem" }}>
        <label style={lbl}>
          Title *
          <input style={inp} value={title} onChange={e => setTitle(e.target.value)} placeholder="Register My Athlete" autoFocus />
        </label>

        <label style={lbl}>
          Description
          <textarea
            style={{ ...inp, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Complete athlete registration before the first official practice."
          />
        </label>

        <label style={lbl}>
          Link
          <input style={inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://registermyathlete.com/..." />
        </label>

        <div style={lbl}>
          Attachment
          {attachment ? (
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 9, padding: ".5rem .65rem" }}>
              <span style={{ flex: 1, fontSize: ".8rem", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {attachment.name}
              </span>
              <button type="button" onClick={() => setAttachment(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: ".72rem", fontWeight: 700 }}>
                Remove
              </button>
            </div>
          ) : (
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={handleFileChange} disabled={uploading} style={{ fontSize: ".8rem" }} />
          )}
          {uploading && <div style={{ fontSize: ".75rem", color: "#6b7280" }}>Uploading…</div>}
        </div>

        {error && <p style={{ margin: 0, color: "#dc2626", fontSize: ".8rem" }}>{error}</p>}

        <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: ".5rem 1rem", background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving || uploading} style={{ padding: ".5rem 1rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".85rem", fontWeight: 600, cursor: (saving || uploading) ? "not-allowed" : "pointer", opacity: (saving || uploading) ? .7 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Phase 7: Clearance resource library. Everyone on the team can view; only
// the Head Coach sees Add/Edit/Delete/Move controls (also enforced
// server-side in every /api/team/[slug]/clearance* route — this UI gate is
// a convenience, not the authorization boundary).
export default function ClearanceView({ slug }: { slug: string }) {
  const [resources, setResources] = useState<ClearanceResource[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editTarget, setEditTarget] = useState<ClearanceResource | null | "new">(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/team/${slug}/clearance`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to load Clearance resources."); return; }
      setError("");
      setResources(data.resources ?? []);
      setCanManage(!!data.canManage);
    } catch {
      setError("Network error loading Clearance resources.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <div style={{ marginBottom: ".65rem", display: "flex", alignItems: "center", gap: ".5rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
          Clearance
        </h2>
        <div style={{ flex: 1 }} />
        {canManage && (
          <button
            onClick={() => setEditTarget("new")}
            style={{ padding: ".45rem .85rem", background: "#0b1e3d", color: "#fff", border: "none", borderRadius: 9, fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}
          >
            + Add Resource
          </button>
        )}
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>
        Registration links, forms, and required documents for the team.
      </p>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: ".55rem .75rem", color: "#dc2626", fontSize: ".82rem", marginBottom: ".65rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem 0", color: "#9ca3af", fontSize: ".85rem" }}>Loading…</div>
      ) : resources.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 14, padding: "2rem 1.5rem", textAlign: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        }}>
          <p style={{ margin: 0, fontSize: ".85rem", color: "#9ca3af" }}>
            No Clearance resources yet.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {resources.map((r, i) => (
            <ResourceCard
              key={r.id}
              resource={r}
              slug={slug}
              canManage={canManage}
              isFirst={i === 0}
              isLast={i === resources.length - 1}
              onEdit={setEditTarget}
              onDeleted={load}
              onReordered={load}
            />
          ))}
        </div>
      )}

      {editTarget !== null && (
        <EditModal
          slug={slug}
          resource={editTarget === "new" ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
    </div>
  );
}
