// Team Management Phase 2 — To-Do List tasks: database reads/writes via
// the service-role PostgREST API (same convention as clearance.ts).
// Pure rules live in src/lib/teamTasks.ts.
//
// Missing-table compatibility: Preview and Production share one database,
// so this code ships before supabase/migrations/phase_t2_team_tasks.sql is
// applied. ONLY PostgREST's "not in the schema cache" errors (and the
// equivalent Postgres undefined-table/function codes) are reported as
// `unavailable`; every other failure is reported as `error`, never
// silently turned into "no tasks".
import type { TeamActor } from "./permissions.ts";
import { sortResources, sortTasks, type TaskAudience, type TaskStatus, type ValidatedTask } from "./teamTasks.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// ── Types ─────────────────────────────────────────────────────────────────

export type TaskAttachment = { id: string; name: string; file_type: "pdf" | "image" | "doc"; size_bytes: number };

export type TaskResourceRow = {
  id: string;
  kind: "link" | "file";
  url: string | null;
  attachment_id: string | null;
  label: string | null;
  sort_order: number;
  attachment: TaskAttachment | null;
};

export type TaskRow = {
  id: string;
  campaign_slug: string;
  title: string;
  instructions: string | null;
  body_text: string | null;
  audience: TaskAudience;
  status: TaskStatus;
  sort_order: number;
  revision: number;
  revised_at: string;
  version: number;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  resources: TaskResourceRow[];
};

export type StoreFailure =
  | "unavailable"   // task tables/functions not migrated yet
  | "not_found"
  | "not_active"    // edit attempted on an archived task
  | "conflict"      // someone else saved first (version mismatch)
  | "invalid"       // database rejected the data (e.g. file not on team)
  | "error";

export type StoreResult<T> = { ok: true; value: T } | { ok: false; reason: StoreFailure };

/** Who is making a change — derived server-side from the resolved actor. */
export type TaskActorIdentity = {
  account_id: string | null;
  coach_id: string | null;
  platform_admin_id: string | null;
  name: string | null;
};

// Explicit column list: creator/editor identity ids stay server-side.
const TASK_SELECT =
  "id,campaign_slug,title,instructions,body_text,audience,status,sort_order,revision,revised_at,version," +
  "created_by_name,updated_by_name,created_at,updated_at,archived_at," +
  "resources:team_task_resources(id,kind,url,attachment_id,label,sort_order," +
  "attachment:team_files!attachment_id(id,name,file_type,size_bytes))";

// ── Error classification ──────────────────────────────────────────────────

const MISSING_SCHEMA_CODES = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);

function parseError(body: string): { code?: string; message?: string } {
  try {
    const j = JSON.parse(body) as { code?: string; message?: string };
    return { code: j.code, message: j.message };
  } catch {
    return {};
  }
}

/** True only for "this table/function doesn't exist (yet)". */
export function isMissingSchemaError(body: string): boolean {
  const { code } = parseError(body);
  return !!code && MISSING_SCHEMA_CODES.has(code);
}

/** Maps a failed write/rpc response body to a StoreFailure. */
export function classifyWriteError(body: string): StoreFailure {
  if (isMissingSchemaError(body)) return "unavailable";
  const { code, message = "" } = parseError(body);
  if (message.includes("team_task_not_found")) return "not_found";
  if (message.includes("team_task_not_active")) return "not_active";
  if (message.includes("team_task_version_conflict")) return "conflict";
  if (message.includes("team_task_resource_file_not_on_team")) return "invalid";
  if (message.includes("team_task_resource_team_mismatch")) return "invalid";
  if (code === "23505" || code === "23503" || code === "23514") return "invalid";
  return "error";
}

function normalizeTask(row: TaskRow): TaskRow {
  return { ...row, resources: sortResources(Array.isArray(row.resources) ? row.resources : []) };
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function listTasks(
  slug: string,
  opts: { status: TaskStatus; audiences: readonly TaskAudience[] },
): Promise<StoreResult<TaskRow[]>> {
  if (opts.audiences.length === 0) return { ok: true, value: [] };
  try {
    const res = await fetch(
      `${BASE}/rest/v1/team_tasks?campaign_slug=eq.${encodeURIComponent(slug)}` +
        `&status=eq.${opts.status}&audience=in.(${opts.audiences.join(",")})` +
        `&select=${TASK_SELECT}&order=sort_order.asc,created_at.asc,id.asc`,
      { headers: h(), cache: "no-store" },
    );
    if (!res.ok) {
      const body = await res.text();
      if (isMissingSchemaError(body)) return { ok: false, reason: "unavailable" };
      console.error("[teamTasks] list failed:", res.status, body);
      return { ok: false, reason: "error" };
    }
    const rows = await res.json();
    return { ok: true, value: sortTasks((Array.isArray(rows) ? rows : []).map(normalizeTask)) };
  } catch (err) {
    console.error("[teamTasks] list failed:", err);
    return { ok: false, reason: "error" };
  }
}

/** One task on this team (any status), or not_found. */
export async function getTask(slug: string, id: string): Promise<StoreResult<TaskRow>> {
  try {
    const res = await fetch(
      `${BASE}/rest/v1/team_tasks?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}` +
        `&select=${TASK_SELECT}&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    if (!res.ok) {
      const body = await res.text();
      if (isMissingSchemaError(body)) return { ok: false, reason: "unavailable" };
      // An id that isn't a uuid is a 400 from PostgREST — same as "no such task".
      if (parseError(body).code === "22P02") return { ok: false, reason: "not_found" };
      console.error("[teamTasks] get failed:", res.status, body);
      return { ok: false, reason: "error" };
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, reason: "not_found" };
    return { ok: true, value: normalizeTask(rows[0]) };
  } catch (err) {
    console.error("[teamTasks] get failed:", err);
    return { ok: false, reason: "error" };
  }
}

/** True only if every id is a file belonging to this team. Prevents
 *  attaching another team's (or a non-existent) file to a task. */
export async function filesBelongToTeam(slug: string, ids: readonly string[]): Promise<StoreResult<boolean>> {
  if (ids.length === 0) return { ok: true, value: true };
  try {
    const res = await fetch(
      `${BASE}/rest/v1/team_files?campaign_slug=eq.${encodeURIComponent(slug)}` +
        `&id=in.(${ids.map(encodeURIComponent).join(",")})&select=id`,
      { headers: h(), cache: "no-store" },
    );
    if (!res.ok) {
      console.error("[teamTasks] file check failed:", res.status, await res.text());
      return { ok: false, reason: "error" };
    }
    const rows: { id: string }[] = await res.json();
    const found = new Set(rows.map(r => r.id.toLowerCase()));
    return { ok: true, value: ids.every(id => found.has(id.toLowerCase())) };
  } catch (err) {
    console.error("[teamTasks] file check failed:", err);
    return { ok: false, reason: "error" };
  }
}

/** This team's files, newest first — for "attach an existing document". */
export async function listTeamFilesForPicker(slug: string): Promise<StoreResult<TaskAttachment[]>> {
  try {
    const res = await fetch(
      `${BASE}/rest/v1/team_files?campaign_slug=eq.${encodeURIComponent(slug)}` +
        `&select=id,name,file_type,size_bytes&order=created_at.desc&limit=200`,
      { headers: h(), cache: "no-store" },
    );
    if (!res.ok) {
      console.error("[teamTasks] file list failed:", res.status, await res.text());
      return { ok: false, reason: "error" };
    }
    const rows = await res.json();
    return { ok: true, value: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    console.error("[teamTasks] file list failed:", err);
    return { ok: false, reason: "error" };
  }
}

// ── Actor identity ────────────────────────────────────────────────────────

/** Who is acting, from the server-resolved actor only. A coach's ELF
 *  account id is read from their own team_coaches row (null for a legacy
 *  team-login coach), never taken from the browser session, so a browser
 *  holding someone else's ELF session can't misattribute the change. */
export async function taskActorIdentity(actor: TeamActor): Promise<TaskActorIdentity> {
  if (actor.kind === "platform_admin") {
    return {
      account_id: actor.session.accountId,
      coach_id: null,
      platform_admin_id: actor.session.platformAdminId,
      name: actor.session.name,
    };
  }
  if (actor.kind === "coach") {
    let accountId: string | null = null;
    try {
      const res = await fetch(
        `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(actor.session.id)}&select=account_id&limit=1`,
        { headers: h(), cache: "no-store" },
      );
      if (res.ok) accountId = ((await res.json())[0]?.account_id as string | null) ?? null;
    } catch {
      accountId = null;
    }
    return { account_id: accountId, coach_id: actor.session.id, platform_admin_id: null, name: actor.session.name };
  }
  return { account_id: null, coach_id: null, platform_admin_id: null, name: null };
}

// ── Writes ────────────────────────────────────────────────────────────────

function taskPayload(v: ValidatedTask) {
  return {
    p_task: { title: v.title, instructions: v.instructions, body_text: v.body_text, audience: v.audience },
    p_resources: v.resources.map(r => ({ kind: r.kind, url: r.url, attachment_id: r.attachment_id, label: r.label })),
  };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<StoreResult<T>> {
  try {
    const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: h(),
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const body = await res.text();
      const reason = classifyWriteError(body);
      if (reason === "error") console.error(`[teamTasks] ${name} failed:`, res.status, body);
      return { ok: false, reason };
    }
    const text = await res.text();
    return { ok: true, value: (text ? JSON.parse(text) : null) as T };
  } catch (err) {
    console.error(`[teamTasks] ${name} failed:`, err);
    return { ok: false, reason: "error" };
  }
}

export async function createTask(slug: string, task: ValidatedTask, actor: TaskActorIdentity): Promise<StoreResult<{ id: string; revision: number }>> {
  const result = await rpc<{ id: string; revision: number }>("team_task_create", {
    p_campaign_slug: slug,
    ...taskPayload(task),
    p_actor: actor,
  });
  return result;
}

export async function updateTask(
  slug: string,
  id: string,
  task: ValidatedTask,
  opts: { expectedVersion: number; bumpRevision: boolean },
  actor: TaskActorIdentity,
): Promise<StoreResult<{ id: string; revision: number; version: number }>> {
  return rpc("team_task_update", {
    p_task_id: id,
    p_campaign_slug: slug,
    p_expected_version: opts.expectedVersion,
    p_bump_revision: opts.bumpRevision,
    ...taskPayload(task),
    p_actor: actor,
  });
}

export async function moveTask(slug: string, id: string, direction: "up" | "down"): Promise<StoreResult<null>> {
  return rpc("team_task_move", { p_task_id: id, p_campaign_slug: slug, p_direction: direction });
}

/** Archive (archived=true) or restore. Never deletes. Doesn't touch
 *  revision or version, so it can't invalidate acknowledgments or cause
 *  an edit conflict. Idempotent: archiving an archived task is a no-op. */
export async function setTaskArchived(
  slug: string,
  id: string,
  archived: boolean,
  actor: TaskActorIdentity,
): Promise<StoreResult<null>> {
  const from: TaskStatus = archived ? "active" : "archived";
  try {
    const res = await fetch(
      `${BASE}/rest/v1/team_tasks?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&status=eq.${from}`,
      {
        method: "PATCH",
        headers: h({ Prefer: "return=representation" }),
        body: JSON.stringify({
          status: archived ? "archived" : "active",
          archived_at: archived ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
          updated_by_account_id: actor.account_id,
          updated_by_coach_id: actor.coach_id,
          updated_by_platform_admin_id: actor.platform_admin_id,
          updated_by_name: actor.name,
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      const reason = classifyWriteError(body);
      if (reason === "error") console.error("[teamTasks] archive failed:", res.status, body);
      return { ok: false, reason };
    }
    const rows = await res.json();
    if (Array.isArray(rows) && rows.length > 0) return { ok: true, value: null };
    // Nothing matched: already in the requested state (no-op) or not on this team.
    const existing = await getTask(slug, id);
    if (existing.ok) return { ok: true, value: null };
    return { ok: false, reason: existing.reason };
  } catch (err) {
    console.error("[teamTasks] archive failed:", err);
    return { ok: false, reason: "error" };
  }
}
