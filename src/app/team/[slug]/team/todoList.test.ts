// Team Management Phase 2 — structural checks on the To-Do List tab and
// the phase_t2 migration. Source scans, same approach as the repo's other
// client-component tests; they pin the approved behavior rather than
// render it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const tabs      = src("./TeamTabs.tsx");
const page      = src("./page.tsx");
const todo      = src("./TodoListView.tsx");
const form      = src("./TaskFormModal.tsx");
const clearance = src("./ClearanceView.tsx");
const ackUi     = src("./TaskAcknowledgment.tsx");
const sql       = src("../../../../../supabase/migrations/phase_t2_team_tasks.sql");
const sqlCode   = sql.replace(/--.*$/gm, "");

const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Navigation ────────────────────────────────────────────────────────────

test("tab is labelled To-Do List; internal id stays 'clearance'; ?tab=todo is an alias", () => {
  assert.match(tabs, /\{ id: "clearance", label: "To-Do List" \}/);
  assert.doesNotMatch(tabs, /label: "Clearance"/);
  assert.match(tabs, /tabParam === "clearance" \|\| tabParam === "todo" \? "clearance"/);
  assert.match(tabs, /\{tab === "clearance" && clearance\}/);
});

test("the tab renders the To-Do List, which embeds the existing Clearance resources", () => {
  assert.match(page, /clearance=\{<TodoListView slug=\{slug\} \/>\}/);
  assert.match(todo, /<ClearanceView slug=\{slug\} \/>/);
});

// ── Existing Clearance resources: behavior unchanged ──────────────────────

test("Resources section keeps every existing Clearance endpoint and permission gate", () => {
  assert.match(clearance, /fetch\(`\/api\/team\/\$\{slug\}\/clearance`\)/);
  assert.match(clearance, /`\/api\/team\/\$\{slug\}\/clearance\/\$\{resource\.id\}`, \{ method: "DELETE" \}/);
  assert.match(clearance, /`\/api\/team\/\$\{slug\}\/clearance\/\$\{resource\.id\}\/reorder`/);
  assert.match(clearance, /`\/api\/team\/\$\{slug\}\/clearance\/upload`/);
  assert.match(clearance, /setCanManage\(!!data\.canManage\)/);
  assert.match(clearance, /downloadViaFetch\(`\/api\/team\/\$\{slug\}\/files\/\$\{attachment\.id\}`/);
  assert.match(clearance, /<h3[^>]*>\s*Resources\s*<\/h3>/);
});

// ── Phase 2 boundaries ────────────────────────────────────────────────────

// ── Phase 3: acknowledgments ──────────────────────────────────────────────

test("the acknowledgment form lives only in TaskAcknowledgment, shown in active task details", () => {
  assert.doesNotMatch(withoutComments(todo), /type="checkbox"/);
  assert.match(todo, /\{task\.status === "active" && \(\s*<TaskAcknowledgment\s+key=\{`\$\{task\.id\}:\$\{task\.revision\}`\}/);
  assert.match(ackUi, /fetch\(url\)/);
  assert.match(ackUi, /const url = `\/api\/team\/\$\{slug\}\/todo\/tasks\/\$\{taskId\}\/acknowledgment`;/);
});

test("form: typed name, required statement checkbox (server-provided text), Submit Acknowledgment", () => {
  assert.match(ackUi, /Your full name\s*<input\s+type="text"/);
  assert.match(ackUi, /autoComplete="name"/);
  assert.match(ackUi, /type="checkbox"\s+checked=\{confirmed\}/);
  assert.match(ackUi, /<span>\{view\.statement\.text\}<\/span>/);
  assert.match(ackUi, /\{submitting \? "Submitting…" : "Submit Acknowledgment"\}/);
  assert.match(ackUi, /const canSubmit = validName && confirmed && !submitting && outstanding\.length > 0;/);
  // Mobile: 16px input (no iOS zoom), 44px targets.
  assert.match(ackUi, /fontSize: "1rem", width: "100%"[^}]*minHeight: 44/);
  assert.match(ackUi, /alignItems: "flex-start", gap: "\.65rem", minHeight: 44/);
});

test("the browser sends only revision, name, checkbox and the athletes it showed — never identity", () => {
  const body = ackUi.slice(ackUi.indexOf("body: JSON.stringify({"), ackUi.indexOf("}),", ackUi.indexOf("body: JSON.stringify({")));
  assert.deepEqual([...body.matchAll(/^\s+(\w+):/gm)].map(m => m[1]), ["expected_revision", "full_name", "confirmed", "athlete_ids"]);
  assert.doesNotMatch(ackUi, /member_id|account_id/);
});

test("parents see exactly which children are covered before submitting", () => {
  assert.match(ackUi, /Your acknowledgment will be recorded for\{" "\}\s*<strong>\{listNames\(outstanding\.map\(c => c\.name\)\)\}<\/strong>/);
});

test("status: green check / red X with text (never colour alone); completed state hides the form", () => {
  assert.match(ackUi, /fill="#16a34a"/);
  assert.match(ackUi, /fill="#dc2626"/);
  assert.match(ackUi, /className=\{styles\.srOnly\}>\{e\.satisfied \? " — complete" : " — outstanding"\}/);
  assert.match(ackUi, /\{outstanding\.length > 0 && \(\s*<form/);
  assert.match(ackUi, /complete for the current version of this task/);
  assert.match(css, /\.srOnly \{[^}]*clip: rect\(0, 0, 0, 0\);/);
});

test("rows: athletes/parents get a status icon between title and chevron; screen-reader text included", () => {
  assert.match(todo, /\{t\.my_ack && <AckRowIcon status=\{t\.my_ack\} \/>\}\s*<Chevron \/>/);
  assert.match(todo, /<span className=\{styles\.srOnly\}>\{text\}<\/span>/);
});

test("no <section> elements in the new UI (global marketing padding)", () => {
  assert.doesNotMatch(withoutComments(ackUi), /<section\b/);
});

test("task management controls are shown only when the API says canManage; no delete control", () => {
  assert.match(todo, /\{canManage && data\.available && \(\s*<button type="button" onClick=\{\(\) => setEditTarget\("new"\)\}/);
  assert.match(todo, /\{canManage && \(\s*<div/);
  assert.doesNotMatch(withoutComments(todo), /method: "DELETE"/);
  assert.match(todo, /post\("archive", \{ archived: true \}/);
  assert.match(todo, /post\("archive", \{ archived: false \}/);
});

test("boosters keep Resources only; before migration only the Head Coach sees a setup note", () => {
  assert.match(todo, /const showTasks = !!data && viewer !== "booster" && viewer !== "none" && \(data\.available \|\| canManage\);/);
  assert.match(todo, /To-Do tasks aren&apos;t set up for this team yet/);
});

test("edits send the task version (conflict detection); documents use the existing private upload", () => {
  assert.match(form, /expected_version: task\.version/);
  assert.match(form, /fetch\(`\/api\/team\/\$\{slug\}\/clearance\/upload`, \{ method: "POST", body: form \}\)/);
  assert.match(form, /fetch\(`\/api\/team\/\$\{slug\}\/todo\/files`\)/);
});

// ── Mobile / desktop ──────────────────────────────────────────────────────

test("form controls are 16px (no iOS zoom) with 44px touch targets; text wraps instead of overflowing", () => {
  assert.match(form, /fontSize: "1rem",\s*width: "100%", boxSizing: "border-box", color: "#111827", background: "#fff", minHeight: 44/);
  assert.match(form, /minHeight: 44, padding: "0 \.8rem"/); // audience options
  assert.match(todo, /overflowWrap: "anywhere"/);
  assert.match(todo, /flexWrap: "wrap"/);
});

// ── Layout: compact rows + detail view ───────────────────────────────────

const css = src("./Team.module.css");

const has = (hay: string, needle: string, msg = needle) => assert.ok(hay.includes(needle), msg);

test("main list shows each task as a full-width row: title, (families) status icon, chevron", () => {
  const rows = todo.slice(todo.indexOf("function TaskRows"), todo.indexOf("function TaskDetail"));
  has(rows, `<button type="button" className={styles.todoRow} onClick={() => onOpen(t)}>`);
  assert.match(rows, /<span className=\{styles\.todoRowTitle\}[^>]*>\{t\.title\}<\/span>\s*\{t\.my_ack && <AckRowIcon status=\{t\.my_ack\} \/>\}\s*<Chevron \/>/);
  // Nothing else from the task on the row.
  assert.doesNotMatch(rows, /instructions|body_text|resources|audience|TASK_AUDIENCE_LABELS/);
  // Existing order: rows render in the order the API returns.
  has(todo, `<TaskRows tasks={tasks} onOpen={t => openTask(t.id)} />`);
  assert.match(css, /\.todoRow \{[^}]*width: 100%;[^}]*min-height: 52px;[^}]*text-align: left;/);
  assert.match(css, /\.todoList > li \+ li \{\s*border-top: 1px solid/);
  assert.match(css, /\.todoRowTitle \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
});

test("left-aligned column with a desktop max width; Resources stays below the list", () => {
  has(todo, `const column: React.CSSProperties = { width: "100%", maxWidth: 760, minWidth: 0 };`);
  assert.doesNotMatch(withoutComments(todo), /margin: "0 auto"/);
  assert.ok(todo.indexOf("<TaskRows tasks={tasks}") < todo.indexOf("<ClearanceView slug={slug} />"));
  assert.match(todo, /<div hidden=\{!!selected\} style=\{column\}>\s*<ClearanceView slug=\{slug\} \/>/);
  // Resources empty/loading states are left-aligned and compact too.
  assert.doesNotMatch(clearance, /textAlign: "center", padding: "2rem/);
});

test("detail view: back action, full content, and Head Coach actions inside it", () => {
  const detail = todo.slice(todo.indexOf("function TaskDetail"), todo.indexOf("export default function TodoListView"));
  assert.match(detail, /onClick=\{onBack\}[\s\S]*?Back to To-Do List/);
  for (const part of ["task.instructions", "task.body_text", "links.map", "docs.map"]) has(detail, part);
  has(detail, "{canManage && (");
  has(detail, "onClick={() => onEdit(task)}");
  has(detail, `post("archive", { archived: true }`);
  has(detail, `post("archive", { archived: false }`);
  has(detail, `post("move", { direction: "up" }`);
  has(detail, `post("move", { direction: "down" }`);
  // Long content scrolls with the page (no clamping); text wraps.
  assert.doesNotMatch(detail, /overflow: "hidden"|WebkitLineClamp|maxHeight/);
  has(detail, "<p style={bodyText}>{task.instructions}</p>");
  has(todo, `whiteSpace: "pre-wrap", overflowWrap: "anywhere"`);
});

test("no <section> elements: globals.css `section { padding: 6rem 5% }` would add ~96px gaps", () => {
  const global = src("../../../globals.css");
  assert.match(global, /\nsection \{\s*padding: 6rem 5%;/); // the rule this guards against
  for (const [name, code] of [["TodoListView", todo], ["ClearanceView", clearance]] as const) {
    assert.doesNotMatch(withoutComments(code), /<section\b/, name);
  }
  // Vertical rhythm: 16px under the description, 24px between Tasks and Resources.
  has(todo, `margin: ".2rem 0 1rem", fontSize: ".82rem"`);
  has(todo, `<div role="region" aria-labelledby="todo-active-heading" style={{ marginBottom: "1.5rem" }}>`);
  assert.doesNotMatch(withoutComments(todo), /minHeight: "?100(vh|%)|justifyContent: "space-(between|around)"/);
});

test("Resources is a compact list matching the task rows, with every existing action", () => {
  has(clearance, `import styles from "./Team.module.css";`);
  assert.match(clearance, /<ul className=\{styles\.todoList\}>\s*\{resources\.map/);
  const card = clearance.slice(clearance.indexOf("function ResourceCard"), clearance.indexOf("function EditModal"));
  has(card, `<li style={{ padding: ".65rem 1rem" }}>`);
  assert.doesNotMatch(card, /boxShadow/);
  for (const label of ["Open Link", "View", "Download", "Edit", "Move Up", "Move Down", "Delete"]) {
    assert.match(card, new RegExp(`>\\s*${label}\\s*<|"${label}"`), label);
  }
  has(card, "{canManage && (");
});

test("buttons reuse the Communications tokens: solid Create Task / Add Resource, outline Open Link / View / Download", () => {
  const messages = src("../messages/MessagesView.tsx");
  // The Communications "+ New" / "New Group" buttons these mirror.
  has(messages, `background: "var(--team-primary)", color: "var(--team-primary-foreground)"`);
  has(messages, `border: "1.5px solid var(--team-primary)"`);
  assert.match(css, /\.btnSolid \{\s*background: var\(--team-primary\);\s*color: var\(--team-primary-foreground\);/);
  assert.match(css, /\.btnOutline \{\s*background: #fff;\s*color: var\(--team-primary\);\s*border: 1\.5px solid var\(--team-primary\);/);
  assert.match(css, /\.btnSolid:disabled,\s*\.btnOutline:disabled \{[^}]*cursor: not-allowed;/);
  // No new orange: only the team tokens.
  assert.doesNotMatch(css, /#ff5a1f|#de4712|--elf-orange/i);

  const solid = "className={`${styles.btnSolid} elf-focus-ring`}";
  assert.match(todo, /className=\{`\$\{styles\.btnSolid\} elf-focus-ring`\} style=\{\{ flexShrink: 0 \}\}>\+ Create Task/);
  assert.match(clearance, /className=\{`\$\{styles\.btnSolid\} elf-focus-ring`\}\s*>\s*\+ Add Resource/);
  has(clearance, solid);
  has(clearance, "const outlineBtn = `${styles.btnOutline} elf-focus-ring`;");
  assert.equal(clearance.match(/className=\{outlineBtn\}/g)?.length, 3); // Open Link, View, Download
  assert.equal(todo.match(/className=\{`\$\{styles\.btnOutline\} elf-focus-ring`\}/g)?.length, 2); // task View, Download
  // Destructive actions stay distinct from the team colour.
  assert.match(todo, /color: "#b91c1c", border: "1\.5px solid #fecaca"[^>]*>\s*Archive/);
  assert.match(clearance, /color: "#dc2626" \}\}>\s*Delete/);
});

test("device/browser Back closes an open task: detail is a ?task= history entry", () => {
  has(todo, `import { useSearchParams } from "next/navigation";`);
  has(todo, `const selectedId = searchParams.get("task");`);
  assert.match(todo, /const openTask = \(id: string\) => \{[\s\S]*?params\.set\("task", id\);\s*window\.history\.pushState\(null, "", `\?\$\{params\.toString\(\)\}`\);/);
  // On-screen Back pops our own entry; a deep-linked task drops ?task= in place.
  assert.match(todo, /const closeTask = \(\) => \{\s*if \(pushedRef\.current\) \{\s*pushedRef\.current = false;\s*window\.history\.back\(\);/);
  assert.match(todo, /params\.delete\("task"\);[\s\S]*?window\.history\.replaceState\(/);
  has(todo, "onBack={closeTask}");
  assert.doesNotMatch(todo, /router\.(push|replace)|setSelectedId/);
  // Existing ?tab=clearance links keep their value; otherwise the alias is used.
  has(todo, `if (params.get("tab") !== "clearance") params.set("tab", "todo");`);
  // TeamTabs still reads ?tab= once, so URL changes here never switch tabs.
  assert.match(tabs, /const \[tab, setTab\] = useState<Tab>\(initial\);/);
});

// ── Migration ─────────────────────────────────────────────────────────────

// Function bodies ($$ … $$), keyed by function name. Anchored on CREATE OR
// REPLACE so "EXECUTE FUNCTION …" in CREATE TRIGGER can't match.
const bodies = new Map(
  [...sqlCode.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/g)].map(m => [m[1], { header: m[2], body: m[3] }]),
);

test("migration is additive: creates only the new tables/functions; never alters or drops existing objects", () => {
  assert.doesNotMatch(sqlCode, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sqlCode, /\bALTER\s+TABLE\s+(?!public\.team_tasks\b|public\.team_task_resources\b)/i);
  assert.doesNotMatch(sqlCode, /\b(DELETE\s+FROM|UPDATE|INSERT\s+INTO)\s+(public\.)?clearance_resources\b/i);
  assert.doesNotMatch(sqlCode, /\bTRUNCATE\b/i);
  const created = [...sqlCode.matchAll(/CREATE TABLE IF NOT EXISTS ([\w.]+)/g)].map(m => m[1]);
  assert.deepEqual(created, ["public.team_tasks", "public.team_task_resources"]);
  // Only this migration's own triggers, and the never-applied draft signature of its own function.
  const drops = [...sqlCode.matchAll(/DROP\s+(TRIGGER|FUNCTION)\s+IF EXISTS\s+([\w.]+(?:\([^)]*\))?)/gi)].map(m => `${m[1]} ${m[2]}`);
  assert.deepEqual(drops, [
    "TRIGGER team_tasks_guard",
    "TRIGGER team_task_resources_guard",
    "FUNCTION public.team_task_update(uuid, text, integer, boolean, jsonb, jsonb, jsonb)",
  ]);
});

test("migration security: RLS on both tables; functions executable by service_role only", () => {
  assert.match(sqlCode, /ALTER TABLE public\.team_tasks ENABLE ROW LEVEL SECURITY;/);
  assert.match(sqlCode, /ALTER TABLE public\.team_task_resources ENABLE ROW LEVEL SECURITY;/);
  assert.doesNotMatch(sqlCode, /CREATE POLICY/i);
  assert.doesNotMatch(sqlCode, /SECURITY DEFINER/i);
  for (const fn of ["team_task_create", "team_task_update", "team_task_move", "team_task_resource_set"]) {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      assert.match(sqlCode, new RegExp(`REVOKE (ALL|EXECUTE)\\s+ON FUNCTION public\\.${fn}\\([^)]*\\) FROM ${role};`), `${fn} ${role}`);
    }
    assert.match(sqlCode, new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`), fn);
  }
  for (const fn of ["team_tasks_guard", "team_task_resources_guard"]) {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      assert.match(sqlCode, new RegExp(`REVOKE (ALL|EXECUTE)\\s+ON FUNCTION public\\.${fn}\\(\\)\\s+FROM ${role};`), `${fn} ${role}`);
    }
  }
  // The REVOKE/GRANT signatures match the function actually created.
  assert.match(sqlCode, /FUNCTION public\.team_task_update\(\s*p_task_id\s+uuid,\s*p_campaign_slug\s+text,\s*p_expected_version integer,\s*p_task\s+jsonb,\s*p_resources\s+jsonb,\s*p_actor\s+jsonb\s*\)/);
  assert.match(sqlCode, /GRANT\s+EXECUTE ON FUNCTION public\.team_task_update\(uuid, text, integer, jsonb, jsonb, jsonb\) TO service_role;/);
});

test("every function: empty search_path and fully schema-qualified table references", () => {
  assert.deepEqual([...bodies.keys()].sort(), [
    "team_task_create", "team_task_move", "team_task_resource_set", "team_task_resources_guard", "team_task_update", "team_tasks_guard",
  ]);
  for (const [name, { header, body }] of bodies) {
    assert.match(header, /SET search_path = ''\s*$/, `${name}: search_path`);
    const unqualified = body.match(/(?<![.\w])(team_tasks|team_task_resources|team_files)\b/g);
    assert.equal(unqualified, null, `${name}: unqualified ${unqualified}`);
  }
  assert.doesNotMatch(sqlCode, /search_path = public/);
  for (const ref of ["public.elf_accounts(id)", "public.team_coaches(id)", "public.platform_admins(id)", "public.team_files(id)", "public.team_tasks(id)"]) {
    assert.ok(sqlCode.includes(`REFERENCES ${ref}`), ref);
  }
});

test("migration constraints: strict audience/status, http(s) links, file refs RESTRICT, same-team guard", () => {
  assert.match(sqlCode, /CHECK \(audience IN \('athlete', 'parent', 'both'\)\)/);
  assert.match(sqlCode, /CHECK \(status IN \('active', 'archived'\)\)/);
  assert.match(sqlCode, /url ~\* '\^https\?:\/\/\[\^\[:space:\]\]\+\$'/);
  assert.match(sqlCode, /attachment_id\s+uuid\s+REFERENCES public\.team_files\(id\) ON DELETE RESTRICT/);
  assert.match(sqlCode, /RAISE EXCEPTION 'team_task_resource_file_not_on_team'/);
  assert.match(sqlCode, /created_by_coach_id\s+uuid\s+REFERENCES public\.team_coaches\(id\)\s+ON DELETE SET NULL/);
  assert.match(sqlCode, /created_by_account_id\s+uuid\s+REFERENCES public\.elf_accounts\(id\)\s+ON DELETE SET NULL/);
  assert.match(sqlCode, /task_id\s+uuid\s+NOT NULL REFERENCES public\.team_tasks\(id\) ON DELETE CASCADE/);
});

// ── Revision integrity (database-enforced) ────────────────────────────────

test("revision: the app can't pass a revision decision — no p_bump_revision anywhere", () => {
  assert.doesNotMatch(sqlCode, /p_bump_revision/);
  const store = src("../../../../lib/teamTasksStore.ts");
  assert.doesNotMatch(store, /p_bump_revision|bumpRevision/);
});

test("revision: any update that changes title/instructions/body_text/audience is bumped by the trigger", () => {
  const guard = bodies.get("team_tasks_guard")!.body;
  assert.match(guard, /IF NEW\.revision < OLD\.revision THEN\s*RAISE EXCEPTION 'team_task_revision_decrease';/);
  assert.match(guard, /IF NEW\.revision = OLD\.revision AND \(\s*NEW\.title\s+IS DISTINCT FROM OLD\.title\s+OR NEW\.instructions IS DISTINCT FROM OLD\.instructions\s+OR NEW\.body_text\s+IS DISTINCT FROM OLD\.body_text\s+OR NEW\.audience\s+IS DISTINCT FROM OLD\.audience\s*\) THEN\s*NEW\.revision\s+:= OLD\.revision \+ 1;/);
  assert.match(sqlCode, /CREATE TRIGGER team_tasks_guard\s+BEFORE UPDATE ON public\.team_tasks/);
  // Display order and status are not requirement fields.
  assert.doesNotMatch(guard, /sort_order|status|label/);
});

test("revision: the link/file SET is compared (order and labels excluded) before resources are replaced", () => {
  const setFn = bodies.get("team_task_resource_set")!.body;
  assert.match(setFn, /array_agg\(DISTINCT fp ORDER BY fp\)/);
  assert.match(setFn, /'file:' \|\| \(\(r->>'attachment_id'\)::uuid\)::text/);
  assert.match(setFn, /'link:' \|\| \(r->>'url'\)/);
  assert.doesNotMatch(setFn, /label|sort_order|\bord\b/);

  const update = bodies.get("team_task_update")!.body;
  const compareAt = update.indexOf("v_resources_changed := v_old_set IS DISTINCT FROM public.team_task_resource_set(p_resources)");
  const deleteAt  = update.indexOf("DELETE FROM public.team_task_resources WHERE task_id = p_task_id");
  assert.ok(compareAt > 0 && deleteAt > compareAt, "old set must be read before the resources are deleted");
  assert.match(update, /revision\s+= revision \+ CASE WHEN v_resources_changed THEN 1 ELSE 0 END/);
});

test("revision: resources can only change through the task functions (so the set check can't be bypassed)", () => {
  const guard = bodies.get("team_task_resources_guard")!.body;
  assert.match(guard, /current_setting\('elf\.team_task_write', true\) IS DISTINCT FROM 'on'/);
  assert.match(guard, /RAISE EXCEPTION 'team_task_resources_write_via_functions_only'/);
  // Cascade from deleting the task itself is the only flag-less delete.
  assert.match(guard, /AND EXISTS \(SELECT 1 FROM public\.team_tasks t WHERE t\.id = OLD\.task_id\)/);
  assert.match(sqlCode, /BEFORE INSERT OR UPDATE OR DELETE ON public\.team_task_resources/);
  for (const fn of ["team_task_create", "team_task_update"]) {
    const body = bodies.get(fn)!.body;
    const on = body.indexOf("set_config('elf.team_task_write', 'on', true)");
    const off = body.indexOf("set_config('elf.team_task_write', 'off', true)");
    assert.ok(on > 0 && off > on, `${fn} turns the write flag on, then off (transaction-local)`);
  }
  assert.doesNotMatch(bodies.get("team_task_move")!.body, /team_task_resources|set_config/);
});

test("revision: reordering and archiving never touch revision or version", () => {
  const move = bodies.get("team_task_move")!.body;
  assert.match(move, /SET sort_order = s\.ord - 1/);
  assert.doesNotMatch(move, /revision|version\s*=|updated_at|title|audience/);
  assert.match(bodies.get("team_task_update")!.body, /IF v_task\.version <> p_expected_version THEN\s*RAISE EXCEPTION 'team_task_version_conflict';/);
});

// ── Item 7: failures are visible, never "done" ────────────────────────────

test("row icon: unknown is a grey '?' with 'Acknowledgment status unavailable'; only 'done' is green", () => {
  assert.match(todo, /done:\s+\{ fill: "#16a34a", text: "Acknowledged" \}/);
  assert.match(todo, /todo:\s+\{ fill: "#dc2626", text: "Needs your acknowledgment" \}/);
  assert.match(todo, /unknown: \{ fill: "#9ca3af", text: "Acknowledgment status unavailable" \}/);
  assert.match(todo, />\?<\/text>/);
  assert.match(todo, /my_ack\?: "done" \| "todo" \| "unknown" \| null;/);
});

test("list notice when any status couldn't be loaded", () => {
  assert.match(todo, /\{tasks\.some\(t => t\.my_ack === "unknown"\) && \(\s*<p role="status"/);
  assert.match(todo, /We couldn&apos;t load your acknowledgment status\. Refresh the page to try again\./);
});

test("detail: unavailable or failed lookups show a message with Try again — never a hidden section or a form", () => {
  assert.match(ackUi, /const UNAVAILABLE = "Acknowledgments are temporarily unavailable\. Please try again\.";/);
  assert.match(ackUi, /if \(data\.available === false\) \{ setLoadError\(UNAVAILABLE\); setView\(null\); return; \}/);
  assert.match(ackUi, /if \(!res\.ok\) \{ setLoadError\(/);
  assert.match(ackUi, /<div role="alert"[\s\S]*?\{loadError\}[\s\S]*?Try again/);
  // The form only exists inside a loaded view.
  assert.ok(ackUi.indexOf("if (!view) {") < ackUi.indexOf("<form onSubmit={submit}"));
  // A successful submit whose fresh status can't be read says so.
  assert.match(ackUi, /Your acknowledgment was submitted, but we couldn't reload its status\. Please try again\./);
  assert.match(ackUi, /if \(data\.acknowledgment\) setView\(data\.acknowledgment\);/);
});
