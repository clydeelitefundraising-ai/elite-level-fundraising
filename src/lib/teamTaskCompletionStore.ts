// Team Management Phase 3C — coach completion tracking: database reads via
// the service-role PostgREST API. Pure rules live in teamTaskCompletion.ts.
//
// Every read here is STRICT and COMPLETE or it fails:
//  - Supabase caps every API response (db max-rows, 1,000 on this project),
//    silently. Each list is therefore read page by page in a deterministic
//    order with an exact count, and the rows received must add up to that
//    count with no duplicates — a truncated result is never treated as the
//    whole team.
//  - The status rows must then match the tasks and roster just read
//    exactly (verifyStatusRows) — no missing, extra or duplicate rows, and
//    every task at its current revision.
// Any failure means "unavailable": the caller shows that, never a green
// check. Read-only: no writes, no audit entries.
import { isMissingSchemaError } from "./teamTasksStore.ts";
import { sortTasks, isTaskAudience } from "./teamTasks.ts";
import {
  COMPLETION_STATUS_COLUMNS,
  buildAthleteCompletion,
  buildTaskCompletion,
  buildTeamSummary,
  verifyStatusRows,
  type CompletionAthlete,
  type CompletionStatusRow,
  type CompletionTask,
} from "./teamTaskCompletion.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" };
}

export type CompletionFailure = "unavailable" | "not_found" | "inactive" | "error";
export type CompletionResult<T> = { ok: true; value: T } | { ok: false; reason: CompletionFailure };

class ReadError extends Error {
  readonly reason: "unavailable" | "error";
  constructor(reason: "unavailable" | "error", message: string) {
    super(message);
    this.reason = reason;
  }
}

/** Page size requested per read. If the server's own cap is lower, pages
 *  simply come back shorter and the loop continues from where they end. */
export const COMPLETION_PAGE_SIZE = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function totalFrom(contentRange: string | null): number | null {
  const m = /\/(\d+)$/.exec(contentRange ?? "");
  return m ? Number(m[1]) : null;
}

/** Every row of an ordered read, page by page (limit/offset), with an
 *  exact count. Throws unless the rows received are exactly that count
 *  with no duplicate keys, and the count doesn't change between pages.
 *  `path` must carry a deterministic `order=` on a unique key. */
async function readAll<T>(path: string, keyOf: (row: T) => string): Promise<T[]> {
  const rows: T[] = [];
  const keys = new Set<string>();
  let total: number | null = null;
  for (let offset = 0; total === null || offset < total; ) {
    const res = await fetch(`${BASE}/rest/v1/${path}&limit=${COMPLETION_PAGE_SIZE}&offset=${offset}`, { headers: h(), cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      throw new ReadError(isMissingSchemaError(body) ? "unavailable" : "error", `${res.status} ${body}`);
    }
    const page = await res.json();
    if (!Array.isArray(page)) throw new ReadError("error", "unexpected response");
    const pageTotal = totalFrom(res.headers.get("content-range"));
    if (pageTotal === null) throw new ReadError("error", "no exact count returned");
    if (total !== null && pageTotal !== total) throw new ReadError("error", `count changed between pages (${total} -> ${pageTotal})`);
    total = pageTotal;
    if (page.length === 0 && offset < total) throw new ReadError("error", `truncated: ${offset} of ${total} rows`);
    if (offset + page.length > total) throw new ReadError("error", `more rows than counted (${offset + page.length} > ${total})`);
    for (const row of page as T[]) {
      const key = keyOf(row);
      if (keys.has(key)) throw new ReadError("error", `duplicate row ${key}`);
      keys.add(key);
      rows.push(row);
    }
    offset += page.length;
  }
  if (rows.length !== total) throw new ReadError("error", `received ${rows.length} of ${total} rows`);
  return rows;
}

// ── Typed reads ───────────────────────────────────────────────────────────

type TaskRow = CompletionTask & { status: string; sort_order: number; created_at: string };

const TASK_COLUMNS = "id,title,audience,revision,status,sort_order,created_at";
const ATHLETE_COLUMNS = "id,name,class_year,jersey_number";

function toTask(r: TaskRow): CompletionTask {
  if (typeof r.id !== "string" || !Number.isInteger(r.revision) || !isTaskAudience(r.audience)) {
    throw new ReadError("error", "malformed task row");
  }
  return { id: r.id, title: r.title, audience: r.audience, revision: r.revision };
}

function toAthlete(r: CompletionAthlete): CompletionAthlete {
  if (typeof r.id !== "string") throw new ReadError("error", "malformed athlete row");
  return { id: r.id, name: typeof r.name === "string" ? r.name : "", class_year: r.class_year ?? null, jersey_number: r.jersey_number ?? null };
}

/** Active tasks on this team, in the To-Do List's order. Archived tasks are
 *  never current requirements. */
async function activeTasks(slug: string): Promise<CompletionTask[]> {
  const rows = await readAll<TaskRow>(
    `team_tasks?campaign_slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=${TASK_COLUMNS}&order=id.asc`,
    r => r.id,
  );
  return sortTasks(rows).map(toTask);
}

async function roster(slug: string): Promise<CompletionAthlete[]> {
  const rows = await readAll<CompletionAthlete>(
    `athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=${ATHLETE_COLUMNS}&order=id.asc`,
    r => r.id,
  );
  return rows.map(toAthlete);
}

/** team_task_ack_status() rows (no names), optionally for one task or one
 *  athlete. Ids passed here always come from rows just read from this
 *  team, never straight from the request. */
async function statusRows(slug: string, filter: { taskId?: string; athleteId?: string } = {}): Promise<CompletionStatusRow[]> {
  let path = `rpc/team_task_ack_status?p_campaign_slug=${encodeURIComponent(slug)}`;
  if (filter.taskId) path += `&p_task_ids=${encodeURIComponent(`{${filter.taskId}}`)}`;
  if (filter.athleteId) path += `&p_athlete_ids=${encodeURIComponent(`{${filter.athleteId}}`)}`;
  path += `&select=${COMPLETION_STATUS_COLUMNS.join(",")}&order=task_id.asc,athlete_id.asc,requirement.asc`;
  return readAll<CompletionStatusRow>(path, r => `${r.task_id}|${r.athlete_id}|${r.requirement}`);
}

async function oneRow<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}/rest/v1/${path}&limit=2`, { headers: h(), cache: "no-store" });
  if (!res.ok) {
    const body = await res.text();
    throw new ReadError(isMissingSchemaError(body) ? "unavailable" : "error", `${res.status} ${body}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length > 1) throw new ReadError("error", "unexpected response");
  return (rows[0] as T | undefined) ?? null;
}

async function guarded<T>(label: string, run: () => Promise<CompletionResult<T>>): Promise<CompletionResult<T>> {
  try {
    return await run();
  } catch (err) {
    console.error(`[todo/completion] ${label} failed:`, err);
    return { ok: false, reason: err instanceof ReadError ? err.reason : "error" };
  }
}

// ── Public loaders ────────────────────────────────────────────────────────

/** Every active task's completion counts for the whole roster. Three
 *  reads (tasks, roster, status), each paged — never one per athlete. */
export async function loadTeamCompletion(slug: string) {
  return guarded("summary", async () => {
    const [tasks, athletes, rows] = await Promise.all([activeTasks(slug), roster(slug), statusRows(slug)]);
    verifyStatusRows(tasks, athletes.map(a => a.id), rows);
    return { ok: true as const, value: { athleteCount: athletes.length, tasks: buildTeamSummary(tasks, athletes, rows) } };
  });
}

/** One active task: each athlete's requirement states. */
export async function loadTaskCompletion(slug: string, taskId: string) {
  return guarded("task", async () => {
    if (!UUID.test(taskId)) return { ok: false as const, reason: "not_found" as const };
    const row = await oneRow<TaskRow>(
      `team_tasks?id=eq.${encodeURIComponent(taskId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=${TASK_COLUMNS}`,
    );
    if (!row) return { ok: false as const, reason: "not_found" as const };
    if (row.status !== "active") return { ok: false as const, reason: "inactive" as const };
    const task = toTask(row);
    const [athletes, rows] = await Promise.all([roster(slug), statusRows(slug, { taskId: task.id })]);
    verifyStatusRows([task], athletes.map(a => a.id), rows);
    return { ok: true as const, value: buildTaskCompletion(task, athletes, rows) };
  });
}

/** One athlete on this team: every active task's applicable requirements. */
export async function loadAthleteCompletion(slug: string, athleteId: string) {
  return guarded("athlete", async () => {
    if (!UUID.test(athleteId)) return { ok: false as const, reason: "not_found" as const };
    const row = await oneRow<CompletionAthlete>(
      `athletes?id=eq.${encodeURIComponent(athleteId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=${ATHLETE_COLUMNS}`,
    );
    if (!row) return { ok: false as const, reason: "not_found" as const };
    const athlete = toAthlete(row);
    const [tasks, rows] = await Promise.all([activeTasks(slug), statusRows(slug, { athleteId: athlete.id })]);
    verifyStatusRows(tasks, [athlete.id], rows);
    return { ok: true as const, value: buildAthleteCompletion(athlete, tasks, rows) };
  });
}
