// Team Management Phase 4 — To-Do completion CSV reports: pure builder.
// Data comes from the Phase 3C strict, verified loaders
// (teamTaskCompletionStore.ts); this module only turns verified rows into
// a CSV, and refuses (throws CompletionCsvError) rather than produce a
// misleading report.
//
// One layout for both reports (one task, or all active tasks): one row per
// athlete per task. Every athlete on the roster is included — the
// dashboard's grade/search/status filters never apply here.
//
// Never included: typed acknowledgment names, member/account ids, the
// acknowledging person's name, IP addresses, browser details or audit data
// (the inputs below don't carry them).
import { requirementsFor, type AckRequirement } from "./teamTaskAcks.ts";
import { compareAthleteClasses, NO_GRADE_SET_LABEL } from "./athleteClass.ts";
import { sanitizeFilenameSegment } from "./teamJoinQr.ts";
import {
  DEFAULT_TEAM_TIME_ZONE,
  athleteStatus,
  type CompletionAthlete,
  type CompletionEntry,
  type CompletionState,
  type CompletionTask,
} from "./teamTaskCompletion.ts";

export const COMPLETION_CSV_HEADERS = [
  "Grade",
  "Athlete Name",
  "Task",
  "Task Revision",
  "Task Audience",
  "Athlete Acknowledgment",
  "Athlete Acknowledged On",
  "Parent/Guardian Acknowledgment",
  "Parent/Guardian Acknowledged On",
  "Overall Status",
  "Outstanding Reason",
] as const;

/** Vercel caps a function's response body at 4.5 MB; refuse well below it
 *  rather than risk a cut-off download. */
export const MAX_COMPLETION_CSV_BYTES = 4 * 1024 * 1024;

export class CompletionCsvError extends Error {
  readonly reason: "inconsistent" | "too_large";
  constructor(reason: "inconsistent" | "too_large", message: string) {
    super(message);
    this.reason = reason;
  }
}

// ── Cells ─────────────────────────────────────────────────────────────────

// Characters a spreadsheet may treat as the start of a formula (OWASP CSV
// injection), plus their full-width forms.
const FORMULA_START = /^[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/;
// Whitespace and control characters a spreadsheet may skip before reading
// a formula: " =1+1", tab or NBSP before =, a zero-width space before @.
const LEADING_IGNORABLE = /^[\s\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060\uFEFF]+/;

/** Neutralises formula injection: any text that, after leading whitespace
 *  or control characters, starts like a formula (or starts with a tab/CR
 *  or other control character at all) is prefixed with an apostrophe so
 *  spreadsheets show it as text. The original text is otherwise kept. */
export function neutralizeFormula(value: string): string {
  if (value === "") return value;
  const stripped = value.replace(LEADING_IGNORABLE, "");
  const startsWithControl = /^[\u0000-\u001F\u007F-\u009F]/.test(value);
  return FORMULA_START.test(stripped) || startsWithControl ? `'${value}` : value;
}

/** RFC 4180 quoting (commas, quotes, CR, LF), after formula neutralising. */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const text = typeof value === "number" ? String(value) : neutralizeFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ── Values ────────────────────────────────────────────────────────────────

export const CSV_AUDIENCE_LABELS: Record<string, string> = { athlete: "Athlete", parent: "Parent", both: "Both" };

export const NOT_REQUIRED = "Not Required";

const STATE_LABELS: Record<AckRequirement, Record<Exclude<CompletionState, "unknown">, string>> = {
  athlete: {
    complete: "Acknowledged",
    outstanding: "Not Acknowledged",
    needs_update: "Needs New Acknowledgment",
    not_joined: "Not Joined ELF",
    no_parent_linked: "Not Acknowledged", // never produced for an athlete requirement
  },
  parent: {
    complete: "Acknowledged",
    outstanding: "Not Acknowledged",
    needs_update: "Needs New Acknowledgment",
    not_joined: "Not Acknowledged", // never produced for a parent requirement
    no_parent_linked: "No Parent Linked",
  },
};

const REASONS: Record<AckRequirement, Partial<Record<CompletionState, string>>> = {
  athlete: {
    outstanding: "Athlete has not acknowledged",
    needs_update: "Athlete must re-acknowledge (task updated)",
    not_joined: "Athlete has not joined ELF",
  },
  parent: {
    outstanding: "Parent/guardian has not acknowledged",
    needs_update: "Parent/guardian must re-acknowledge (task updated)",
    no_parent_linked: "No parent/guardian linked",
  },
};

/** YYYY-MM-DD in the team's time zone (America/Phoenix). */
export function csvDate(iso: string | null, timeZone: string = DEFAULT_TEAM_TIME_ZONE): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// ── Rows ──────────────────────────────────────────────────────────────────

export type CompletionCsvInput = {
  task: CompletionTask;
  athletes: { athlete: CompletionAthlete; entries: CompletionEntry[] }[];
};

export type CompletionCsvRow = {
  grade: string;
  athleteName: string;
  athleteId: string; // sort tie-break only; never written to the CSV
  task: CompletionTask;
  athlete: { state: string; on: string };
  parent: { state: string; on: string };
  overall: "Complete" | "Outstanding";
  reason: string;
};

function requirementCells(entries: CompletionEntry[], req: AckRequirement, applies: boolean) {
  if (!applies) return { state: NOT_REQUIRED, on: "" };
  const e = entries.find(x => x.requirement === req)!;
  const state = e.state as Exclude<CompletionState, "unknown">;
  return { state: STATE_LABELS[req][state], on: state === "complete" ? csvDate(e.acknowledgedAt) : "" };
}

/** Verified rows, one per athlete per task. Throws if any athlete's
 *  entries aren't exactly the task's requirements, or any state is
 *  unknown — an unverifiable status is never reported. */
export function buildCompletionCsvRows(inputs: readonly CompletionCsvInput[]): CompletionCsvRow[] {
  const rows: CompletionCsvRow[] = [];
  const taskIds = new Set<string>();
  for (const { task, athletes } of inputs) {
    if (taskIds.has(task.id)) throw new CompletionCsvError("inconsistent", `task ${task.id} listed twice`);
    taskIds.add(task.id);
    const reqs = requirementsFor(task.audience);
    if (reqs.length === 0) throw new CompletionCsvError("inconsistent", `task ${task.id} has an unknown audience`);
    const seen = new Set<string>();
    for (const { athlete, entries } of athletes) {
      if (seen.has(athlete.id)) throw new CompletionCsvError("inconsistent", `athlete listed twice for task ${task.id}`);
      seen.add(athlete.id);
      if (entries.length !== reqs.length || !reqs.every((r, i) => entries[i]?.requirement === r)) {
        throw new CompletionCsvError("inconsistent", `requirements don't match task ${task.id}`);
      }
      if (entries.some(e => e.state === "unknown" || !Object.hasOwn(STATE_LABELS[e.requirement], e.state))) {
        throw new CompletionCsvError("inconsistent", `unverified status for task ${task.id}`);
      }
      const status = athleteStatus(entries);
      if (status === "unknown") throw new CompletionCsvError("inconsistent", `unverified status for task ${task.id}`);
      rows.push({
        grade: athlete.class_year || NO_GRADE_SET_LABEL,
        athleteName: athlete.name,
        athleteId: athlete.id,
        task,
        athlete: requirementCells(entries, "athlete", reqs.includes("athlete")),
        parent: requirementCells(entries, "parent", reqs.includes("parent")),
        overall: status === "complete" ? "Complete" : "Outstanding",
        reason: entries.map(e => REASONS[e.requirement][e.state]).filter(Boolean).join("; "),
      });
    }
  }
  return rows.sort(compareCsvRows);
}

const codepoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Grade (ELF grade order, "No grade set" last), athlete name, task title;
 *  then exact code-point order and ids, so ties never depend on input order. */
export function compareCsvRows(a: CompletionCsvRow, b: CompletionCsvRow): number {
  const noGrade = (r: CompletionCsvRow) => (r.grade === NO_GRADE_SET_LABEL ? 1 : 0);
  return noGrade(a) - noGrade(b)
    || (noGrade(a) ? 0 : compareAthleteClasses(a.grade, b.grade))
    || a.athleteName.localeCompare(b.athleteName, "en", { sensitivity: "base" })
    || codepoint(a.athleteName, b.athleteName)
    || codepoint(a.athleteId, b.athleteId)
    || a.task.title.localeCompare(b.task.title, "en", { sensitivity: "base" })
    || codepoint(a.task.title, b.task.title)
    || codepoint(a.task.id, b.task.id);
}

/** UTF-8 BOM + CRLF (Excel). Throws if the result would be too large to
 *  download safely. */
export function buildCompletionCsv(rows: readonly CompletionCsvRow[]): string {
  const lines = [COMPLETION_CSV_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.grade),
      csvCell(r.athleteName),
      csvCell(r.task.title),
      csvCell(r.task.revision),
      csvCell(CSV_AUDIENCE_LABELS[r.task.audience]),
      csvCell(r.athlete.state),
      csvCell(r.athlete.on),
      csvCell(r.parent.state),
      csvCell(r.parent.on),
      csvCell(r.overall),
      csvCell(r.reason),
    ].join(","));
  }
  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
  if (new TextEncoder().encode(csv).length > MAX_COMPLETION_CSV_BYTES) {
    throw new CompletionCsvError("too_large", `report is over ${MAX_COMPLETION_CSV_BYTES} bytes`);
  }
  return csv;
}

// ── Filename ──────────────────────────────────────────────────────────────

const MAX_TITLE_SEGMENT = 60;

/** {school}-{sport}-todo-{task|all-tasks}-completion-YYYY-MM-DD.csv — ASCII
 *  only (safe in Content-Disposition and every file system). Falls back to
 *  the team slug, then "team", if names are missing. */
export function completionCsvFilename(opts: {
  schoolName?: string | null;
  sportName?: string | null;
  slug: string;
  taskTitle?: string | null;
  date: string; // YYYY-MM-DD
}): string {
  const team = [opts.schoolName ?? "", opts.sportName ?? ""].map(sanitizeFilenameSegment).filter(Boolean).join("-")
    || sanitizeFilenameSegment(opts.slug) || "team";
  const scope = opts.taskTitle === undefined || opts.taskTitle === null
    ? "all-tasks"
    : sanitizeFilenameSegment(opts.taskTitle).slice(0, MAX_TITLE_SEGMENT).replace(/-+$/, "") || "task";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date : "undated";
  return `${team}-todo-${scope}-completion-${date}.csv`;
}

/** Today's date (YYYY-MM-DD) in the team's time zone. */
export function exportDate(now: Date = new Date()): string {
  return csvDate(now.toISOString());
}
