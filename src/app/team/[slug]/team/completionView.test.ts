// Phase 3C-3 — completion dashboard: grade tab + All / Outstanding /
// Complete + search, and the ?view=completion URLs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETION_FILTERS,
  completionFilterCounts,
  completionParentSearch,
  completionSearch,
  filterCompletionRows,
  matchesCompletionFilter,
} from "./completionView.ts";
import { ALL_ATHLETES_TAB, NO_GRADE_TAB, buildGradeTabs, gradeTabKey } from "./rosterHelpers.ts";
import { athleteStatus, type CompletionEntry, type CompletionState } from "../../../../lib/teamTaskCompletion.ts";

const e = (requirement: "athlete" | "parent", state: CompletionState): CompletionEntry => ({ requirement, state, acknowledgedAt: null });
const r = (name: string, class_year: string | null, entries: CompletionEntry[]) =>
  ({ athlete: { id: name, name, class_year, jersey_number: null }, entries, status: athleteStatus(entries) });

// A "both" task: complete only when athlete AND parent are complete.
const bothRows = [
  r("Ava Smith",  "Senior", [e("athlete", "complete"), e("parent", "complete")]),
  r("Jake Jones", "Senior", [e("athlete", "not_joined"), e("parent", "complete")]),
  r("Mia Brown",  "Junior", [e("athlete", "complete"), e("parent", "needs_update")]),
  r("Lone Rider", null,     [e("athlete", "not_joined"), e("parent", "no_parent_linked")]),
  r("Una Known",  "Junior", [e("athlete", "unknown"), e("parent", "complete")]),
];

const names = (rows: { athlete: { name: string } }[]) => rows.map(x => x.athlete.name);

test("filters: All / Outstanding / Complete, in that order", () => {
  assert.deepEqual(COMPLETION_FILTERS.map(f => f.label), ["All", "Outstanding", "Complete"]);
});

test("both-audience task: complete only when every requirement is complete; unknown only under All", () => {
  const f = (filter: "all" | "outstanding" | "complete") => names(filterCompletionRows(bothRows, { grade: ALL_ATHLETES_TAB, filter, search: "" }));
  assert.deepEqual(f("complete"), ["Ava Smith"]);
  assert.deepEqual(f("outstanding"), ["Jake Jones", "Mia Brown", "Lone Rider"]);
  assert.deepEqual(f("all"), names(bothRows));
  assert.equal(matchesCompletionFilter({ status: "unknown" }, "complete"), false);
  assert.equal(matchesCompletionFilter({ status: "unknown" }, "outstanding"), false);
});

test("athlete-only and parent-only tasks filter on their single requirement", () => {
  const athleteOnly = [r("A", "Senior", [e("athlete", "complete")]), r("B", "Senior", [e("athlete", "outstanding")])];
  const parentOnly = [r("C", "Senior", [e("parent", "no_parent_linked")]), r("D", "Junior", [e("parent", "complete")])];
  assert.deepEqual(names(filterCompletionRows(athleteOnly, { grade: ALL_ATHLETES_TAB, filter: "complete", search: "" })), ["A"]);
  assert.deepEqual(names(filterCompletionRows(parentOnly, { grade: ALL_ATHLETES_TAB, filter: "outstanding", search: "" })), ["C"]);
});

test("grade tabs reuse the roster's shared logic and combine with the status filter and search", () => {
  const tabs = buildGradeTabs(bothRows.map(x => x.athlete));
  assert.deepEqual(tabs.map(t => [t.label, t.count]), [["All Athletes", 5], ["Junior", 2], ["Senior", 2], ["No grade set", 1]]);
  const junior = gradeTabKey("Junior");
  assert.deepEqual(names(filterCompletionRows(bothRows, { grade: junior, filter: "outstanding", search: "" })), ["Mia Brown"]);
  assert.deepEqual(names(filterCompletionRows(bothRows, { grade: NO_GRADE_TAB, filter: "all", search: "" })), ["Lone Rider"]);
  assert.deepEqual(names(filterCompletionRows(bothRows, { grade: ALL_ATHLETES_TAB, filter: "all", search: "  jONES " })), ["Jake Jones"]);
  assert.deepEqual(completionFilterCounts(bothRows, { grade: ALL_ATHLETES_TAB, search: "" }), { all: 5, outstanding: 3, complete: 1 });
  assert.deepEqual(completionFilterCounts(bothRows, { grade: gradeTabKey("Senior"), search: "" }), { all: 2, outstanding: 1, complete: 1 });
  assert.deepEqual(completionFilterCounts(bothRows, { grade: ALL_ATHLETES_TAB, search: "zzz" }), { all: 0, outstanding: 0, complete: 0 });
});

test("URLs: ?view=completion (summary) and ?view=completion&task=<id>, staying on the To-Do tab", () => {
  assert.equal(completionSearch(""), "?tab=todo&view=completion");
  assert.equal(completionSearch("?tab=todo"), "?tab=todo&view=completion");
  assert.equal(completionSearch("?tab=clearance"), "?tab=clearance&view=completion"); // existing links keep their value
  assert.equal(completionSearch("?tab=todo", "t1"), "?tab=todo&view=completion&task=t1");
  // From a task's detail (?task=t1): straight to that task's completion.
  assert.equal(completionSearch("?tab=todo&task=t1", "t1"), "?tab=todo&task=t1&view=completion");
  assert.equal(completionSearch("?tab=todo&view=completion&task=t1"), "?tab=todo&view=completion");
});

test("Back without a history entry of ours steps up in place: task -> summary -> To-Do List", () => {
  assert.equal(completionParentSearch("?tab=todo&view=completion&task=t1"), "?tab=todo&view=completion");
  assert.equal(completionParentSearch("?tab=todo&view=completion"), "?tab=todo");
  assert.equal(completionParentSearch("?view=completion"), "");
});
