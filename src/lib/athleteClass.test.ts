import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATHLETE_CLASS_OPTIONS,
  NO_GRADE_SET_LABEL,
  isAthleteClass,
  compareAthleteClasses,
  representedAthleteClasses,
  publicLeaderboardFilters,
} from "./athleteClass.ts";
import { ATHLETE_CLASS_OPTIONS as SUPABASE_REEXPORT } from "./supabase.ts";

const APPROVED = ["6th Grade", "7th Grade", "8th Grade", "Freshman", "Sophomore", "Junior", "Senior", "Other"];

function src(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

// ── Shared option list ────────────────────────────────────────────────────

test("ATHLETE_CLASS_OPTIONS: exactly the eight approved grades, in the approved order", () => {
  assert.deepEqual([...ATHLETE_CLASS_OPTIONS], APPROVED);
});

test("lib/supabase.ts re-exports the same shared constant for existing importers", () => {
  assert.equal(SUPABASE_REEXPORT, ATHLETE_CLASS_OPTIONS);
});

test("athleteClass.ts is client-safe: no imports, no env reads", () => {
  const code = src("lib/athleteClass.ts");
  assert.doesNotMatch(code, /^\s*import\s/m);
  assert.doesNotMatch(code, /process\.env/);
});

test("isAthleteClass: exact canonical labels only (case-sensitive, legacy values rejected)", () => {
  for (const v of APPROVED) assert.equal(isAthleteClass(v), true, v);
  for (const v of ["other", "freshman", "RS Sophomore", "2027", "", null, undefined, "No grade set"]) {
    assert.equal(isAthleteClass(v), false, String(v));
  }
});

test("NO_GRADE_SET_LABEL is distinct from every real grade, including Other", () => {
  assert.equal(NO_GRADE_SET_LABEL, "No grade set");
  assert.equal(isAthleteClass(NO_GRADE_SET_LABEL), false);
});

// ── Ordering ──────────────────────────────────────────────────────────────

test("compareAthleteClasses: canonical order, then nonstandard values alphabetically", () => {
  const sorted = ["Varsity", "Other", "Senior", "6th Grade", "Freshman", "RS Sophomore", "8th Grade", "2027"].sort(compareAthleteClasses);
  assert.deepEqual(sorted, ["6th Grade", "8th Grade", "Freshman", "Senior", "Other", "2027", "RS Sophomore", "Varsity"]);
});

test("representedAthleteClasses: distinct, non-empty, in shared order", () => {
  assert.deepEqual(
    representedAthleteClasses(["Junior", null, "7th Grade", "", "Junior", undefined, "RS Sophomore", "Other"]),
    ["7th Grade", "Junior", "Other", "RS Sophomore"],
  );
  assert.deepEqual(representedAthleteClasses([]), []);
});

// ── Public leaderboard filters ────────────────────────────────────────────

test("publicLeaderboardFilters: Overall first, then only represented grades in shared order", () => {
  assert.deepEqual(
    publicLeaderboardFilters(["Senior", "6th Grade", "Senior", "Other", null]),
    ["Overall", "6th Grade", "Senior", "Other"],
  );
});

test("publicLeaderboardFilters: no athletes (or none with a grade) shows Overall only", () => {
  assert.deepEqual(publicLeaderboardFilters([]), ["Overall"]);
  assert.deepEqual(publicLeaderboardFilters([null, "", undefined]), ["Overall"]);
});

test("publicLeaderboardFilters: nonstandard legacy values never become public tabs", () => {
  assert.deepEqual(publicLeaderboardFilters(["RS Sophomore", "2027", "Junior"]), ["Overall", "Junior"]);
});

test("publicLeaderboardFilters: a high-school-only team gets the same four tabs it had before", () => {
  assert.deepEqual(
    publicLeaderboardFilters(["Senior", "Junior", "Sophomore", "Freshman"]),
    ["Overall", "Freshman", "Sophomore", "Junior", "Senior"],
  );
});

// ── Consistent use across selectors (structural) ──────────────────────────

const SELECTOR_FILES = [
  "app/enter-code/EnterCodeView.tsx",
  "app/admin/AdminClient.tsx",
  "app/admin/campaigns/[slug]/CampaignControlCenter.tsx",
  "app/admin/campaigns/[slug]/RosterImportModal.tsx",
  "app/team/[slug]/team/AthleteFormModal.tsx",
  "app/campaign/_shared/CampaignPageClient.tsx",
  "lib/platform/import/rosterCandidates.ts",
  "app/team/[slug]/team/rosterHelpers.ts",
];

test("every grade selector imports from the shared module and declares no local grade list", () => {
  for (const file of SELECTOR_FILES) {
    const code = src(file);
    assert.match(code, /from "(@\/lib\/athleteClass|(\.\.\/)+(lib\/)?athleteClass\.ts)"/, `${file} must import the shared grade module`);
    assert.doesNotMatch(code, /\[\s*"Freshman",\s*"Sophomore"/, `${file} must not hardcode its own grade list`);
    assert.doesNotMatch(code, /const\s+(ATHLETE_)?CLASS_OPTIONS\s*=/, `${file} must not redeclare the option list`);
  }
});

test("client selectors never import the server-oriented lib/supabase module for grade options", () => {
  for (const file of SELECTOR_FILES.filter(f => f.endsWith(".tsx"))) {
    assert.doesNotMatch(src(file), /ATHLETE_CLASS_OPTIONS[^\n]*from "@\/lib\/supabase"/, file);
  }
  assert.doesNotMatch(src("app/team/[slug]/team/AthleteRosterGrid.tsx"), /from "@\/lib\/supabase"/);
});

test("public leaderboard derives its tabs from represented grades, not a fixed list", () => {
  const code = src("app/campaign/_shared/CampaignPageClient.tsx");
  assert.match(code, /publicLeaderboardFilters\(athletes\.map\(\(a\) => a\.class_year\)\)/);
  // A tab that disappears after a data refresh falls back to Overall.
  assert.match(code, /filters\.includes\(activeFilter\) \? activeFilter : "Overall"/);
  assert.match(code, /a\.class_year === effectiveFilter/);
});

test("mobile roster grid labels missing grades via the shared grouping (No grade set, not Other)", () => {
  const code = src("app/team/[slug]/team/AthleteRosterGrid.tsx");
  assert.match(code, /groupAthletesByClass\(filtered\)/);
  assert.doesNotMatch(code, /label: "Other"/);
});

// ── Legacy nonstandard values preserved in edit forms (structural) ────────

test("edit forms keep a stored nonstandard class visible and selected", () => {
  const cases: [string, string][] = [
    ["app/admin/AdminClient.tsx", "editA.class_year"],
    ["app/team/[slug]/team/AthleteFormModal.tsx", "form.class_year"],
    ["app/admin/campaigns/[slug]/CampaignControlCenter.tsx", "editAthlete.class_year"],
  ];
  for (const [file, expr] of cases) {
    const code = src(file);
    const esc = expr.replace(/\./g, "\\.");
    assert.match(
      code,
      new RegExp(`\\{${esc} && !isAthleteClass\\(${esc}\\) && \\(\\s*<option value=\\{${esc}\\}>\\{${esc}\\}</option>`),
      `${file} must render a fallback <option> for a nonstandard stored value`,
    );
  }
});

// ── CSV export compatibility (structural) ─────────────────────────────────

test("athlete CSV export passes class_year through unchanged (no grade mapping)", () => {
  const code = src("app/api/team/[slug]/analytics/export/athletes/route.ts");
  assert.match(code, /grade: a\.class_year \?\? \(a\.grad_year \? `Class of \$\{a\.grad_year\}` : ""\)/);
  assert.doesNotMatch(code, /ATHLETE_CLASS_OPTIONS|isAthleteClass/);
});
