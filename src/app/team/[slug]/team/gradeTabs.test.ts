// Roster grade tabs — pure helpers (rosterHelpers.ts) plus structural
// checks on GradeTabs.tsx / AthleteRosterGrid.tsx / DesktopRosterTable.tsx
// / Team.module.css. Source scans, same approach as the repo's other
// client-component tests; they pin the approved behavior rather than
// render it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALL_ATHLETES_TAB,
  NO_GRADE_TAB,
  buildGradeTabs,
  filterDesktopRosterRows,
  gradeTabIndexForKey,
  gradeTabKey,
  matchesGradeTab,
  matchesRosterSearch,
  resolveGradeTab,
  DEFAULT_ROSTER_FILTERS,
  type RosterRow,
} from "./rosterHelpers.ts";
import { ATHLETE_CLASS_OPTIONS, NO_GRADE_SET_LABEL } from "../../../../lib/athleteClass.ts";

const src = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const tabsComponent = src("./GradeTabs.tsx");
const mobileGrid    = src("./AthleteRosterGrid.tsx");
const desktopTable  = src("./DesktopRosterTable.tsx");
const css           = src("./Team.module.css");

const ath = (id: string, class_year: string | null, name = `Athlete ${id}`) => ({ id, name, class_year });
const labels = (rows: { class_year?: string | null }[]) => buildGradeTabs(rows).map(t => t.label);
const visible = (rows: ReturnType<typeof ath>[], tab: Parameters<typeof matchesGradeTab>[1], search = "") =>
  rows.filter(a => matchesRosterSearch(a.name, search) && matchesGradeTab(a.class_year, tab)).map(a => a.id);

// ── Grade ordering ────────────────────────────────────────────────────────

test("tabs follow the standard order: 6th, 7th, 8th, Freshman, Sophomore, Junior, Senior, Other", () => {
  const shuffled = [...ATHLETE_CLASS_OPTIONS].reverse().map((g, i) => ath(String(i), g));
  assert.deepEqual(labels(shuffled), [
    "All Athletes", "6th Grade", "7th Grade", "8th Grade", "Freshman", "Sophomore", "Junior", "Senior", "Other",
  ]);
});

test("All Athletes is always first; its count is the whole roster", () => {
  const tabs = buildGradeTabs([ath("1", "Senior"), ath("2", null), ath("3", "Junior")]);
  assert.deepEqual(tabs[0], { key: ALL_ATHLETES_TAB, label: "All Athletes", count: 3 });
});

// ── Dynamic visibility and counts ─────────────────────────────────────────

test("only grades represented on the roster get a tab, with per-grade counts", () => {
  const tabs = buildGradeTabs([ath("1", "Junior"), ath("2", "Freshman"), ath("3", "Junior")]);
  assert.deepEqual(tabs.map(t => [t.label, t.count]), [["All Athletes", 3], ["Freshman", 1], ["Junior", 2]]);
});

test("empty roster → only All Athletes (0)", () => {
  assert.deepEqual(buildGradeTabs([]), [{ key: ALL_ATHLETES_TAB, label: "All Athletes", count: 0 }]);
});

// ── No-grade athletes ─────────────────────────────────────────────────────

test("athletes without a grade get a No grade set tab, displayed last", () => {
  const tabs = buildGradeTabs([ath("1", null), ath("2", "RS Sophomore"), ath("3", ""), ath("4", "Other")]);
  assert.deepEqual(tabs.map(t => [t.label, t.count]), [["All Athletes", 4], ["Other", 1], ["RS Sophomore", 1], [NO_GRADE_SET_LABEL, 2]]);
  assert.equal(tabs.at(-1)!.key, NO_GRADE_TAB);
});

test("No grade set tab is absent when every athlete has a grade", () => {
  assert.ok(!labels([ath("1", "Senior")]).includes(NO_GRADE_SET_LABEL));
});

test("a real Other grade and a missing grade never share a tab", () => {
  const rows = [ath("o", "Other"), ath("n", null)];
  assert.deepEqual(visible(rows, gradeTabKey("Other")), ["o"]);
  assert.deepEqual(visible(rows, NO_GRADE_TAB), ["n"]);
});

// ── Nonstandard grades ────────────────────────────────────────────────────

test("nonstandard values keep their own tab after the standard grades, alphabetically", () => {
  assert.deepEqual(labels([ath("1", "RS Sophomore"), ath("2", "2027"), ath("3", "Senior")]), ["All Athletes", "Senior", "2027", "RS Sophomore"]);
});

test("stored values that look like tab names cannot collide with All Athletes / No grade set", () => {
  const rows = [ath("a", "all"), ath("b", "none"), ath("c", NO_GRADE_SET_LABEL), ath("d", null)];
  const tabs = buildGradeTabs(rows);
  assert.equal(new Set(tabs.map(t => t.key)).size, tabs.length);
  assert.deepEqual(visible(rows, gradeTabKey("all")), ["a"]);
  assert.deepEqual(visible(rows, gradeTabKey(NO_GRADE_SET_LABEL)), ["c"]);
  assert.deepEqual(visible(rows, NO_GRADE_TAB), ["d"]);
  assert.deepEqual(visible(rows, ALL_ATHLETES_TAB), ["a", "b", "c", "d"]);
});

test("building tabs never modifies athlete data", () => {
  const rows = [ath("1", "RS Sophomore"), ath("2", null)];
  const before = JSON.stringify(rows);
  buildGradeTabs(rows);
  assert.equal(JSON.stringify(rows), before);
});

// ── Selection and filtering ───────────────────────────────────────────────

test("selecting a grade shows only that grade; All Athletes shows everyone", () => {
  const rows = [ath("1", "Freshman"), ath("2", "Senior"), ath("3", "Freshman"), ath("4", null)];
  assert.deepEqual(visible(rows, gradeTabKey("Freshman")), ["1", "3"]);
  assert.deepEqual(visible(rows, ALL_ATHLETES_TAB), ["1", "2", "3", "4"]);
});

test("a selected tab that disappears (last athlete edited/removed) falls back to All Athletes", () => {
  const tabs = buildGradeTabs([ath("1", "Senior")]);
  assert.equal(resolveGradeTab(gradeTabKey("Senior"), tabs), gradeTabKey("Senior"));
  assert.equal(resolveGradeTab(gradeTabKey("Junior"), tabs), ALL_ATHLETES_TAB);
  assert.equal(resolveGradeTab(NO_GRADE_TAB, tabs), ALL_ATHLETES_TAB);
});

test("desktop filter: grade tab combines with search and fundraising filters", () => {
  const base: RosterRow = {
    id: "", name: "", profile_photo: null, class_year: null, event: null, jersey_number: null, contact_phone: null,
    contact_email: null, goal_cents: null, raisedCents: 0, donorCount: 0, contactCount: 0, outreachStatus: "No outreach logged",
  };
  const rows: RosterRow[] = [
    { ...base, id: "a", name: "Ana",  class_year: "Junior", raisedCents: 500 },
    { ...base, id: "b", name: "Ben",  class_year: "Junior" },
    { ...base, id: "c", name: "Cara", class_year: null,     raisedCents: 100 },
  ];
  assert.equal(DEFAULT_ROSTER_FILTERS.grade, ALL_ATHLETES_TAB);
  assert.deepEqual(filterDesktopRosterRows(rows, { ...DEFAULT_ROSTER_FILTERS, grade: gradeTabKey("Junior") }).map(r => r.id), ["a", "b"]);
  assert.deepEqual(filterDesktopRosterRows(rows, { ...DEFAULT_ROSTER_FILTERS, grade: NO_GRADE_TAB }).map(r => r.id), ["c"]);
  assert.deepEqual(filterDesktopRosterRows(rows, { search: "", grade: gradeTabKey("Junior"), fundraising: "has-raised" }).map(r => r.id), ["a"]);
  assert.deepEqual(filterDesktopRosterRows(rows, { search: "be", grade: gradeTabKey("Junior"), fundraising: "all" }).map(r => r.id), ["b"]);
});

// ── Search behavior ───────────────────────────────────────────────────────

test("search is case-insensitive, partial, trims whitespace, and applies within the selected tab", () => {
  const rows = [ath("1", "Junior", "Maya Lopez"), ath("2", "Senior", "Mason Diaz"), ath("3", "Junior", "Liam Ng")];
  assert.ok(matchesRosterSearch("Maya Lopez", "  MAY "));
  assert.ok(matchesRosterSearch("Anyone", "   "));
  assert.deepEqual(visible(rows, ALL_ATHLETES_TAB, "ma"), ["1", "2"]);
  assert.deepEqual(visible(rows, gradeTabKey("Junior"), "ma"), ["1"]);
  assert.deepEqual(visible(rows, gradeTabKey("Senior"), "liam"), []);
});

test("tab counts are full-roster counts, not narrowed by search", () => {
  const src = mobileGrid.slice(mobileGrid.indexOf("const gradeTabs"));
  assert.match(src, /const gradeTabs = useMemo\(\(\) => buildGradeTabs\(athletes\), \[athletes\]\);/);
  assert.match(desktopTable, /const gradeTabs = useMemo\(\(\) => buildGradeTabs\(allRows\), \[allRows\]\);/);
});

// ── Keyboard navigation ───────────────────────────────────────────────────

test("arrow keys wrap, Home/End jump, other keys are ignored", () => {
  assert.equal(gradeTabIndexForKey("ArrowRight", 2, 3), 0);
  assert.equal(gradeTabIndexForKey("ArrowLeft", 0, 3), 2);
  assert.equal(gradeTabIndexForKey("ArrowRight", 0, 3), 1);
  assert.equal(gradeTabIndexForKey("Home", 2, 3), 0);
  assert.equal(gradeTabIndexForKey("End", 0, 3), 2);
  assert.equal(gradeTabIndexForKey("Enter", 0, 3), null);
  assert.equal(gradeTabIndexForKey("ArrowRight", 0, 0), null);
});

// ── Presentation: shared tab row (mobile + desktop) ───────────────────────

test("GradeTabs is an accessible tablist with roving tabindex and no data writes", () => {
  assert.match(tabsComponent, /role="tablist"/);
  assert.match(tabsComponent, /role="tab"/);
  assert.match(tabsComponent, /aria-selected=\{selected\}/);
  assert.match(tabsComponent, /aria-controls=\{gradeTabPanelId\(idPrefix\)\}/);
  assert.match(tabsComponent, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(tabsComponent, /type="button"/);
  assert.match(tabsComponent, /\{tab\.count\}/);
  assert.doesNotMatch(tabsComponent, /fetch\(|scrollIntoView\(/);
});

test("narrow screens scroll the tab row horizontally instead of squeezing; touch-sized tabs", () => {
  const row = css.slice(css.indexOf(".gradeTabs {"), css.indexOf("}", css.indexOf(".gradeTabs {")));
  assert.match(row, /display: flex;/);
  assert.match(row, /overflow-x: auto;/);
  assert.doesNotMatch(row, /flex-wrap: wrap/);
  const tab = css.slice(css.indexOf(".gradeTab {"), css.indexOf("}", css.indexOf(".gradeTab {")));
  assert.match(tab, /flex: 0 0 auto;/);
  assert.match(tab, /white-space: nowrap;/);
  assert.match(tab, /min-height: 44px;/);
});

test("mobile/member roster: tabs above the list, grade AND search filtering, headings only under All Athletes", () => {
  assert.match(mobileGrid, /<GradeTabs tabs=\{gradeTabs\} value=\{activeTab\} onChange=\{setGradeTab\} idPrefix=\{tabIdPrefix\} \/>/);
  assert.match(mobileGrid, /matchesRosterSearch\(a\.name, search\) && matchesGradeTab\(a\.class_year, activeTab\)/);
  assert.match(mobileGrid, /const activeTab = resolveGradeTab\(gradeTab, gradeTabs\);/);
  assert.match(mobileGrid, /const showGroupHeadings = activeTab === ALL_ATHLETES_TAB;/);
  assert.match(mobileGrid, /role="tabpanel"/);
});

test("desktop coach table: grade dropdown replaced by the same tabs; other filters and sort unchanged", () => {
  assert.doesNotMatch(desktopTable, /<option value="">All Grades<\/option>/);
  assert.doesNotMatch(desktopTable, /onChange=\{e => setGrade/);
  assert.match(desktopTable, /<GradeTabs tabs=\{gradeTabs\} value=\{grade\} onChange=\{setGradeTab\} idPrefix=\{tabIdPrefix\} \/>/);
  assert.match(desktopTable, /filterDesktopRosterRows\(allRows, \{ search, grade, fundraising \}\)/);
  assert.match(desktopTable, /<option value="has-raised">Has Raised Funds<\/option>/);
  assert.match(desktopTable, /<option value="raised-desc">Amount Raised: High–Low<\/option>/);
  assert.match(desktopTable, /setGradeTab\(ALL_ATHLETES_TAB\)/); // Clear filters resets the tab
  assert.match(desktopTable, /role="tabpanel"/);
});

test("existing roster actions, profile navigation and permissions are unchanged", () => {
  // Mobile/member: staff vs member profile routes, per-row open gating, edit/remove.
  assert.match(mobileGrid, /const destination = staffMode \? `\/team\/\$\{slug\}\/team\/\$\{a\.id\}` : `\/team\/\$\{slug\}\/athlete\/\$\{a\.id\}`;/);
  assert.match(mobileGrid, /canOpen=\{canOpenAthlete\(a\.id\)\}/);
  assert.match(mobileGrid, /\{canDelete && pendingRequestCount > 0 && \(/);
  assert.match(mobileGrid, /<CoachBar show=\{staffMode\} label="Add Athlete" onAdd=\{openAdd\} \/>/);
  // Desktop: profile link, Edit/Remove gating.
  assert.match(desktopTable, /onClick=\{\(\) => staffMode && router\.push\(`\/team\/\$\{slug\}\/team\/\$\{row\.id\}`\)\}/);
  assert.match(desktopTable, /\{canDelete && \(\s*<button\s*onClick=\{\(\) => handleDelete\(row\.id\)\}/);
});

test("Phase 1 adds no attendance functionality", () => {
  const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const code of [tabsComponent, mobileGrid, desktopTable]) assert.doesNotMatch(withoutComments(code), /attendance/i);
});
