"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../_components/Modal";
import { downloadViaFetch, fetchFileBlob } from "../_components/fileDownload";
import { TASK_AUDIENCE_LABELS, type TaskAudience, type TaskViewer } from "@/lib/teamTasks";
import ClearanceView from "./ClearanceView";
import TaskFormModal, { type EditableTask } from "./TaskFormModal";
import styles from "./Team.module.css";

// Team Management Phase 2: the "To-Do List" tab (internal tab id is still
// "clearance"). Head-Coach-managed tasks on top as compact title rows; a
// row opens that task's detail view in place. The existing Clearance
// resource library, unchanged, sits below the list as "Resources".
//
// Phase 2 deliberately shows NO acknowledgment controls and NO
// complete/incomplete indicators — those arrive with Phase 3, and showing
// them earlier would be misleading. The detail view leaves room for them
// (see TaskDetail).
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

// Left-aligned column with a sensible reading width on desktop; full
// width (inside the shell's own gutter) on phones.
const column: React.CSSProperties = { width: "100%", maxWidth: 760, minWidth: 0 };

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minHeight: 40, padding: ".4rem .8rem", borderRadius: 8, border: "none",
  fontSize: ".8rem", fontWeight: 700, cursor: "pointer", textDecoration: "none",
};
const primaryBtn: React.CSSProperties = { ...btn, background: "#0b1e3d", color: "#fff" };
const softBtn: React.CSSProperties = { ...btn, background: "#f3f4f6", color: "#0b1e3d" };
const textBtn: React.CSSProperties = { ...btn, background: "none", padding: ".4rem 0", color: "#374151" };

const sectionHeading: React.CSSProperties = { margin: 0, fontSize: "1rem", fontWeight: 800, color: "#0b1e3d", lineHeight: 1.2 };
const detailLabel: React.CSSProperties = {
  margin: "0 0 .35rem", fontSize: ".72rem", fontWeight: 800, color: "#6b7280",
  textTransform: "uppercase", letterSpacing: ".04em",
};
const bodyText: React.CSSProperties = {
  margin: 0, fontSize: ".9rem", color: "#1f2937", lineHeight: 1.6,
  whiteSpace: "pre-wrap", overflowWrap: "anywhere",
};
const notice: React.CSSProperties = { margin: 0, padding: ".75rem 1rem", fontSize: ".85rem", color: "#6b7280" };

function linkText(r: TaskResource): string {
  if (r.label) return r.label;
  try {
    return new URL(r.url ?? "").hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}

function fileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchTaskList(slug: string, archived: boolean): Promise<TaskListResponse> {
  const res = await fetch(`/api/team/${slug}/todo/tasks${archived ? "?status=archived" : ""}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to load tasks.");
  return data as TaskListResponse;
}

function Chevron({ direction = "right" }: { direction?: "right" | "left" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={direction === "right" ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Compact list: one full-width row per task — title and chevron only.
function TaskRows({ tasks, muted, onOpen }: { tasks: TaskItem[]; muted?: boolean; onOpen: (t: TaskItem) => void }) {
  return (
    <ul className={styles.todoList}>
      {tasks.map(t => (
        <li key={t.id}>
          <button type="button" className={styles.todoRow} onClick={() => onOpen(t)}>
            <span className={styles.todoRowTitle} style={muted ? { color: "#6b7280" } : undefined}>{t.title}</span>
            <Chevron />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TaskDetail({
  task, slug, canManage, showAudience, isFirst, isLast, onBack, onEdit, onChanged, onView, onDownload, downloadingId,
}: {
  task: TaskItem;
  slug: string;
  canManage: boolean;
  showAudience: boolean;
  isFirst: boolean;
  isLast: boolean;
  onBack: () => void;
  onEdit: (t: TaskItem) => void;
  onChanged: (opts?: { leave?: boolean }) => void;
  onView: (a: Attachment) => void;
  onDownload: (a: Attachment) => void;
  downloadingId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const archived = task.status === "archived";
  const links = task.resources.filter(r => r.kind === "link" && r.url);
  const docs = task.resources.filter(r => r.kind === "file" && r.attachment);

  const post = async (path: string, body: unknown, failMsg: string, leave: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/team/${slug}/todo/tasks/${task.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) onChanged({ leave });
      else { const data = await res.json().catch(() => ({})); alert(data.error ?? failMsg); }
    } finally {
      setBusy(false);
    }
  };

  const archive = () => {
    if (!confirm(`Archive "${task.title}"? It will be hidden from athletes and parents. You can restore it from Archived Tasks.`)) return;
    void post("archive", { archived: true }, "Failed to archive task.", true);
  };

  return (
    <article aria-labelledby="todo-detail-title" style={{ ...column, animation: "elf-fadeUp .18s ease both" }}>
      <button type="button" onClick={onBack} style={{ ...textBtn, minHeight: 44, gap: ".3rem", color: "#0b1e3d", fontSize: ".85rem" }}>
        <Chevron direction="left" />
        Back to To-Do List
      </button>

      <header style={{ marginTop: ".35rem" }}>
        <h2 id="todo-detail-title" style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#0b1e3d", lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {task.title}
        </h2>
        {(showAudience || archived) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", marginTop: ".45rem" }}>
            {showAudience && (
              <span style={{ fontSize: ".7rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: 6, background: "#eef2ff", color: "#3730a3" }}>
                {TASK_AUDIENCE_LABELS[task.audience as TaskAudience] ?? task.audience}
              </span>
            )}
            {archived && (
              <span style={{ fontSize: ".7rem", fontWeight: 700, padding: ".15rem .5rem", borderRadius: 6, background: "#f3f4f6", color: "#6b7280" }}>
                Archived
              </span>
            )}
          </div>
        )}
      </header>

      {canManage && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: ".4rem", marginTop: ".75rem", paddingBottom: ".75rem", borderBottom: "1px solid #e5e7eb" }}>
          {archived ? (
            <button type="button" disabled={busy} onClick={() => post("archive", { archived: false }, "Failed to restore task.", true)} style={primaryBtn}>
              Restore
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => onEdit(task)} style={primaryBtn}>Edit</button>
              <button type="button" disabled={busy || isFirst} onClick={() => post("move", { direction: "up" }, "Failed to move task.", false)} aria-label={`Move ${task.title} up`} style={{ ...softBtn, color: isFirst ? "#c0c4cc" : "#0b1e3d" }}>
                Move Up
              </button>
              <button type="button" disabled={busy || isLast} onClick={() => post("move", { direction: "down" }, "Failed to move task.", false)} aria-label={`Move ${task.title} down`} style={{ ...softBtn, color: isLast ? "#c0c4cc" : "#0b1e3d" }}>
                Move Down
              </button>
              <button type="button" disabled={busy} onClick={archive} style={{ ...softBtn, background: "#fff7ed", color: "#b45309", marginLeft: "auto" }}>
                Archive
              </button>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem", marginTop: "1rem" }}>
        {task.instructions && (
          <section>
            <h3 style={detailLabel}>Instructions</h3>
            <p style={bodyText}>{task.instructions}</p>
          </section>
        )}

        {task.body_text && (
          <section>
            <h3 style={detailLabel}>Details</h3>
            <p style={bodyText}>{task.body_text}</p>
          </section>
        )}

        {links.length > 0 && (
          <section>
            <h3 style={detailLabel}>Links</h3>
            <ul className={styles.todoList}>
              {links.map(r => (
                <li key={r.id}>
                  <a href={r.url!} target="_blank" rel="noopener noreferrer" className={styles.todoRow}>
                    <span className={styles.todoRowTitle}>{linkText(r)}</span>
                    <span aria-hidden="true" style={{ flexShrink: 0, color: "#9ca3af" }}>↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {docs.length > 0 && (
          <section>
            <h3 style={detailLabel}>Documents</h3>
            <ul className={styles.todoList}>
              {docs.map(r => {
                const a = r.attachment!;
                const name = r.label || a.name;
                return (
                  <li key={r.id} className={styles.todoDocRow}>
                    <div style={{ flex: "1 1 10rem", minWidth: 0 }}>
                      <div style={{ fontSize: ".92rem", fontWeight: 600, color: "#0b1e3d", overflowWrap: "anywhere" }}>{name}</div>
                      <div style={{ fontSize: ".75rem", color: "#9ca3af", marginTop: ".1rem" }}>
                        {[a.file_type.toUpperCase(), fileSize(a.size_bytes)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: ".35rem", flexShrink: 0 }}>
                      {PREVIEWABLE_TYPES.has(a.file_type) && (
                        <button type="button" onClick={() => onView(a)} aria-label={`View ${name}`} style={softBtn}>View</button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDownload(a)}
                        disabled={downloadingId === a.id}
                        aria-label={`Download ${name}`}
                        style={{ ...softBtn, opacity: downloadingId === a.id ? .7 : 1 }}
                      >
                        {downloadingId === a.id ? "Downloading…" : "Download"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!task.instructions && !task.body_text && links.length === 0 && docs.length === 0 && (
          <p style={{ margin: 0, fontSize: ".85rem", color: "#9ca3af" }}>No further details for this task.</p>
        )}

        {/* Phase 3 slot: the athlete/parent acknowledgment form (full-name
            input, required checkbox, Submit Acknowledgment button) renders
            here, as the last section of this column, below the task content.
            Nothing is rendered in Phase 2. */}
      </div>
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Switching between the list and a task's detail: start the new view at
  // its top if the page had been scrolled past it.
  useEffect(() => {
    const el = rootRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [selectedId]);

  const afterChange = (opts?: { leave?: boolean }) => {
    refresh();
    if (showArchived) refreshArchived();
    if (opts?.leave) setSelectedId(null);
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

  // The detail view reads from the loaded lists, so it always reflects the
  // latest refresh (after an edit, move, archive or restore).
  const activeIndex = selectedId ? tasks.findIndex(t => t.id === selectedId) : -1;
  const selected = !showTasks || !selectedId ? null
    : activeIndex >= 0 ? tasks[activeIndex]
    : archived?.find(t => t.id === selectedId) ?? null;

  return (
    <div ref={rootRef} style={{ animation: "elf-fadeUp .22s ease both", textAlign: "left" }}>
      {selected ? (
        <TaskDetail
          key={selected.id}
          task={selected}
          slug={slug}
          canManage={canManage}
          showAudience={isCoachView}
          isFirst={activeIndex === 0}
          isLast={activeIndex === tasks.length - 1}
          onBack={() => setSelectedId(null)}
          onEdit={setEditTarget}
          onChanged={afterChange}
          onView={openView}
          onDownload={download}
          downloadingId={downloadingId}
        />
      ) : (
        <div style={column}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: "#0b1e3d", letterSpacing: "-.01em", lineHeight: 1.2 }}>
            To-Do List
          </h2>
          <p style={{ margin: ".2rem 0 .85rem", fontSize: ".82rem", color: "#6b7280", lineHeight: 1.5 }}>
            {isCoachView
              ? "Tasks for athletes and parents, plus the team's forms and links."
              : "Things to do for the team, plus forms and links."}
          </p>

          {error && (
            <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: ".55rem .75rem", color: "#dc2626", fontSize: ".82rem", marginBottom: ".65rem" }}>
              {error}
            </div>
          )}

          {showTasks && (
            <section aria-labelledby="todo-active-heading" style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: ".5rem", minHeight: 40, marginBottom: ".45rem" }}>
                <h3 id="todo-active-heading" style={{ ...sectionHeading, flex: 1, minWidth: 0 }}>
                  {isCoachView ? "Active Tasks" : "Tasks"}
                </h3>
                {canManage && data.available && (
                  <button type="button" onClick={() => setEditTarget("new")} style={{ ...primaryBtn, flexShrink: 0 }}>+ Create Task</button>
                )}
              </div>

              {!data.available ? (
                <p style={{ margin: 0, padding: ".75rem 1rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: ".82rem", color: "#92400e" }}>
                  To-Do tasks aren&apos;t set up for this team yet. Resources below work as usual.
                </p>
              ) : tasks.length === 0 ? (
                <div className={styles.todoList}>
                  <p style={notice}>
                    {canManage ? "No active tasks yet. Create one to share instructions, forms and links." : "Nothing to do right now."}
                  </p>
                </div>
              ) : (
                <TaskRows tasks={tasks} onOpen={t => setSelectedId(t.id)} />
              )}

              {canManage && data.available && (
                <div style={{ marginTop: ".5rem" }}>
                  <button type="button" onClick={toggleArchived} aria-expanded={showArchived} style={textBtn}>
                    {showArchived ? "Hide Archived Tasks" : "Show Archived Tasks"}
                  </button>
                  {showArchived && (
                    <div style={{ marginTop: ".25rem" }}>
                      <h3 style={{ ...sectionHeading, fontSize: ".9rem", color: "#6b7280", marginBottom: ".45rem" }}>Archived Tasks</h3>
                      {archivedError ? (
                        <p role="alert" style={{ margin: 0, color: "#dc2626", fontSize: ".82rem" }}>{archivedError}</p>
                      ) : archived === null ? (
                        <p style={{ margin: 0, color: "#9ca3af", fontSize: ".82rem" }}>Loading…</p>
                      ) : archived.length === 0 ? (
                        <p style={{ margin: 0, color: "#9ca3af", fontSize: ".82rem" }}>No archived tasks.</p>
                      ) : (
                        <TaskRows tasks={archived} muted onOpen={t => setSelectedId(t.id)} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Existing Clearance resources — same component, API and permissions
          as before. Kept mounted (hidden) while a task is open so it doesn't
          reload on the way back. */}
      <div hidden={!!selected} style={column}>
        <ClearanceView slug={slug} />
      </div>

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
