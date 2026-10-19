// Phase 3C-3 — the completion dashboard in the To-Do List: who sees the
// entry points, navigation/history, and fail-closed rendering. Source
// scans, like todoList.test.ts; the API's own authorization is tested in
// api/team/[slug]/todo/completion/completion.route.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const todo = src("./TodoListView.tsx");
const view = src("./TaskCompletionView.tsx");
const has = (hay: string, needle: string) => assert.ok(hay.includes(needle), needle);

test("Completion button: coaches only (Head, Assistant, platform admin); Create Task stays Head-Coach-only", () => {
  has(todo, `const isCoachView = viewer === "manager" || viewer === "coach";`);
  assert.match(todo, /\{isCoachView && data\.available && \(\s*<div style=\{\{ display: "flex", gap: "\.4rem", flexShrink: 0 \}\}>\s*<button type="button" onClick=\{\(\) => openCompletion\(null, "list"\)\} className=\{`\$\{styles\.btnOutline\} elf-focus-ring`\} style=\{\{ flexShrink: 0 \}\}>Completion<\/button>/);
  // Create Task sits in the same group and still needs canManage (Head Coach / platform admin).
  assert.match(todo, /\{isCoachView && data\.available && \([\s\S]*?\{canManage && data\.available && \(\s*<button type="button" onClick=\{\(\) => setEditTarget\("new"\)\}[^>]*>\+ Create Task/);
  has(todo, `const canManage = !!data?.canManage;`);
  // Order in the header: heading, Completion, Create Task.
  assert.ok(todo.indexOf(">Completion</button>") < todo.indexOf(">+ Create Task</button>"));
});

test("?view=completion is honoured only for coaches; anyone else just sees the To-Do List", () => {
  has(todo, `const completionOpen = showTasks && isCoachView && data.available && viewParam === "completion";`);
  has(todo, `const selected = !showTasks || !selectedId || completionOpen ? null`);
  // Boosters never get tasks at all (showTasks), so never the dashboard.
  has(todo, `const showTasks = !!data && viewer !== "booster" && viewer !== "none" && (data.available || canManage);`);
});

test("View Completion on a task: coaches, active tasks only; grants no editing", () => {
  has(todo, `onViewCompletion={isCoachView && selected.status === "active" ? () => openCompletion(selected.id, "task") : undefined}`);
  const detail = todo.slice(todo.indexOf("function TaskDetail"), todo.indexOf("export default function TodoListView"));
  assert.match(detail, /\{onViewCompletion && \([\s\S]*?onClick=\{onViewCompletion\}[\s\S]*?View Completion/);
  // Edit / Move / Archive stay behind canManage (Head Coach / platform admin).
  assert.ok(detail.indexOf("{onViewCompletion && (") < detail.indexOf("{canManage && ("));
  assert.match(detail, /\{canManage && \([\s\S]*?onClick=\{\(\) => onEdit\(task\)\}/);
});

test("history: each completion view is its own entry; on-screen Back pops it, or steps up in place on a deep link", () => {
  assert.match(todo, /window\.history\.pushState\(\{ elfTodoBack: from \}, "", completionSearch\(window\.location\.search, taskId\)\);/);
  assert.match(todo, /const leaveCompletion = \(\) => \{\s*if \(historyBackTarget\(\)\) \{\s*window\.history\.back\(\);\s*return;\s*\}\s*const qs = completionParentSearch\(window\.location\.search\);\s*window\.history\.replaceState\(null, "", qs \|\| window\.location\.pathname\);/);
  // The Back label follows the entry (survives browser Back/Forward), server snapshot null.
  has(todo, `const backTarget = useSyncExternalStore(subscribeHistory, historyBackTarget, () => null);`);
  has(todo, `backLabel={backTarget === "task" ? "Back to Task" : "Back to Completion"}`);
  has(todo, `onOpenTask={id => openCompletion(id, "completion")}`);
  // Never router navigation (TeamTabs reads ?tab= once; no tab switch).
  assert.doesNotMatch(todo, /router\.(push|replace)/);
  // The existing ?task= detail navigation is unchanged.
  assert.match(todo, /const closeTask = \(\) => \{\s*if \(pushedRef\.current\) \{\s*pushedRef\.current = false;\s*window\.history\.back\(\);/);
});

test("dashboard reads only the coach-only completion APIs", () => {
  has(view, "useCompletion(`/api/team/${slug}/todo/completion`, parseTeamSummaryResponse)");
  has(view, "useCompletion(`/api/team/${slug}/todo/completion/tasks/${encodeURIComponent(taskId)}`, parseTaskCompletionResponse, TASK_MESSAGES)");
  assert.doesNotMatch(view, /method: "(POST|PUT|PATCH|DELETE)"/);
});

test("fail closed: any failure or inconsistent response is 'temporarily unavailable' with Try again", () => {
  has(view, `export const COMPLETION_UNAVAILABLE = "Completion status is temporarily unavailable.";`);
  assert.match(view, /if \(!res\.ok\) return \{ kind: "error", message: messages\[res\.status\] \?\? COMPLETION_UNAVAILABLE \};/);
  assert.match(view, /return value \? \{ kind: "ready", value \} : \{ kind: "error", message: COMPLETION_UNAVAILABLE \};/);
  assert.match(view, /\{state\.kind === "error" && <Unavailable message=\{state\.message\} onRetry=\{reload\} \/>\}/g);
  assert.match(view, /function Unavailable[\s\S]*?role="alert"[\s\S]*?onClick=\{onRetry\}[\s\S]*?Try again/);
  // Archived / removed while open: a clear message, not a broken page.
  has(view, `409: "This task was archived, so it's no longer a current requirement."`);
  has(view, `404: "This task isn't on the To-Do List anymore."`);
});

test("icons and text: only complete is green; unknown grey; dates in the team zone", () => {
  has(view, `const fill = icon === "check" ? "#16a34a" : icon === "x" ? "#dc2626" : "#9ca3af";`);
  assert.match(view, /<StateIcon state=\{entry\.state\} \/>[\s\S]*?\{REQUIREMENT_LABELS\[entry\.requirement\]\}:[\s\S]*?\{text\}/);
  has(view, `const date = entry.state === "complete" ? formatAcknowledgedDate(entry.acknowledgedAt) : "";`);
  assert.doesNotMatch(view, /toLocaleDateString/);
});

test("summary: requirement counts and distinct-athlete counts are labelled separately", () => {
  assert.match(view, /<strong[^>]*>\{c\.complete\}<\/strong> \/ \{c\.required\} acknowledged/);
  assert.match(view, /\{s\.totals\.outstanding\} requirement\{[^}]*\} · \{s\.athletes\.outstanding\} of \{s\.athletes\.total\} athlete/);
  has(view, "Can&apos;t complete yet");
  has(view, "athlete${ath.cannotCompleteYet === 1 ? \"\" : \"s\"} not joined");
  has(view, "with no parent linked");
});

test("task view: name + grade, shared GradeTabs, All / Outstanding / Complete, search, empty states", () => {
  has(view, `import GradeTabs, { gradeTabId, gradeTabPanelId } from "./GradeTabs";`);
  has(view, "const tabs = useMemo(() => buildGradeTabs(rows.map(r => r.athlete)), [rows]);");
  has(view, "const activeGrade = resolveGradeTab(grade, tabs);");
  assert.match(view, /aria-pressed=\{filter === f\.key\}/);
  assert.match(view, /type="search"[\s\S]*?fontSize: "1rem"/); // 16px: no iOS zoom
  has(view, `{row.athlete.class_year || "No grade set"}`);
  for (const msg of ["No athletes on the roster yet.", "No athletes match your search.", "No outstanding athletes here.",
    "No athletes here have completed every requirement yet.", "No active tasks. Completion appears here once a task is created."]) has(view, msg);
});

test("layout: no <section> (globals.css padding), same column width as the To-Do List", () => {
  const code = view.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /<section\b/);
  has(view, `const column: React.CSSProperties = { width: "100%", maxWidth: 760, minWidth: 0 };`);
});
