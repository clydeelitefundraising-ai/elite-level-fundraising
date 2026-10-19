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

function athleteStatus(entries: readonly CompletionEntry[]): "complete" | "outstanding" | "unknown" {
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
