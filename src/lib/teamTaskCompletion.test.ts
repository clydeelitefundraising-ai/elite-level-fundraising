// Team Management Phase 3C — pure completion rules.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETION_STATUS_COLUMNS,
  CompletionVerificationError,
  buildAthleteCompletion,
  buildTaskCompletion,
  buildTeamSummary,
  canViewCompletion,
  completionState,
  countEntries,
  verifyStatusRows,
  type CompletionAthlete,
  type CompletionStatusRow,
  type CompletionTask,
} from "./teamTaskCompletion.ts";

const row = (o: Partial<CompletionStatusRow> & Pick<CompletionStatusRow, "task_id" | "athlete_id" | "requirement">): CompletionStatusRow => ({
  task_revision: 1, satisfied: false, acknowledged_at: null, has_eligible_member: true, earlier_revision_acknowledged: false, ...o,
});
const ath = (id: string, name: string): CompletionAthlete => ({ id, name, class_year: null, jersey_number: null });
const both: CompletionTask = { id: "t1", title: "Forms", audience: "both", revision: 1 };
const parentOnly: CompletionTask = { id: "t2", title: "Consent", audience: "parent", revision: 3 };

test("only Head Coach / platform admin (manager) and Assistant Coach (coach) may view", () => {
  assert.equal(canViewCompletion("manager"), true);
  assert.equal(canViewCompletion("coach"), true);
  for (const v of ["booster", "athlete", "parent", "none"] as const) assert.equal(canViewCompletion(v), false, v);
});

test("state precedence: complete > needs update > cannot complete yet > outstanding; no row = unknown", () => {
  const base = { task_id: "t1", athlete_id: "a1" } as const;
  assert.deepEqual(completionState(row({ ...base, requirement: "parent", satisfied: true, acknowledged_at: "2026-10-18", earlier_revision_acknowledged: true }), "parent"),
    { requirement: "parent", state: "complete", acknowledgedAt: "2026-10-18" });
  assert.equal(completionState(row({ ...base, requirement: "parent", earlier_revision_acknowledged: true }), "parent").state, "needs_update");
  assert.equal(completionState(row({ ...base, requirement: "athlete", has_eligible_member: false }), "athlete").state, "not_joined");
  assert.equal(completionState(row({ ...base, requirement: "parent", has_eligible_member: false }), "parent").state, "no_parent_linked");
  assert.equal(completionState(row({ ...base, requirement: "parent" }), "parent").state, "outstanding");
  assert.deepEqual(completionState(undefined, "athlete"), { requirement: "athlete", state: "unknown", acknowledgedAt: null });
});

test("the status columns read never include typed names, member names or member ids", () => {
  for (const col of ["acknowledged_full_name", "acknowledged_member_name", "acknowledged_by_member_id", "acknowledgment_id"]) {
    assert.ok(!(COMPLETION_STATUS_COLUMNS as readonly string[]).includes(col), col);
  }
});

test("counts: each requirement in exactly one bucket; breakdowns sum to outstanding", () => {
  const c = countEntries([
    { requirement: "athlete", state: "complete", acknowledgedAt: "x" },
    { requirement: "athlete", state: "not_joined", acknowledgedAt: null },
    { requirement: "parent", state: "no_parent_linked", acknowledgedAt: null },
    { requirement: "parent", state: "needs_update", acknowledgedAt: null },
    { requirement: "parent", state: "outstanding", acknowledgedAt: null },
    { requirement: "parent", state: "unknown", acknowledgedAt: null },
  ]);
  assert.deepEqual(c, { required: 6, complete: 1, outstanding: 4, notAcknowledged: 1, needsUpdate: 1, cannotCompleteYet: 2, unknown: 1 });
});

test("summary: requirement counts and distinct-athlete counts differ correctly", () => {
  const athletes = [ath("a1", "Ava"), ath("a2", "Jake"), ath("a3", "Lone")];
  const rows = [
    row({ task_id: "t1", athlete_id: "a1", requirement: "athlete", satisfied: true }),
    row({ task_id: "t1", athlete_id: "a1", requirement: "parent", satisfied: true }),
    row({ task_id: "t1", athlete_id: "a2", requirement: "athlete", has_eligible_member: false }),
    row({ task_id: "t1", athlete_id: "a2", requirement: "parent" }),
    row({ task_id: "t1", athlete_id: "a3", requirement: "athlete", has_eligible_member: false }),
    row({ task_id: "t1", athlete_id: "a3", requirement: "parent", has_eligible_member: false }),
  ];
  const [s] = buildTeamSummary([both], athletes, rows);
  assert.equal(s.totals.outstanding, 4);
  assert.equal(s.totals.cannotCompleteYet, 3);
  assert.deepEqual(s.athletes, { total: 3, complete: 1, outstanding: 2, unknown: 0 });
  assert.deepEqual(Object.keys(s.requirements), ["athlete", "parent"]);
  assert.equal(s.requirements.parent!.notAcknowledged, 1);
});

test("a row for an old revision, or no row at all, is unknown — never complete", () => {
  const athletes = [ath("a1", "Ava"), ath("a2", "Jake")];
  const rows = [row({ task_id: "t2", athlete_id: "a1", requirement: "parent", task_revision: 2, satisfied: true })];
  const { summary, athletes: list } = buildTaskCompletion(parentOnly, athletes, rows);
  assert.deepEqual(list.map(r => [r.athlete.name, r.entries[0].state, r.status]), [["Ava", "unknown", "unknown"], ["Jake", "unknown", "unknown"]]);
  assert.equal(summary.totals.complete, 0);
  assert.equal(summary.totals.unknown, 2);
  assert.deepEqual(summary.athletes, { total: 2, complete: 0, outstanding: 0, unknown: 2 });
});

test("athlete view: only the requirements each task asks for", () => {
  const rows = [
    row({ task_id: "t1", athlete_id: "a1", requirement: "athlete", satisfied: true, acknowledged_at: "d1" }),
    row({ task_id: "t1", athlete_id: "a1", requirement: "parent" }),
    row({ task_id: "t2", athlete_id: "a1", requirement: "parent", task_revision: 3, earlier_revision_acknowledged: true }),
  ];
  const v = buildAthleteCompletion(ath("a1", "Ava"), [both, parentOnly], rows);
  assert.deepEqual(v.tasks.map(t => [t.task.id, t.entries.map(e => `${e.requirement}:${e.state}`), t.status]), [
    ["t1", ["athlete:complete", "parent:outstanding"], "outstanding"],
    ["t2", ["parent:needs_update"], "outstanding"],
  ]);
  assert.deepEqual(v.totals, { required: 3, complete: 1, outstanding: 2, notAcknowledged: 1, needsUpdate: 1, cannotCompleteYet: 0, unknown: 0 });
});

test("verification: exact set required — missing, extra, duplicate, stale revision and malformed rows all throw", () => {
  const good = [
    row({ task_id: "t1", athlete_id: "a1", requirement: "athlete" }),
    row({ task_id: "t1", athlete_id: "a1", requirement: "parent" }),
    row({ task_id: "t2", athlete_id: "a1", requirement: "parent", task_revision: 3 }),
  ];
  assert.doesNotThrow(() => verifyStatusRows([both, parentOnly], ["a1"], good));
  assert.doesNotThrow(() => verifyStatusRows([], ["a1"], []));
  const bad: [string, CompletionStatusRow[]][] = [
    ["missing", good.slice(1)],
    ["extra athlete", [...good, row({ task_id: "t1", athlete_id: "a9", requirement: "athlete" })]],
    ["extra task", [...good, row({ task_id: "t9", athlete_id: "a1", requirement: "athlete" })]],
    ["requirement not asked", [...good, row({ task_id: "t2", athlete_id: "a1", requirement: "athlete", task_revision: 3 })]],
    ["duplicate", [...good, good[0]]],
    ["stale revision", [good[0], good[1], { ...good[2], task_revision: 2 }]],
    ["malformed", [good[0], good[1], { ...good[2], satisfied: "yes" as unknown as boolean }]],
  ];
  for (const [label, rows] of bad) {
    assert.throws(() => verifyStatusRows([both, parentOnly], ["a1"], rows), CompletionVerificationError, label);
  }
});
