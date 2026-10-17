// Team Management Phase 2 — To-Do List tasks: pure rules (validation,
// visibility, revision semantics, ordering). Deliberately import-free
// (same convention as src/lib/teamOrder.ts) so client components can use
// the labels/limits and Node's native test runner can load it directly.
// Database reads/writes live in src/lib/teamTasksStore.ts. The only import
// is type-only (erased at runtime).
import type { TeamActor } from "./permissions.ts";

export const TASK_AUDIENCES = ["athlete", "parent", "both"] as const;
export type TaskAudience = typeof TASK_AUDIENCES[number];

export const TASK_AUDIENCE_LABELS: Record<TaskAudience, string> = {
  athlete: "Athletes",
  parent:  "Parents",
  both:    "Athletes & Parents",
};

export type TaskStatus = "active" | "archived";

// Mirrors the CHECK constraints in phase_t2_team_tasks.sql (the database
// stays authoritative; these give clear messages before a round-trip).
export const TASK_LIMITS = {
  title:        200,
  instructions: 5000,
  body:         20000,
  label:        200,
  url:          2048,
  resources:    20,
} as const;

export class TaskValidationError extends Error {}

export type TaskLinkInput = { kind: "link"; url: string; label?: string | null };
export type TaskFileInput = { kind: "file"; attachment_id: string; label?: string | null };
export type TaskResourceInput = TaskLinkInput | TaskFileInput;

export type TaskInput = {
  title: unknown;
  instructions?: unknown;
  body_text?: unknown;
  audience: unknown;
  resources?: unknown;
};

export type ValidatedTaskResource =
  | { kind: "link"; url: string; attachment_id: null; label: string | null }
  | { kind: "file"; url: null; attachment_id: string; label: string | null };

export type ValidatedTask = {
  title: string;
  instructions: string | null;
  body_text: string | null;
  audience: TaskAudience;
  resources: ValidatedTaskResource[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTaskAudience(value: unknown): value is TaskAudience {
  return typeof value === "string" && (TASK_AUDIENCES as readonly string[]).includes(value);
}

function optionalText(value: unknown, max: number, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new TaskValidationError(`${field} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new TaskValidationError(`${field} must be ${max} characters or fewer.`);
  return trimmed;
}

/** http(s) only — never javascript:, data:, file:, etc. Same rule as
 *  Clearance links (clearance.ts normalizeClearanceUrl). */
export function normalizeTaskUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw new TaskValidationError("Each link needs a web address.");
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new TaskValidationError("Links must be valid web addresses (starting with http:// or https://).");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TaskValidationError("Links must start with http:// or https://.");
  }
  const url = parsed.toString();
  if (url.length > TASK_LIMITS.url) throw new TaskValidationError(`Links must be ${TASK_LIMITS.url} characters or fewer.`);
  return url;
}

function validateResources(value: unknown): ValidatedTaskResource[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TaskValidationError("Resources must be a list.");
  if (value.length > TASK_LIMITS.resources) {
    throw new TaskValidationError(`A task can have at most ${TASK_LIMITS.resources} links and documents.`);
  }
  const out: ValidatedTaskResource[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") throw new TaskValidationError("Invalid link or document.");
    const r = item as Record<string, unknown>;
    const label = optionalText(r.label, TASK_LIMITS.label, "Link label");
    if (r.kind === "link") {
      const url = normalizeTaskUrl(r.url);
      const key = `link:${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "link", url, attachment_id: null, label });
    } else if (r.kind === "file") {
      const id = typeof r.attachment_id === "string" ? r.attachment_id.trim() : "";
      if (!UUID_RE.test(id)) throw new TaskValidationError("Invalid document.");
      const key = `file:${id.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "file", url: null, attachment_id: id.toLowerCase(), label });
    } else {
      throw new TaskValidationError("Invalid link or document.");
    }
  }
  return out;
}

/** Server-side validation of a create/edit body. Throws
 *  TaskValidationError with a user-facing message. Duplicate links/files
 *  are dropped (first one wins), order is preserved. */
export function validateTaskInput(input: TaskInput): ValidatedTask {
  if (typeof input.title !== "string" || !input.title.trim()) throw new TaskValidationError("Title is required.");
  const title = input.title.trim();
  if (title.length > TASK_LIMITS.title) throw new TaskValidationError(`Title must be ${TASK_LIMITS.title} characters or fewer.`);
  if (!isTaskAudience(input.audience)) throw new TaskValidationError("Choose who the task is for: Athletes, Parents, or Both.");
  return {
    title,
    instructions: optionalText(input.instructions, TASK_LIMITS.instructions, "Instructions"),
    body_text:    optionalText(input.body_text, TASK_LIMITS.body, "Details"),
    audience:     input.audience,
    resources:    validateResources(input.resources),
  };
}

export function fileIdsOf(resources: readonly { kind: string; attachment_id: string | null }[]): string[] {
  return resources.filter(r => r.kind === "file" && r.attachment_id).map(r => r.attachment_id as string);
}

// ── Revision semantics ────────────────────────────────────────────────────
// Whether an edit changes what families are asked to do (and so, from
// Phase 3 on, requires a fresh acknowledgment) is decided by the DATABASE
// — team_tasks_guard() and team_task_update() in phase_t2_team_tasks.sql —
// not here, so no code path can skip it. Substantive: title, instructions,
// body text, audience, or the SET of linked URLs / attached files. Not
// substantive: reordering tasks or a task's links/files, editing a link's
// label, archiving/restoring.

// ── Visibility ────────────────────────────────────────────────────────────

/** How a team actor relates to To-Do tasks. Derived on the server from the
 *  resolved TeamActor (taskViewerForActor in teamTasksStore.ts) — never
 *  from anything the client sends. */
export type TaskViewer =
  | "manager"     // Head Coach, or platform admin (isHeadCoach semantics)
  | "coach"       // Assistant Coach — read-only
  | "athlete"
  | "parent"
  | "booster"     // Resources only; no tasks, no completion data
  | "none";

export function taskViewerFor(actor: TeamActor): TaskViewer {
  if (actor.kind === "platform_admin") return "manager";
  if (actor.kind === "coach") {
    const role: string = actor.session.role;
    if (role === "head_coach") return "manager";
    if (role === "assistant_coach") return "coach";
    if (role === "booster") return "booster";
    return "none";
  }
  if (actor.kind === "member") {
    const role: string = actor.session.role;
    if (role === "athlete") return "athlete";
    if (role === "parent") return "parent";
    if (role === "booster") return "booster";
  }
  return "none";
}

export function canManageTasks(viewer: TaskViewer): boolean {
  return viewer === "manager";
}

/** Audiences a viewer may see. Coaches see every task; athletes see
 *  Athlete + Both; parents see Parent + Both; boosters see none. */
export function visibleAudiences(viewer: TaskViewer): readonly TaskAudience[] {
  if (viewer === "manager" || viewer === "coach") return TASK_AUDIENCES;
  if (viewer === "athlete") return ["athlete", "both"];
  if (viewer === "parent") return ["parent", "both"];
  return [];
}

export function canViewTask(viewer: TaskViewer, task: { audience: string; status: string }): boolean {
  if (task.status === "archived" && viewer !== "manager") return false;
  return (visibleAudiences(viewer) as readonly string[]).includes(task.audience);
}

/** Only the Head Coach sees archived tasks. */
export function canViewArchived(viewer: TaskViewer): boolean {
  return viewer === "manager";
}

// ── Ordering ──────────────────────────────────────────────────────────────

/** sort_order, then created_at, then id — the same order the database
 *  move function uses, so the list never reorders between renders. */
export function sortTasks<T extends { sort_order: number; created_at: string; id: string }>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) =>
    a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function sortResources<T extends { sort_order: number }>(resources: readonly T[]): T[] {
  return [...resources].sort((a, b) => a.sort_order - b.sort_order);
}
