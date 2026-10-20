// Team Management Phase 5 — structural checks on the attendance migration
// (phase_t5_attendance_drafts.sql). Source scans, same approach as
// teamTaskAcks.migration.test.ts. The database behavior itself is tested
// against a disposable local PostgreSQL by
// supabase/tests/phase_t5_attendance_drafts/run.sh.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../supabase/migrations/phase_t5_attendance_drafts.sql", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = sql.replace(/--.*$/gm, "");
const harness = (f: string) => readFileSync(new URL(`../../supabase/tests/phase_t5_attendance_drafts/${f}`, import.meta.url), "utf8");

const functions = new Map(
  [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(([\s\S]*?)AS \$\$([\s\S]*?)\$\$;/g)]
    .map(m => [m[1], { header: m[2], body: m[3] }]),
);

const TABLES = ["public.team_attendance_sessions", "public.team_attendance_records"];
const CALLABLE: Record<string, string> = {
  team_attendance_time_zone:         "text",
  team_attendance_local_date:        "timestamptz, text",
  team_attendance_date_editable:     "date, date",
  team_attendance_today:             "text",
  team_attendance_save_draft:        "text, date, integer, jsonb, jsonb",
  team_attendance_session_summaries: "text, date, date",
  team_attendance_session_roster:    "text, date",
};
const INTERNAL: Record<string, string> = {
  team_attendance_try_uuid:       "jsonb",
  team_attendance_sessions_guard: "",
  team_attendance_records_guard:  "",
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("one transaction; additive: creates only its two tables, never alters/drops/writes existing objects", () => {
  assert.match(code, /^BEGIN;/m);
  assert.match(code, /\nCOMMIT;\s*$/);
  assert.deepEqual([...code.matchAll(/CREATE TABLE IF NOT EXISTS ([\w.]+)/g)].map(m => m[1]), TABLES);
  assert.doesNotMatch(code, /\bDROP\s+(TABLE|FUNCTION|INDEX|POLICY|CONSTRAINT|SCHEMA)\b/i);
  for (const m of code.matchAll(/\bALTER\s+TABLE\s+([\w.]+)/gi)) assert.ok(TABLES.includes(m[1]), m[0]);
  assert.doesNotMatch(code, /\bTRUNCATE\s+(TABLE\s+)?public\./i);
  assert.doesNotMatch(code, /\bCREATE\s+(TEMP|TEMPORARY)\b/i, "no temp tables in a SECURITY DEFINER function");
  for (const m of code.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.\w+)/gi)) {
    assert.ok(TABLES.includes(m[2]), m[0]);
  }
  assert.deepEqual([...code.matchAll(/DROP TRIGGER IF EXISTS (\w+) ON ([\w.]+)/g)].map(m => `${m[1]} ${m[2]}`), [
    "team_attendance_sessions_guard public.team_attendance_sessions",
    "team_attendance_sessions_no_truncate public.team_attendance_sessions",
    "team_attendance_records_guard public.team_attendance_records",
    "team_attendance_records_no_truncate public.team_attendance_records",
  ]);
  // Every function this migration creates is its own (team_attendance_*).
  assert.deepEqual([...functions.keys()].sort(), [...Object.keys(CALLABLE), ...Object.keys(INTERNAL)].sort());
});

test("RLS on both tables, no policies; tables: everything revoked, service_role gets SELECT only", () => {
  assert.doesNotMatch(code, /\bCREATE\s+POLICY\b/i);
  for (const t of TABLES) {
    assert.match(code, new RegExp(`ALTER TABLE ${esc(t)} ENABLE ROW LEVEL SECURITY;`));
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      assert.match(code, new RegExp(`REVOKE ALL ON TABLE ${esc(t)} FROM ${role};`));
    }
    assert.match(code, new RegExp(`GRANT SELECT ON TABLE ${esc(t)} TO service_role;`));
  }
  const tableGrants = [...code.matchAll(/^GRANT (.+?) ON TABLE ([\w.]+) TO (\w+);/gm)].map(m => `${m[1]}|${m[3]}`);
  assert.deepEqual(tableGrants, ["SELECT|service_role", "SELECT|service_role"]);
  assert.doesNotMatch(code, /GRANT[^;]*\bTO\s+(anon|authenticated|PUBLIC)\b/i);
  assert.doesNotMatch(code, /FORCE ROW LEVEL SECURITY/i, "the owner-run save function must not be blocked by RLS");
});

test("functions: search_path pinned; only the save function is SECURITY DEFINER; EXECUTE for service_role only on the callable ones", () => {
  for (const [name, { header }] of functions) {
    assert.match(header, /SET search_path = ''/, name);
    assert.equal(/SECURITY DEFINER/.test(header), name === "team_attendance_save_draft", name);
  }
  for (const [name, args] of Object.entries({ ...CALLABLE, ...INTERNAL })) {
    const sig = `public.${name}(${args})`;
    assert.match(code, new RegExp(`REVOKE ALL\\s+ON FUNCTION ${esc(sig)} FROM PUBLIC;`), sig);
    assert.match(code, new RegExp(`REVOKE EXECUTE ON FUNCTION ${esc(sig)} FROM anon;`), sig);
    assert.match(code, new RegExp(`REVOKE EXECUTE ON FUNCTION ${esc(sig)} FROM authenticated;`), sig);
    const granted = new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${esc(sig)} TO service_role;`).test(code);
    assert.equal(granted, name in CALLABLE, sig);
    if (name in INTERNAL) assert.match(code, new RegExp(`REVOKE EXECUTE ON FUNCTION ${esc(sig)} FROM service_role;`), sig);
  }
});

test("sessions: one per team per date; draft-only; version; time zone kept; creators kept by name", () => {
  assert.match(code, /CONSTRAINT tas_one_per_team_date UNIQUE \(campaign_slug, session_date\)/);
  assert.match(code, /CONSTRAINT tas_status_check\s+CHECK \(status IN \('draft'\)\)/);
  assert.doesNotMatch(code, /finalized/i, "Phase 5 has no finalization");
  assert.match(code, /session_date\s+date\s+NOT NULL/);
  assert.match(code, /time_zone\s+text\s+NOT NULL/);
  assert.match(code, /version\s+integer\s+NOT NULL DEFAULT 1/);
  for (const who of ["created_by", "updated_by"]) {
    assert.match(code, new RegExp(`${who}_account_id\\s+uuid\\s+REFERENCES public\\.elf_accounts\\(id\\)\\s+ON DELETE SET NULL`));
    assert.match(code, new RegExp(`${who}_coach_id\\s+uuid\\s+REFERENCES public\\.team_coaches\\(id\\)\\s+ON DELETE SET NULL`));
    assert.match(code, new RegExp(`${who}_platform_admin_id\\s+uuid\\s+REFERENCES public\\.platform_admins\\(id\\) ON DELETE SET NULL`));
    assert.match(code, new RegExp(`${who}_name\\s+text,`));
  }
});

test("records: Present/Absent, reasons, notes, snapshots, history kept when athletes are removed", () => {
  assert.match(code, /session_id\s+uuid\s+NOT NULL REFERENCES public\.team_attendance_sessions\(id\) ON DELETE RESTRICT/);
  assert.match(code, /athlete_id\s+uuid\s+REFERENCES public\.athletes\(id\) ON DELETE SET NULL/);
  assert.match(code, /athlete_name_snapshot\s+text\s+NOT NULL/);
  assert.match(code, /class_year_snapshot\s+text,/);
  assert.match(code, /CHECK \(status IN \('present', 'absent'\)\)/);
  assert.match(code, /CHECK \(absence_reason IS NULL OR absence_reason IN \('excused', 'unexcused', 'other'\)\)/);
  assert.match(code, /CHECK \(\(status = 'absent'\) = \(absence_reason IS NOT NULL\)\)/);
  assert.match(code, /CHECK \(status = 'absent' OR note IS NULL\)/);
  assert.match(code, /char_length\(note\) BETWEEN 1 AND 500/);
  assert.match(code, /CREATE UNIQUE INDEX IF NOT EXISTS tar_one_per_athlete\s+ON public\.team_attendance_records \(session_id, athlete_id\)\s+WHERE athlete_id IS NOT NULL;/);
  // Reporting indexes.
  for (const idx of ["tar_session", "tar_athlete_date", "tar_campaign_date"]) assert.match(code, new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`));
});

test("write protection: guards on both tables refuse writes without the flag, deletes and truncates", () => {
  for (const t of ["sessions", "records"]) {
    const g = functions.get(`team_attendance_${t}_guard`)!.body;
    assert.match(g, /current_setting\('elf\.team_attendance_write', true\)/);
    assert.match(g, /TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE'/);
    assert.match(code, new RegExp(`BEFORE INSERT OR UPDATE OR DELETE ON public\\.team_attendance_${t}\\b`));
    assert.match(code, new RegExp(`BEFORE TRUNCATE ON public\\.team_attendance_${t}\\b`));
  }
  const save = functions.get("team_attendance_save_draft")!.body;
  assert.match(save, /set_config\('elf\.team_attendance_write', 'on', true\)/);
  assert.match(save, /set_config\('elf\.team_attendance_write', 'off', true\)/);
  // Only the save function ever turns the flag on.
  assert.equal([...code.matchAll(/set_config\('elf\.team_attendance_write', 'on'/g)].length, 1);
});

test("save function: team, actor, window, version, full-roster and late-athlete checks, all before writing", () => {
  const save = functions.get("team_attendance_save_draft")!.body;
  const firstWrite = save.indexOf("set_config('elf.team_attendance_write', 'on'");
  for (const check of [
    "attendance_team_not_found", "attendance_actor_invalid", "attendance_actor_not_authorized",
    "attendance_date_invalid", "attendance_date_in_future", "attendance_date_not_editable",
    "attendance_version_invalid", "attendance_session_not_found", "attendance_session_not_draft",
    "attendance_records_invalid", "attendance_records_too_many", "attendance_record_invalid",
    "attendance_athlete_duplicate", "attendance_athlete_cross_team", "attendance_roster_incomplete",
    "attendance_late_athlete_unconfirmed", "attendance_roster_empty",
  ]) {
    const at = save.indexOf(`'${check}'`);
    assert.ok(at >= 0 && at < firstWrite, check);
  }
  // Not-draft is checked before the version (a finalized session is never reported as a conflict).
  assert.ok(save.indexOf("'attendance_session_not_draft'") < save.indexOf("v_session.version <> p_expected_version"));
  // Coaches: Head/Assistant of THIS team only. Boosters never.
  assert.match(save, /tc\.campaign_slug = p_campaign_slug\s+AND tc\.role IN \('head_coach', 'assistant_coach'\)/);
  // Names come from the database, never the caller.
  assert.match(save, /k NOT IN \('coach_id', 'platform_admin_id'\)/);
  assert.match(save, /k NOT IN \('athlete_id', 'status', 'absence_reason', 'note', 'confirm_added_after_date'\)/);
  // "Today" is computed by the database in the session's zone.
  assert.match(save, /team_attendance_local_date\(now\(\), v_zone\)/);
  assert.match(save, /ON CONFLICT \(campaign_slug, session_date\) DO NOTHING/);
  assert.match(save, /FOR UPDATE;/);
});

test("time zone: America/Phoenix is decided in exactly one place", () => {
  assert.equal([...code.matchAll(/America\/Phoenix/g)].length, 1);
  assert.match(functions.get("team_attendance_time_zone")!.body, /'America\/Phoenix'/);
  assert.match(functions.get("team_attendance_date_editable")!.body, /p_session_date <= p_today AND p_session_date >= p_today - 14/);
});

test("privacy: every error is a fixed code — no names, notes or ids in messages", () => {
  const raises = [...code.matchAll(/RAISE EXCEPTION ([^;]+);/g)].map(m => m[1].trim());
  assert.ok(raises.length >= 25);
  for (const r of raises) assert.match(r, /^'[a-z_]+'$/, r);
  assert.doesNotMatch(code, /RAISE\s+(NOTICE|WARNING|LOG|INFO|DEBUG)/i);
  assert.doesNotMatch(code, /\bUSING\s+(DETAIL|HINT|MESSAGE)\b/i);
});

test("local PostgreSQL harness exists, runs the whole migration and keeps LF endings", () => {
  const run = harness("run.sh");
  assert.match(run, /phase_t5_attendance_drafts\.sql/);
  assert.match(run, /Never point this at Supabase/);
  assert.match(run, /tests\.sql/);
  assert.match(run, /concurrency\.sh/);
  assert.match(harness(".gitattributes"), /\*\.sh text eol=lf/);
  const tests = harness("tests.sql");
  for (const area of ["Phoenix midnight", "stale version", "another team", "Deleting an athlete", "finalized", "rolled-back"]) {
    assert.match(tests, new RegExp(area, "i"), area);
  }
});
