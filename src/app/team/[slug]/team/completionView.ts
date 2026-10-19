// Team Management Phase 3C-3 — pure helpers for the coach completion
// dashboard (TaskCompletionView.tsx): grade tab + status filter + search,
// and the To-Do List's ?view=completion URLs. Display only.
import { matchesGradeTab, matchesRosterSearch, type GradeTabKey } from "./rosterHelpers.ts";
import type { AthleteCompletionRow } from "../../../../lib/teamTaskCompletion.ts";

export type CompletionFilter = "all" | "outstanding" | "complete";

export const COMPLETION_FILTERS: readonly { key: CompletionFilter; label: string }[] = [
  { key: "all",         label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "complete",    label: "Complete" },
];

/** "Complete" = every requirement the task asks of this athlete is
 *  complete (row.status, recomputed client-side from the entries).
 *  "Outstanding" = at least one requirement still outstanding. An athlete
 *  whose status is unknown appears only under All — never as complete. */
export function matchesCompletionFilter(row: Pick<AthleteCompletionRow, "status">, filter: CompletionFilter): boolean {
  if (filter === "all") return true;
  return row.status === filter;
}

export type CompletionRowFilters = { grade: GradeTabKey; filter: CompletionFilter; search: string };

export function filterCompletionRows<T extends Pick<AthleteCompletionRow, "status" | "athlete">>(rows: readonly T[], f: CompletionRowFilters): T[] {
  return rows.filter(r =>
    matchesGradeTab(r.athlete.class_year, f.grade) &&
    matchesRosterSearch(r.athlete.name, f.search) &&
    matchesCompletionFilter(r, f.filter));
}

/** Counts for the All / Outstanding / Complete buttons within the current
 *  grade tab and search. */
export function completionFilterCounts(rows: readonly Pick<AthleteCompletionRow, "status" | "athlete">[], f: Omit<CompletionRowFilters, "filter">): Record<CompletionFilter, number> {
  const inView = rows.filter(r => matchesGradeTab(r.athlete.class_year, f.grade) && matchesRosterSearch(r.athlete.name, f.search));
  return {
    all: inView.length,
    outstanding: inView.filter(r => r.status === "outstanding").length,
    complete: inView.filter(r => r.status === "complete").length,
  };
}

// ── URLs ─────────────────────────────────────────────────────────────────
// The dashboard lives in the To-Do List's own query string, like the task
// detail (?task=<id>):
//   ?view=completion               team summary
//   ?view=completion&task=<id>     one task's athletes
// The tab is kept on To-Do (?tab=todo, or an existing ?tab=clearance).

export function completionSearch(current: string, taskId?: string | null): string {
  const params = new URLSearchParams(current);
  if (params.get("tab") !== "clearance") params.set("tab", "todo");
  params.set("view", "completion");
  if (taskId) params.set("task", taskId);
  else params.delete("task");
  return `?${params.toString()}`;
}

/** Where the dashboard's own Back goes when there is no history entry of
 *  ours to return to (deep link or reload): task -> summary -> To-Do List. */
export function completionParentSearch(current: string): string {
  const params = new URLSearchParams(current);
  if (params.get("task")) params.delete("task");
  else params.delete("view");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
