"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "../_components/Modal";
import { downloadViaFetch, fetchFileBlob } from "../_components/fileDownload";
import { TASK_AUDIENCE_LABELS, type TaskAudience, type TaskViewer } from "@/lib/teamTasks";
import ClearanceView from "./ClearanceView";
import TaskFormModal, { type EditableTask } from "./TaskFormModal";

// Team Management Phase 2: the "To-Do List" tab (internal tab id is still
// "clearance"). Head-Coach-managed tasks on top; the existing Clearance
// resource library, unchanged, below as "Resources".
//
// Phase 2 deliberately shows NO acknowledgment checkboxes and NO
// complete/incomplete indicators — those arrive with Phase 3, and showing
// them earlier would be misleading.
//
// Every permission shown here is a convenience only; each
// /api/team/[slug]/todo/* route enforces it server-side.

type Attachment = { id: string; name: string; file_type: "pdf" | "image" | "doc"; size_bytes: number };

type TaskResource = {
  id: string;
  kind: "link" | "file";
  url: string | null;
  attachment_id: string | null;
  label: string | null;
  attachment: Attachment | null;
};

export type TaskItem = Omit<EditableTask, "resources"> & {
  status: "active" | "archived";
  revision: number;
  resources: TaskResource[];
};

type TaskListResponse = {
  available: boolean;
  tasks: TaskItem[];
  canManage: boolean;
  viewer: TaskViewer;
};

const PREVIEWABLE_TYPES = new Set(["pdf", "image"]);

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 40, padding: ".4rem .8rem", borderRadius: 8, border: "none",
  fontSize: ".8rem", fontWeight: 700, cursor: "pointer", textDecoration: "none",
};
const primaryBtn: React.CSSProperties = { ...btn, background: "#0b1e3d", color: "#fff" };
const softBtn: React.CSSProperties = { ...btn, background: "#f3f4f6", color: "#0b1e3d" };
const actionBtn: React.CSSProperties = {
  ...btn, minHeight: 40, padding: ".3rem .55rem", background: "none", color: "#374151", fontSize: ".75rem",
};

function linkText(r: TaskResource): string {
  if (r.label) return r.label;
  try {
    return new URL(r.url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}

async function fetchTaskList(slug: string, archived: boolean): Promise<TaskListResponse> {
  const res = await fetch(`/api/team/${slug}/todo/tasks${archived ? "?status=archived" : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to load tasks.");
  return data as TaskListResponse;
}

function TaskCard({
  task, slug, canManage, isFirst, isLast, onEdit, onChanged, onView, onDownload, downloadingId,
}: {
  task: TaskItem;
  slug: string;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: (t: TaskItem) => void;
  onChanged: () => void;
  onView: (a: Attachment) => void;
  onDownload: (a: Attachment) => void;
  downloadingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = task.status === "archived";
  const hasMore = !!task.body_text || (task.instructions?.length ?? 0) > 180;

  const post = async (path: string, body: unknown, failMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/team/${slug}/todo/tasks/${task.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) onChanged();
      else { const data = await res.json().catch(() => ({})); alert(data.error ?? failMsg); }
    } finally {
      setBusy(false);
    }
  };

  const archive = () => {
    if (!confirm(`Archive "${task.title}"? It will be hidden from athletes and parents. You can restore it from Archived Tasks.`)) return;
    void post("archive", { archived: true }, "Failed to archive task.");
  };

  return (
    <article style={{
      background: "#fff", borderRadius: 12, padding: ".9rem 1rem",
      boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
      opacity: archived ? .85 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: ".5rem", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0, flex: "1 1 12rem", minWidth: 0, fontWeight: 700, fontSize: ".95rem", color: "#0b1e3d", overflowWrap: "anywhere" }}>
          {task.title}
        </h4>
        <span style={{ flexShrink: 0, fontSize: ".68rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: 6, background: "#eef2ff", color: "#3730a3" }}>
          {TASK_AUDIENCE_LABELS[task.audience as TaskAudience] ?? task.audience}
        </span>
      </div>

      {task.instructions && (
        <p style={{
          margin: ".4rem 0 0", fontSize: ".84rem", color: "#4b5563", lineHeight: 1.5,
          whiteSpace: "pre-wrap", overflowWrap: "anywhere",
          ...(expanded ? {} : { display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }),
        }}>
          {task.instructions}
        </p>
      )}
      {expanded && task.body_text && (
        <div style={{ marginTop: ".5rem", padding: ".6rem .7rem", background: "#f9fafb", borderRadius: 8, fontSize: ".84rem", color: "#374151", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {task.body_text}
        </div>
      )}
      {hasMore && (
        <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} style={{ ...actionBtn, padding: ".2rem 0", color: "#0b1e3d" }}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}

      {task.resources.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".45rem", marginTop: ".6rem" }}>
          {task.resources.map(r => r.kind === "link" ? (
            <a key={r.id} href={r.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {linkText(r)} ↗
            </a>
          ) : r.attachment ? (
            <span key={r.id} style={{ display: "inline-flex", gap: ".3rem", maxWidth: "100%", flexWrap: "wrap" }}>
              {PREVIEWABLE_TYPES.has(r.attachment.file_type) && (
                <button type="button" onClick={() => onView(r.attachment!)} style={{ ...softBtn, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  View {r.label || r.attachment.name}
                </button>
              )}
              <button
                type="button"
                onClick={() => onDownload(r.attachment!)}
                disabled={downloadingId === r.attachment.id}
                style={{ ...softBtn, opacity: downloadingId === r.attachment.id ? .7 : 1 }}
                aria-label={`Download ${r.label || r.attachment.name}`}
              >
                {downloadingId === r.attachment.id ? "Downloading…" : PREVIEWABLE_TYPES.has(r.attachment.file_type) ? "Download" : `Download ${r.label || r.attachment.name}`}
              </button>
            </span>
          ) : null)}
        </div>
      )}

      {canManage && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".15rem", marginTop: ".6rem", paddingTop: ".4rem", borderTop: "1px solid #f3f4f6" }}>
          {archived ? (
            <button type="button" disabled={busy} onClick={() => post("archive", { archived: false }, "Failed to restore task.")} style={{ ...actionBtn, color: "#0b1e3d" }}>
              Restore
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => onEdit(task)} style={{ ...actionBtn, color: "#0b1e3d" }}>Edit</button>
              <button type="button" disabled={busy || isFirst} onClick={() => post("move", { direction: "up" }, "Failed to move task.")} aria-label={`Move ${task.title} up`} style={{ ...actionBtn, color: isFirst ? "#d1d5db" : "#374151" }}>
                Move Up
              </button>
              <button type="button" disabled={busy || isLast} onClick={() => post("move", { direction: "down" }, "Failed to move task.")} aria-label={`Move ${task.title} down`} style={{ ...actionBtn, color: isLast ? "#d1d5db" : "#374151" }}>
                Move Down
              </button>
              <div style={{ flex: 1 }} />
              <button type="button" disabled={busy} onClick={archive} style={{ ...actionBtn, color: "#b45309" }}>Archive</button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

export default function TodoListView({ slug }: { slug: string }) {
  const [data, setData] = useState<TaskListResponse | null>(null);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState<TaskItem[] | null>(null);
  const [archivedError, setArchivedError] = useState("");
  const [editTarget, setEditTarget] = useState<TaskItem | "new" | null>(null);

  const [viewing, setViewing] = useState<Attachment | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewError, setViewError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchTaskList(slug, false)
      .then(d => { setData(d); setError(""); })
      .catch((e: Error) => setError(e.message));
  }, [slug]);

  const refreshArchived = useCallback(() => {
    fetchTaskList(slug, true)
      .then(d => { setArchived(d.tasks); setArchivedError(""); })
      .catch((e: Error) => setArchivedError(e.message));
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    fetchTaskList(slug, false)
      .then(d => { if (!cancelled) { setData(d); setError(""); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [slug]);

  const afterChange = () => {
    refresh();
    if (showArchived) refreshArchived();
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    if (next) refreshArchived();
  };

  const openView = async (a: Attachment) => {
    setViewing(a);
    setViewUrl(null);
    setViewError("");
    try {
      const { blob } = await fetchFileBlob(`/api/team/${slug}/files/${a.id}?mode=view`);
      setViewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setViewError(err instanceof Error ? err.message : "Failed to load preview.");
    }
  };

  const closeView = () => {
    if (viewUrl) URL.revokeObjectURL(viewUrl);
    setViewing(null);
    setViewUrl(null);
    setViewError("");
  };

  const download = async (a: Attachment) => {
    setDownloadingId(a.id);
    try {
      await downloadViaFetch(`/api/team/${slug}/files/${a.id}`, a.name);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  };

  const canManage = !!data?.canManage;
  const viewer = data?.viewer;
  // Boosters keep Resources only. Before the task tables exist, only the
  // Head Coach sees a short "not set up yet" note; everyone else just sees
  // Resources, exactly as before.
  const showTasks = !!data && viewer !== "booster" && viewer !== "none" && (data.available || canManage);
  const tasks = data?.tasks ?? [];
  const isCoachView = viewer === "manager" || viewer === "coach";

  return (
    <div style={{ animation: "elf-fadeUp .22s ease both" }}>
      <h2 style={{ margin: "0 0 .2rem", fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
        To-Do List
      </h2>
      <p style={{ margin: "0 0 1rem", fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>
        {isCoachView
          ? "Tasks for athletes and parents, plus the team's forms and links."
          : "Things to complete for the team, plus forms and links."}
      </p>

      {error && (
        <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: ".55rem .75rem", color: "#dc2626", fontSize: ".82rem", marginBottom: ".65rem" }}>
          {error}
        </div>
      )}

      {showTasks && (
        <section aria-labelledby="todo-active-heading" style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginBottom: ".6rem", flexWrap: "wrap" }}>
            <h3 id="todo-active-heading" style={{ margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d" }}>
              {isCoachView ? "Active Tasks" : "Tasks"}
            </h3>
            <div style={{ flex: 1 }} />
            {canManage && data.available && (
              <button type="button" onClick={() => setEditTarget("new")} style={primaryBtn}>+ Create Task</button>
            )}
          </div>

          {!data.available ? (
            <p style={{ margin: 0, padding: ".75rem .9rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: ".82rem", color: "#92400e" }}>
              To-Do tasks aren&apos;t set up for this team yet. Resources below work as usual.
            </p>
          ) : tasks.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: 12, padding: "1.5rem 1rem", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
              <p style={{ margin: 0, fontSize: ".85rem", color: "#9ca3af" }}>
                {canManage ? "No active tasks yet. Create one to share instructions, forms and links." : "Nothing to do right now."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
              {tasks.map((t, i) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  slug={slug}
                  canManage={canManage}
                  isFirst={i === 0}
                  isLast={i === tasks.length - 1}
                  onEdit={setEditTarget}
                  onChanged={afterChange}
                  onView={openView}
                  onDownload={download}
                  downloadingId={downloadingId}
                />
              ))}
            </div>
          )}

          {canManage && data.available && (
            <div style={{ marginTop: ".9rem" }}>
              <button type="button" onClick={toggleArchived} aria-expanded={showArchived} style={{ ...softBtn, background: "none", padding: ".3rem 0", color: "#374151" }}>
                {showArchived ? "Hide Archived Tasks" : "Show Archived Tasks"}
              </button>
              {showArchived && (
                <div style={{ marginTop: ".5rem" }}>
                  <h3 style={{ margin: "0 0 .5rem", fontSize: ".9rem", fontWeight: 800, color: "#6b7280" }}>Archived Tasks</h3>
                  {archivedError ? (
                    <p role="alert" style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{archivedError}</p>
                  ) : archived === null ? (
                    <p style={{ margin: 0, color: "#9ca3af", fontSize: ".82rem" }}>Loading…</p>
                  ) : archived.length === 0 ? (
                    <p style={{ margin: 0, color: "#9ca3af", fontSize: ".82rem" }}>No archived tasks.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
                      {archived.map(t => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          slug={slug}
                          canManage={canManage}
                          isFirst
                          isLast
                          onEdit={setEditTarget}
                          onChanged={afterChange}
                          onView={openView}
                          onDownload={download}
                          downloadingId={downloadingId}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Existing Clearance resources — same component, API and permissions as before. */}
      <ClearanceView slug={slug} />

      {editTarget !== null && (
        <TaskFormModal
          slug={slug}
          task={editTarget === "new" ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); afterChange(); }}
        />
      )}

      {viewing && (
        <Modal title={viewing.name} onClose={closeView}>
          {viewError && (
            <p style={{ margin: 0, padding: ".45rem .65rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: ".82rem" }}>
              {viewError}
            </p>
          )}
          {!viewError && !viewUrl && <p style={{ textAlign: "center", color: "#6b7280", fontSize: ".85rem" }}>Loading preview…</p>}
          {!viewError && viewUrl && viewing.file_type === "image" && (
            // eslint-disable-next-line @next/next/no-img-element -- blob: URL preview, same as ClearanceView
            <img src={viewUrl} alt={viewing.name} style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }} />
          )}
          {!viewError && viewUrl && viewing.file_type === "pdf" && (
            <iframe src={viewUrl} title={viewing.name} style={{ width: "100%", height: "70vh", border: "none", borderRadius: 10 }} />
          )}
        </Modal>
      )}
    </div>
  );
}
