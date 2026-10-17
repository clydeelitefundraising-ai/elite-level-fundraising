// Team Management Phase 3 — structural checks on the acknowledgments
// migration (phase_t3_task_acknowledgments.sql). Source scans, same
// approach as the Phase 2 migration checks in todoList.test.ts. The
// database behavior itself is tested against a disposable local
// PostgreSQL by supabase/tests/phase_t3_task_acknowledgments/run.sh.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../supabase/migrations/phase_t3_task_acknowledgments.sql", import.meta.url), "utf8");
const code = sql.replace(/--.*$/gm, "");

const bodies = new Map(
  [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/g)].map(m => [m[1], { header: m[2], body: m[3] }]),
);

const FUNCTIONS = {
  team_task_ack_statement:     "integer",
  team_task_ack_member_linked: "uuid, uuid, text, text",
  team_task_acknowledge:       "uuid, text, integer, text, uuid\\[\\], uuid, uuid, text, integer",
  team_task_ack_status:        "text, uuid\\[\\], uuid\\[\\]",
} as const;

test("one transaction; additive: creates only its own table, never alters/drops/writes existing objects", () => {
  assert.match(code, /^BEGIN;/m);
  assert.match(code, /\nCOMMIT;\s*$/); // the last statement
  assert.deepEqual([...code.matchAll(/CREATE TABLE IF NOT EXISTS ([\w.]+)/g)].map(m => m[1]), ["public.team_task_acknowledgments"]);
  assert.doesNotMatch(code, /\bDROP\s+(TABLE|FUNCTION|INDEX|POLICY)\b/i);
  assert.doesNotMatch(code, /\bALTER\s+TABLE\s+(?!public\.team_task_acknowledgments\b)/i);
  assert.doesNotMatch(code, /\bTRUNCATE\s+(TABLE\s+)?public\./i);
  // Writes only ever target the new table.
  for (const m of code.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.\w+)/gi)) {
    assert.equal(m[2], "public.team_task_acknowledgments", m[0]);
  }
  const drops = [...code.matchAll(/DROP TRIGGER IF EXISTS (\w+) ON ([\w.]+)/g)].map(m => `${m[1]} ${m[2]}`);
  assert.deepEqual(drops, [
    "team_task_acknowledgments_guard public.team_task_acknowledgments",
    "team_task_acknowledgments_no_truncate public.team_task_acknowledgments",
  ]);
});

test("rerunnable: IF NOT EXISTS / OR REPLACE / DROP TRIGGER IF EXISTS everywhere", () => {
  assert.equal([...code.matchAll(/CREATE TABLE (?!IF NOT EXISTS)/g)].length, 0);
  assert.equal([...code.matchAll(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/g)].length, 0);
  assert.equal([...code.matchAll(/CREATE FUNCTION/g)].length, 0);
  assert.equal([...code.matchAll(/CREATE TRIGGER (\w+)/g)].length, 2);
});

test("least privilege: RLS on, no policies; table SELECT+INSERT for service_role only", () => {
  assert.match(code, /ALTER TABLE public\.team_task_acknowledgments ENABLE ROW LEVEL SECURITY;/);
  assert.doesNotMatch(code, /CREATE POLICY/i);
  for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
    assert.match(code, new RegExp(`REVOKE ALL ON TABLE public\\.team_task_acknowledgments FROM ${role};`), role);
  }
  const grants = [...code.matchAll(/GRANT ([\w, ]+) ON TABLE public\.team_task_acknowledgments TO (\w+);/g)].map(m => `${m[1]} -> ${m[2]}`);
  assert.deepEqual(grants, ["SELECT, INSERT -> service_role"]);
  assert.doesNotMatch(code, /GRANT ALL/i);
  assert.doesNotMatch(code, /SECURITY DEFINER/i);
});

test("functions: service_role-only EXECUTE; guard executable by no API role", () => {
  for (const [fn, sig] of Object.entries(FUNCTIONS)) {
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      assert.match(code, new RegExp(`REVOKE (ALL|EXECUTE)\\s+ON FUNCTION public\\.${fn}\\(${sig}\\) FROM ${role};`), `${fn} ${role}`);
    }
    assert.match(code, new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${fn}\\(${sig}\\) TO service_role;`), fn);
  }
  for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
    assert.match(code, new RegExp(`REVOKE (ALL|EXECUTE)\\s+ON FUNCTION public\\.team_task_acknowledgments_guard\\(\\) FROM ${role};`), role);
  }
  assert.doesNotMatch(code, /GRANT\s+EXECUTE ON FUNCTION public\.team_task_acknowledgments_guard/);
});

test("every function: empty search_path and schema-qualified references", () => {
  assert.deepEqual([...bodies.keys()].sort(), [
    "team_task_ack_member_linked", "team_task_ack_statement", "team_task_ack_status", "team_task_acknowledge", "team_task_acknowledgments_guard",
  ]);
  for (const [name, { header, body }] of bodies) {
    assert.match(header, /SET search_path = ''\s*$/, `${name}: search_path`);
    const unqualified = body.match(/(?<![.\w%])(team_tasks|team_task_acknowledgments|team_members|team_member_athletes|athletes|elf_accounts)\b(?!\.)/g);
    assert.equal(unqualified, null, `${name}: unqualified ${unqualified}`);
  }
});

test("history survives deletes: task RESTRICT; athlete/member/account SET NULL with snapshots", () => {
  assert.match(code, /task_id\s+uuid\s+NOT NULL REFERENCES public\.team_tasks\(id\)\s+ON DELETE RESTRICT/);
  assert.match(code, /athlete_id\s+uuid\s+REFERENCES public\.athletes\(id\)\s+ON DELETE SET NULL/);
  assert.match(code, /member_id\s+uuid\s+REFERENCES public\.team_members\(id\) ON DELETE SET NULL/);
  assert.match(code, /account_id\s+uuid\s+REFERENCES public\.elf_accounts\(id\) ON DELETE SET NULL/);
  for (const col of ["member_name_snapshot", "athlete_name_snapshot", "task_title_snapshot", "statement_text"]) assert.ok(code.includes(col), col);
});

test("append-only guard: inserts via the function flag only; no updates except verified FK clearing; no delete/truncate", () => {
  const guard = bodies.get("team_task_acknowledgments_guard")!.body;
  assert.match(guard, /IF TG_OP = 'TRUNCATE' THEN\s*RAISE EXCEPTION 'team_task_acknowledgments_append_only';/);
  assert.match(guard, /IF TG_OP = 'DELETE' THEN\s*RAISE EXCEPTION 'team_task_acknowledgments_append_only';/);
  assert.match(guard, /current_setting\('elf\.team_task_ack_write', true\) IS DISTINCT FROM 'on'/);
  // A cleared FK is allowed only once the referenced row is really gone.
  assert.match(guard, /EXISTS \(SELECT 1 FROM public\.athletes a WHERE a\.id = OLD\.athlete_id\)/);
  assert.match(guard, /EXISTS \(SELECT 1 FROM public\.team_members m WHERE m\.id = OLD\.member_id\)/);
  assert.match(guard, /EXISTS \(SELECT 1 FROM public\.elf_accounts e WHERE e\.id = OLD\.account_id\)/);
  assert.match(code, /BEFORE INSERT OR UPDATE OR DELETE ON public\.team_task_acknowledgments/);
  assert.match(code, /BEFORE TRUNCATE ON public\.team_task_acknowledgments\s+FOR EACH STATEMENT/);
  const ack = bodies.get("team_task_acknowledge")!.body;
  const on = ack.indexOf("set_config('elf.team_task_ack_write', 'on', true)");
  const off = ack.indexOf("set_config('elf.team_task_ack_write', 'off', true)");
  assert.ok(on > 0 && off > on, "flag on then off, transaction-local");
});

test("acknowledge(): identity, team, role, link and revision are checked by the database", () => {
  const ack = bodies.get("team_task_acknowledge")!.body;
  for (const err of [
    "team_task_ack_task_not_found", "team_task_ack_task_inactive", "team_task_ack_not_required",
    "team_task_ack_revision_changed", "team_task_ack_member_not_found", "team_task_ack_identity_mismatch",
    "team_task_ack_role_mismatch", "team_task_ack_athlete_not_linked", "team_task_ack_invalid_name",
    "team_task_ack_unknown_statement", "team_task_ack_no_athletes",
  ]) assert.ok(ack.includes(`'${err}'`), err);
  assert.match(ack, /WHERE t\.id = p_task_id AND t\.campaign_slug = p_campaign_slug\s+FOR SHARE;/);
  assert.match(ack, /IF v_member\.account_id IS DISTINCT FROM p_account_id THEN/);
  assert.match(ack, /pg_advisory_xact_lock\(/);
  assert.match(ack, /array_agg\(DISTINCT x ORDER BY x\)/); // lock order -> no deadlocks
  // Snapshots and statement come from the database, never the caller.
  assert.match(ack, /v_statement := public\.team_task_ack_statement\(p_statement_version\);/);
  assert.match(ack, /v_name, v_member\.name, coalesce\(a\.name, ''\), v_task\.title,/);
  assert.doesNotMatch(ack, /p_statement_text|p_title|p_athlete_name|p_member_name/);
});

test("approved statement, version 1, verbatim", () => {
  assert.ok(sql.includes(
    "WHEN 1 THEN 'I acknowledge that I have reviewed and understand the information, instructions, links, and documents associated with this task.'",
  ));
});

test("uniqueness: one acknowledgment per person, athlete, requirement and task revision", () => {
  assert.match(code, /CREATE UNIQUE INDEX IF NOT EXISTS tta_one_per_person_revision\s+ON public\.team_task_acknowledgments \(task_id, task_revision, athlete_id, requirement, member_id\)\s+WHERE athlete_id IS NOT NULL AND member_id IS NOT NULL;/);
  assert.match(code, /CONSTRAINT tta_requirement_check CHECK \(requirement IN \('athlete', 'parent'\)\)/);
});
