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

test("no acknowledgment checkboxes or completion indicators before Phase 3", () => {
  const code = withoutComments(todo);
  assert.doesNotMatch(code, /type="checkbox"/);
  assert.doesNotMatch(code, /acknowledg|complet(e|ion)d?\b|incomplete|✓|✔|✗|❌/i);
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

// ── Migration ─────────────────────────────────────────────────────────────

test("migration is additive: creates only the new tables/functions; never alters or drops existing objects", () => {
  assert.doesNotMatch(sqlCode, /\bDROP\s+TABLE\b/i);
  assert.doesNotMatch(sqlCode, /\bALTER\s+TABLE\s+(?!team_tasks\b|team_task_resources\b)/i);
  assert.doesNotMatch(sqlCode, /\b(DELETE\s+FROM|UPDATE|INSERT\s+INTO)\s+clearance_resources\b/i);
  assert.doesNotMatch(sqlCode, /\bTRUNCATE\b/i);
  const created = [...sqlCode.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]);
  assert.deepEqual(created, ["team_tasks", "team_task_resources"]);
  // The only DROP is the idempotent re-create of this migration's own triggers.
  const drops = [...sqlCode.matchAll(/DROP\s+(\w+)\s+IF EXISTS\s+(\w+)/gi)].map(m => `${m[1]} ${m[2]}`);
  assert.deepEqual(drops, ["TRIGGER team_tasks_guard", "TRIGGER team_task_resources_guard"]);
});

test("migration security: RLS on both tables; functions executable by service_role only", () => {
  assert.match(sqlCode, /ALTER TABLE team_tasks ENABLE ROW LEVEL SECURITY;/);
  assert.match(sqlCode, /ALTER TABLE team_task_resources ENABLE ROW LEVEL SECURITY;/);
  assert.doesNotMatch(sqlCode, /CREATE POLICY/i);
  assert.doesNotMatch(sqlCode, /SECURITY DEFINER/i);
  for (const fn of ["team_task_create", "team_task_update", "team_task_move"]) {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      assert.match(sqlCode, new RegExp(`REVOKE (ALL|EXECUTE)\\s+ON FUNCTION public\\.${fn}\\([^)]*\\) FROM ${role};`), `${fn} ${role}`);
    }
    assert.match(sqlCode, new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
  }
  for (const fn of ["team_tasks_guard", "team_task_resources_guard", "team_task_create", "team_task_update", "team_task_move"]) {
    assert.match(sqlCode, new RegExp(`FUNCTION public\\.${fn}\\([\\s\\S]*?SET search_path = public, pg_temp`), fn);
  }
});

test("migration constraints: strict audience/status, http(s) links, file refs RESTRICT, same-team guard", () => {
  assert.match(sqlCode, /CHECK \(audience IN \('athlete', 'parent', 'both'\)\)/);
  assert.match(sqlCode, /CHECK \(status IN \('active', 'archived'\)\)/);
  assert.match(sqlCode, /url ~\* '\^https\?:\/\/\[\^\[:space:\]\]\+\$'/);
  assert.match(sqlCode, /attachment_id\s+uuid\s+REFERENCES team_files\(id\) ON DELETE RESTRICT/);
  assert.match(sqlCode, /RAISE EXCEPTION 'team_task_resource_file_not_on_team'/);
  assert.match(sqlCode, /created_by_coach_id\s+uuid\s+REFERENCES team_coaches\(id\)\s+ON DELETE SET NULL/);
  assert.match(sqlCode, /created_by_account_id\s+uuid\s+REFERENCES elf_accounts\(id\)\s+ON DELETE SET NULL/);
});

test("migration revision rules: bumped only on request, never decreases; reorder leaves it alone", () => {
  assert.match(sqlCode, /revision\s+= revision \+ CASE WHEN p_bump_revision THEN 1 ELSE 0 END/);
  assert.match(sqlCode, /IF NEW\.revision < OLD\.revision THEN/);
  const move = sqlCode.slice(sqlCode.indexOf("FUNCTION public.team_task_move("), sqlCode.indexOf("REVOKE ALL     ON FUNCTION public.team_task_create"));
  assert.match(move, /SET sort_order = s\.ord - 1/);
  assert.doesNotMatch(move, /revision|version\s*=|updated_at/);
  assert.match(sqlCode, /IF v_task\.version <> p_expected_version THEN\s*RAISE EXCEPTION 'team_task_version_conflict';/);
});
