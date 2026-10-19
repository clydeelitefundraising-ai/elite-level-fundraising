// Team Management Phase 3C — coach completion tracking: pure rules.
// Database access lives in src/lib/teamTaskCompletionStore.ts.
//
// Every "complete" comes from team_task_ack_status() saying satisfied for
// the task's CURRENT revision — the same definition the family view and
// team_task_acknowledge() use (deleted/unlinked accounts, one parent
// covering several children, second-child links: all decided there).
// A requirement with no status row is "unknown", never complete.
//
// Coaches see the requirement (athlete / parent) and the date only — never
// the typed acknowledgment name, member names or member ids.
import { requirementsFor, type AckRequirement } from "./teamTaskAcks.ts";
import type { TaskViewer } from "./teamTasks.ts";

/** Head Coach, Assistant Coach (read-only) and platform admins. Never
 *  boosters, athletes, parents or the public. */
export function canViewCompletion(viewer: TaskViewer): boolean {
  return viewer === "manager" || viewer === "coach";
}

export type CompletionState =
  | "complete"          // acknowledged for the current revision
  | "outstanding"       // someone can acknowledge; nobody has yet
  | "needs_update"      // acknowledged an earlier revision only
  | "not_joined"        // athlete requirement; the athlete hasn't joined the team app
  | "no_parent_linked"  // parent requirement; no parent/guardian linked yet
  | "unknown";          // no status for it — never shown as complete

/** The columns read from team_task_ack_status(). Deliberately excludes
 *  acknowledged_full_name, acknowledged_member_name and
 *  acknowledged_by_member_id — they are never fetched for coaches. */
export const COMPLETION_STATUS_COLUMNS = [
  "task_id", "task_revision", "athlete_id", "requirement", "satisfied",
  "acknowledged_at", "has_eligible_member", "earlier_revision_acknowledged",
] as const;

export type CompletionStatusRow = {
  task_id: string;
  task_revision: number;
  athlete_id: string;
  requirement: AckRequirement;
  satisfied: boolean;
  acknowledged_at: string | null;
  has_eligible_member: boolean;
  earlier_revision_acknowledged: boolean;
};

export type CompletionTask = { id: string; title: string; audience: string; revision: number };
export type CompletionAthlete = { id: string; name: string; class_year: string | null; jersey_number: number | null };

export type CompletionEntry = { requirement: AckRequirement; state: CompletionState; acknowledgedAt: string | null };

/** One requirement's state from its status row (or its absence). */
export function completionState(row: CompletionStatusRow | undefined, requirement: AckRequirement): CompletionEntry {
  if (!row) return { requirement, state: "unknown", acknowledgedAt: null };
  if (row.satisfied) return { requirement, state: "complete", acknowledgedAt: row.acknowledged_at };
  if (row.earlier_revision_acknowledged) return { requirement, state: "needs_update", acknowledgedAt: null };
  if (!row.has_eligible_member) {
    return { requirement, state: requirement === "athlete" ? "not_joined" : "no_parent_linked", acknowledgedAt: null };
  }
  return { requirement, state: "outstanding", acknowledgedAt: null };
}

export const CANNOT_COMPLETE_YET: readonly CompletionState[] = ["not_joined", "no_parent_linked"];

/** How a state is shown to coaches: icon kind and its always-visible text.
 *  Only "complete" is ever green; "unknown" is grey, never green or red. */
export const COMPLETION_STATE_DISPLAY: Record<CompletionState, { icon: "check" | "x" | "unknown"; text: string }> = {
  complete:         { icon: "check",   text: "Acknowledged" },
  outstanding:      { icon: "x",       text: "Not acknowledged yet" },
  needs_update:     { icon: "x",       text: "Needs new acknowledgment" },
  not_joined:       { icon: "x",       text: "Hasn't joined ELF yet" },
  no_parent_linked: { icon: "x",       text: "No parent linked" },
  unknown:          { icon: "unknown", text: "Status unavailable" },
};

export const REQUIREMENT_LABELS: Record<AckRequirement, string> = {
  athlete: "Athlete",
  parent:  "Parent/guardian",
};

export type AthleteTaskStatus = { task: { id: string; title: string }; entries: CompletionEntry[] };

/** Client-side check of GET .../completion/athletes/[id]: exactly the
 *  promised shape, or null (shown as unavailable — never partly shown).
 *  A state the client doesn't recognise becomes "unknown", never green. */
export function parseAthleteCompletionResponse(body: unknown): AthleteTaskStatus[] | null {
  const b = body as { available?: unknown; tasks?: unknown } | null;
  if (!b || b.available !== true || !Array.isArray(b.tasks)) return null;
  const tasks: AthleteTaskStatus[] = [];
  for (const t of b.tasks as { task?: { id?: unknown; title?: unknown }; entries?: unknown }[]) {
    if (!t?.task || typeof t.task.id !== "string" || typeof t.task.title !== "string") return null;
    if (!Array.isArray(t.entries) || t.entries.length === 0) return null;
    const entries: CompletionEntry[] = [];
    for (const e of t.entries as { requirement?: unknown; state?: unknown; acknowledgedAt?: unknown }[]) {
      if (e?.requirement !== "athlete" && e?.requirement !== "parent") return null;
      if (entries.some(x => x.requirement === e.requirement)) return null;
      const state = (typeof e.state === "string" && Object.hasOwn(COMPLETION_STATE_DISPLAY, e.state) ? e.state : "unknown") as CompletionState;
      entries.push({ requirement: e.requirement, state, acknowledgedAt: typeof e.acknowledgedAt === "string" ? e.acknowledgedAt : null });
    }
    tasks.push({ task: { id: t.task.id, title: t.task.title }, entries });
  }
  return tasks;
}

/** Requirement counts. Every requirement is in exactly one of complete,
 *  outstanding or unknown (complete + outstanding + unknown = required).
 *  outstanding = notAcknowledged + needsUpdate + cannotCompleteYet — the
 *  last two are breakdowns of outstanding, never added on top of it. */
export type RequirementCounts = {
  required: number;
  complete: number;
  outstanding: number;
  notAcknowledged: number;
  needsUpdate: number;
  cannotCompleteYet: number;
  unknown: number;
};

export function countEntries(entries: readonly CompletionEntry[]): RequirementCounts {
  const c: RequirementCounts = { required: 0, complete: 0, outstanding: 0, notAcknowledged: 0, needsUpdate: 0, cannotCompleteYet: 0, unknown: 0 };
  for (const e of entries) {
    c.required++;
    if (e.state === "complete") c.complete++;
    else if (e.state === "unknown") c.unknown++;
    else {
      c.outstanding++;
      if (e.state === "needs_update") c.needsUpdate++;
      else if (CANNOT_COMPLETE_YET.includes(e.state)) c.cannotCompleteYet++;
      else c.notAcknowledged++;
    }
  }
  return c;
}

/** Distinct athletes: complete = every requirement complete; outstanding =
 *  at least one requirement outstanding; unknown = none outstanding but at
 *  least one unknown. complete + outstanding + unknown = total. */
export type AthleteCounts = { total: number; complete: number; outstanding: number; unknown: number };

function statusKey(taskId: string, athleteId: string, requirement: string): string {
  return `${taskId}|${athleteId}|${requirement}`;
}

function indexRows(rows: readonly CompletionStatusRow[]): Map<string, CompletionStatusRow> {
  return new Map(rows.map(r => [statusKey(r.task_id, r.athlete_id, r.requirement), r]));
}

/** A row only counts for the task's current revision. */
function rowFor(index: Map<string, CompletionStatusRow>, task: CompletionTask, athleteId: string, requirement: AckRequirement) {
  const row = index.get(statusKey(task.id, athleteId, requirement));
  return row && row.task_revision === task.revision ? row : undefined;
}

function entriesFor(index: Map<string, CompletionStatusRow>, task: CompletionTask, athleteId: string): CompletionEntry[] {
  return requirementsFor(task.audience).map(req => completionState(rowFor(index, task, athleteId, req), req));
}

/** An athlete is complete for a task only when EVERY requirement the task
 *  asks of them is complete; outstanding when any is outstanding; unknown
 *  otherwise (some unknown, none outstanding). */
export function athleteStatus(entries: readonly CompletionEntry[]): "complete" | "outstanding" | "unknown" {
  if (entries.length === 0) return "unknown";
  if (entries.some(e => e.state !== "complete" && e.state !== "unknown")) return "outstanding";
  if (entries.some(e => e.state === "unknown")) return "unknown";
  return "complete";
}

function countAthletes(perAthlete: readonly CompletionEntry[][]): AthleteCounts {
  const c: AthleteCounts = { total: perAthlete.length, complete: 0, outstanding: 0, unknown: 0 };
  for (const entries of perAthlete) c[athleteStatus(entries)]++;
  return c;
}

export type TaskCompletionSummary = {
  task: CompletionTask;
  /** Per requirement this task asks for (athlete and/or parent). */
  requirements: Partial<Record<AckRequirement, RequirementCounts>>;
  /** All of this task's requirements together. */
  totals: RequirementCounts;
  athletes: AthleteCounts;
};

function summarize(task: CompletionTask, perAthlete: CompletionEntry[][]): TaskCompletionSummary {
  const requirements: Partial<Record<AckRequirement, RequirementCounts>> = {};
  for (const req of requirementsFor(task.audience)) {
    requirements[req] = countEntries(perAthlete.flatMap(es => es.filter(e => e.requirement === req)));
  }
  return { task, requirements, totals: countEntries(perAthlete.flat()), athletes: countAthletes(perAthlete) };
}

/** Team-wide summary: one entry per active task, counts only (no names). */
export function buildTeamSummary(
  tasks: readonly CompletionTask[],
  athletes: readonly CompletionAthlete[],
  rows: readonly CompletionStatusRow[],
): TaskCompletionSummary[] {
  const index = indexRows(rows);
  return tasks.map(task => summarize(task, athletes.map(a => entriesFor(index, task, a.id))));
}

export type AthleteCompletionRow = {
  athlete: CompletionAthlete;
  entries: CompletionEntry[];
  status: "complete" | "outstanding" | "unknown";
};

/** One task: each athlete's requirement states, plus the summary. */
export function buildTaskCompletion(
  task: CompletionTask,
  athletes: readonly CompletionAthlete[],
  rows: readonly CompletionStatusRow[],
): { summary: TaskCompletionSummary; athletes: AthleteCompletionRow[] } {
  const index = indexRows(rows);
  const list = [...athletes]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map(athlete => {
      const entries = entriesFor(index, task, athlete.id);
      return { athlete, entries, status: athleteStatus(entries) };
    });
  return { summary: summarize(task, list.map(r => r.entries)), athletes: list };
}

export type AthleteTaskCompletion = { task: CompletionTask; entries: CompletionEntry[]; status: "complete" | "outstanding" | "unknown" };

/** One athlete: each active task's applicable requirements. */
export function buildAthleteCompletion(
  athlete: CompletionAthlete,
  tasks: readonly CompletionTask[],
  rows: readonly CompletionStatusRow[],
): { athlete: CompletionAthlete; tasks: AthleteTaskCompletion[]; totals: RequirementCounts } {
  const index = indexRows(rows);
  const list = tasks.map(task => {
    const entries = entriesFor(index, task, athlete.id);
    return { task, entries, status: athleteStatus(entries) };
  });
  return { athlete, tasks: list, totals: countEntries(list.flatMap(t => t.entries)) };
}

export class CompletionVerificationError extends Error {}

/** The status rows must be EXACTLY one per (active task, athlete, required
 *  role) for the tasks and athletes just read, at each task's current
 *  revision — nothing missing, nothing duplicated, nothing extra. Anything
 *  else means the reads disagree (truncation, a concurrent edit, a new
 *  athlete or task between reads) and the result can't be trusted. */
export function verifyStatusRows(
  tasks: readonly CompletionTask[],
  athleteIds: readonly string[],
  rows: readonly CompletionStatusRow[],
): void {
  const expected = new Map<string, number>(); // key -> revision
  for (const t of tasks) {
    for (const a of athleteIds) for (const req of requirementsFor(t.audience)) expected.set(statusKey(t.id, a, req), t.revision);
  }
  const seen = new Set<string>();
  for (const r of rows) {
    const key = statusKey(r.task_id, r.athlete_id, r.requirement);
    if (seen.has(key)) throw new CompletionVerificationError(`duplicate status row ${key}`);
    seen.add(key);
    const revision = expected.get(key);
    if (revision === undefined) throw new CompletionVerificationError(`unexpected status row ${key}`);
    if (r.task_revision !== revision) throw new CompletionVerificationError(`revision changed for task ${r.task_id}`);
    if (typeof r.satisfied !== "boolean" || typeof r.has_eligible_member !== "boolean" || typeof r.earlier_revision_acknowledged !== "boolean") {
      throw new CompletionVerificationError(`malformed status row ${key}`);
    }
  }
  if (seen.size !== expected.size) throw new CompletionVerificationError(`missing ${expected.size - seen.size} status row(s)`);
}

// ── Display: dates in the team's time zone ────────────────────────────────

/** Teams have no stored time zone setting yet; every ELF team is in
 *  Arizona, and the Calendar uses the same fixed zone (calendarShared.ts).
 *  If a per-team setting is added, pass it to formatAcknowledgedDate. */
export const DEFAULT_TEAM_TIME_ZONE = "America/Phoenix";

/** "Oct 17, 2026" in the team's zone, whatever the viewer's device zone.
 *  Display only — stored timestamps are never changed. */
export function formatAcknowledgedDate(iso: string | null, timeZone: string = DEFAULT_TEAM_TIME_ZONE): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(d);
}

// ── Client-side checks of the coach completion responses ─────────────────
// The dashboard shows a response only if it is exactly the promised shape
// and internally consistent; otherwise it is "temporarily unavailable" —
// never partly shown. Every athlete's status is recomputed from its
// entries rather than trusted.

const COUNT_KEYS = ["required", "complete", "outstanding", "notAcknowledged", "needsUpdate", "cannotCompleteYet", "unknown"] as const;
const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

function parseCounts(c: unknown): RequirementCounts | null {
  if (!c || typeof c !== "object") return null;
  const r = c as Record<string, unknown>;
  if (!COUNT_KEYS.every(k => isCount(r[k]))) return null;
  const v = Object.fromEntries(COUNT_KEYS.map(k => [k, r[k]])) as RequirementCounts;
  if (v.complete + v.outstanding + v.unknown !== v.required) return null;
  if (v.notAcknowledged + v.needsUpdate + v.cannotCompleteYet !== v.outstanding) return null;
  return v;
}

function parseTask(t: unknown): CompletionTask | null {
  const x = t as Record<string, unknown> | null;
  if (!x || typeof x.id !== "string" || typeof x.title !== "string" || typeof x.audience !== "string" || !Number.isInteger(x.revision)) return null;
  if (requirementsFor(x.audience).length === 0) return null;
  return { id: x.id, title: x.title, audience: x.audience, revision: x.revision as number };
}

function parseSummary(s: unknown, expectedAthletes?: number): TaskCompletionSummary | null {
  const x = s as Record<string, unknown> | null;
  const task = parseTask(x?.task);
  if (!x || !task) return null;
  const reqs = requirementsFor(task.audience);
  const given = x.requirements as Record<string, unknown> | null;
  if (!given || typeof given !== "object" || Object.keys(given).sort().join() !== [...reqs].sort().join()) return null;
  const requirements: Partial<Record<AckRequirement, RequirementCounts>> = {};
  for (const req of reqs) {
    const c = parseCounts(given[req]);
    if (!c) return null;
    requirements[req] = c;
  }
  const totals = parseCounts(x.totals);
  const a = x.athletes as Record<string, unknown> | null;
  if (!totals || !a || !["total", "complete", "outstanding", "unknown"].every(k => isCount(a[k]))) return null;
  const athletes = { total: a.total, complete: a.complete, outstanding: a.outstanding, unknown: a.unknown } as AthleteCounts;
  if (athletes.complete + athletes.outstanding + athletes.unknown !== athletes.total) return null;
  if (expectedAthletes !== undefined && athletes.total !== expectedAthletes) return null;
  // Totals are the sum of the requirements; each requirement covers every athlete once.
  for (const k of COUNT_KEYS) if (reqs.reduce((n, r) => n + requirements[r]![k], 0) !== totals[k]) return null;
  for (const r of reqs) if (requirements[r]!.required !== athletes.total) return null;
  return { task, requirements, totals, athletes };
}

export type TeamSummaryView = { athleteCount: number; tasks: TaskCompletionSummary[] };

export function parseTeamSummaryResponse(body: unknown): TeamSummaryView | null {
  const b = body as { available?: unknown; athleteCount?: unknown; tasks?: unknown } | null;
  if (!b || b.available !== true || !isCount(b.athleteCount) || !Array.isArray(b.tasks)) return null;
  const tasks: TaskCompletionSummary[] = [];
  const ids = new Set<string>();
  for (const t of b.tasks) {
    const s = parseSummary(t, b.athleteCount);
    if (!s || ids.has(s.task.id)) return null;
    ids.add(s.task.id);
    tasks.push(s);
  }
  return { athleteCount: b.athleteCount, tasks };
}

export type TaskCompletionView = { summary: TaskCompletionSummary; athletes: AthleteCompletionRow[] };

export function parseTaskCompletionResponse(body: unknown): TaskCompletionView | null {
  const b = body as { available?: unknown; summary?: unknown; athletes?: unknown } | null;
  if (!b || b.available !== true || !Array.isArray(b.athletes)) return null;
  const summary = parseSummary(b.summary, b.athletes.length);
  if (!summary) return null;
  const reqs = requirementsFor(summary.task.audience);
  const rows: AthleteCompletionRow[] = [];
  const ids = new Set<string>();
  for (const r of b.athletes as Record<string, unknown>[]) {
    const a = r?.athlete as Record<string, unknown> | undefined;
    if (!a || typeof a.id !== "string" || typeof a.name !== "string" || ids.has(a.id)) return null;
    ids.add(a.id);
    if (!Array.isArray(r.entries) || r.entries.length !== reqs.length) return null;
    const entries: CompletionEntry[] = [];
    for (const [i, e] of (r.entries as Record<string, unknown>[]).entries()) {
      if (e?.requirement !== reqs[i]) return null; // exactly the task's requirements, in order
      const state = (typeof e.state === "string" && Object.hasOwn(COMPLETION_STATE_DISPLAY, e.state) ? e.state : "unknown") as CompletionState;
      entries.push({ requirement: reqs[i], state, acknowledgedAt: state === "complete" && typeof e.acknowledgedAt === "string" ? e.acknowledgedAt : null });
    }
    rows.push({
      athlete: {
        id: a.id,
        name: a.name,
        class_year: typeof a.class_year === "string" ? a.class_year : null,
        jersey_number: typeof a.jersey_number === "number" ? a.jersey_number : null,
      },
      entries,
      status: athleteStatus(entries),
    });
  }
  // The counts shown must be the counts of the rows shown.
  const recount = countEntries(rows.flatMap(r => r.entries));
  if (COUNT_KEYS.some(k => recount[k] !== summary.totals[k])) return null;
  for (const req of reqs) {
    const perReq = countEntries(rows.flatMap(r => r.entries.filter(e => e.requirement === req)));
    if (COUNT_KEYS.some(k => perReq[k] !== summary.requirements[req]![k])) return null;
  }
  const byStatus = { complete: 0, outstanding: 0, unknown: 0 };
  for (const r of rows) byStatus[r.status]++;
  if (byStatus.complete !== summary.athletes.complete || byStatus.outstanding !== summary.athletes.outstanding || byStatus.unknown !== summary.athletes.unknown) return null;
  return { summary, athletes: rows };
}

// ── Family view (athlete / parent on their own athlete profile) ──────────

/** The same per-athlete completion coaches see, limited to the tasks this
 *  family viewer can already see in their To-Do List (athletes: Athlete +
 *  Both; parents: Parent + Both) — so the profile never reveals a task
 *  title hidden from them. Each task keeps every requirement it asks for
 *  (a Both task shows the athlete AND parent/guardian status). Totals are
 *  recounted for the tasks kept. */
export function familyAthleteCompletion(
  view: { athlete: CompletionAthlete; tasks: AthleteTaskCompletion[] },
  audiences: readonly string[],
): { athlete: CompletionAthlete; tasks: AthleteTaskCompletion[]; totals: RequirementCounts } {
  const tasks = view.tasks.filter(t => audiences.includes(t.task.audience));
  return { athlete: view.athlete, tasks, totals: countEntries(tasks.flatMap(t => t.entries)) };
}

/** Which To-Do Tasks card the family athlete profile shows: "family" for
 *  an athlete or parent member (the page has already checked they may open
 *  this athlete), "coach" for coaches and platform admins, null for
 *  boosters and anyone else. Each card's API enforces its own rule. */
export function profileCompletionSource(actorKind: string, viewer: TaskViewer): "family" | "coach" | null {
  if (actorKind === "member" && (viewer === "athlete" || viewer === "parent")) return "family";
  return canViewCompletion(viewer) ? "coach" : null;
}
