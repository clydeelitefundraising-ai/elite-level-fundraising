/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate parsed JSON fixtures */
// Team Management Phase 3C — pure completion rules.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETION_STATUS_COLUMNS,
  CompletionVerificationError,
  DEFAULT_TEAM_TIME_ZONE,
  buildAthleteCompletion,
  buildTaskCompletion,
  buildTeamSummary,
  canViewCompletion,
  completionState,
  countEntries,
  formatAcknowledgedDate,
  parseTaskCompletionResponse,
  parseTeamSummaryResponse,
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

// ── 3C-3: team time zone and the dashboard's response checks ──────────────

test("dates are shown in the team's zone (America/Phoenix), whatever the device zone", () => {
  assert.equal(DEFAULT_TEAM_TIME_ZONE, "America/Phoenix");
  // 00:27 UTC on Oct 18 is still Oct 17 in Arizona (UTC-7, no DST).
  assert.equal(formatAcknowledgedDate("2026-10-18T00:27:25.083433+00:00"), "Oct 17, 2026");
  assert.equal(formatAcknowledgedDate("2026-10-18T07:00:00Z"), "Oct 18, 2026");
  assert.equal(formatAcknowledgedDate("2026-01-01T06:59:59Z"), "Dec 31, 2025");
  assert.equal(formatAcknowledgedDate("2026-10-18T00:27:25Z", "America/New_York"), "Oct 17, 2026");
  assert.equal(formatAcknowledgedDate("2026-10-18T05:00:00Z", "America/New_York"), "Oct 18, 2026");
  for (const bad of [null, "", "not a date"]) assert.equal(formatAcknowledgedDate(bad), "");
});

const roundTrip = <T>(v: T): unknown => JSON.parse(JSON.stringify(v));
const team = () => {
  const athletes = [ath("a1", "Ava"), ath("a2", "Jake"), ath("a3", "Lone")];
  const parentTask: CompletionTask = { id: "t2", title: "Consent", audience: "parent", revision: 1 };
  const athleteTask: CompletionTask = { id: "t3", title: "Waiver", audience: "athlete", revision: 1 };
  const rows = [
    row({ task_id: "t1", athlete_id: "a1", requirement: "athlete", satisfied: true, acknowledged_at: "2026-10-18T00:27:25Z" }),
    row({ task_id: "t1", athlete_id: "a1", requirement: "parent", satisfied: true, acknowledged_at: "2026-10-18T00:28:20Z" }),
    row({ task_id: "t1", athlete_id: "a2", requirement: "athlete", has_eligible_member: false }),
    row({ task_id: "t1", athlete_id: "a2", requirement: "parent", satisfied: true }),
    row({ task_id: "t1", athlete_id: "a3", requirement: "athlete", has_eligible_member: false }),
    row({ task_id: "t1", athlete_id: "a3", requirement: "parent", has_eligible_member: false }),
    ...["a1", "a2", "a3"].map(a => row({ task_id: "t2", athlete_id: a, requirement: "parent", earlier_revision_acknowledged: a === "a1" })),
    ...["a1", "a2", "a3"].map(a => row({ task_id: "t3", athlete_id: a, requirement: "athlete", satisfied: a !== "a3" })),
  ];
  return { athletes, tasks: [both, parentTask, athleteTask], rows };
};

test("summary response: exactly what the server builds is accepted", () => {
  const { athletes, tasks, rows } = team();
  const body = roundTrip({ available: true, athleteCount: 3, tasks: buildTeamSummary(tasks, athletes, rows) });
  const v = parseTeamSummaryResponse(body)!;
  assert.deepEqual(v.tasks.map(t => [t.task.title, Object.keys(t.requirements), t.athletes.outstanding, t.totals.outstanding]), [
    ["Forms", ["athlete", "parent"], 2, 3],   // 3 outstanding requirements, 2 distinct athletes
    ["Consent", ["parent"], 3, 3],
    ["Waiver", ["athlete"], 1, 1],
  ]);
  assert.equal(v.tasks[0].totals.cannotCompleteYet, 3);
  assert.equal(v.tasks[1].totals.needsUpdate, 1);
  assert.deepEqual(parseTeamSummaryResponse({ available: true, athleteCount: 0, tasks: [] }), { athleteCount: 0, tasks: [] });
});

test("summary response: inconsistent or partial data is rejected (shown as unavailable)", () => {
  const { athletes, tasks, rows } = team();
  const good = () => roundTrip({ available: true, athleteCount: 3, tasks: buildTeamSummary(tasks, athletes, rows) }) as {
    available: boolean; athleteCount: number; tasks: Record<string, any>[];
  };
  const cases: [string, (b: ReturnType<typeof good>) => void][] = [
    ["not available", b => { b.available = false; }],
    ["counts don't add up", b => { b.tasks[0].totals.complete += 1; }],
    ["breakdown doesn't add up", b => { b.tasks[0].requirements.athlete.cannotCompleteYet -= 1; }],
    ["totals != sum of requirements", b => { b.tasks[0].totals.required += 1; b.tasks[0].totals.outstanding += 1; b.tasks[0].totals.notAcknowledged += 1; }],
    ["athlete counts don't add up", b => { b.tasks[0].athletes.complete += 1; }],
    ["roster size mismatch", b => { b.athleteCount = 4; }],
    ["missing requirement", b => { delete b.tasks[0].requirements.parent; }],
    ["requirement the task doesn't ask", b => { b.tasks[1].requirements.athlete = b.tasks[1].requirements.parent; }],
    ["duplicate task", b => { b.tasks.push(b.tasks[0]); }],
    ["negative count", b => { b.tasks[2].requirements.athlete.unknown = -1; }],
    ["bad audience", b => { b.tasks[0].task.audience = "coach"; }],
  ];
  for (const [label, mutate] of cases) {
    const b = good();
    mutate(b);
    assert.equal(parseTeamSummaryResponse(b), null, label);
  }
});

test("task response: rows recomputed — complete only when every applicable requirement is complete", () => {
  const { athletes, rows } = team();
  const v = parseTaskCompletionResponse(roundTrip({ available: true, ...buildTaskCompletion(both, athletes, rows) }))!;
  assert.deepEqual(v.athletes.map(r => [r.athlete.name, r.status, r.entries.map(e => e.state)]), [
    ["Ava", "complete", ["complete", "complete"]],
    ["Jake", "outstanding", ["not_joined", "complete"]],       // parent done, athlete not: not complete
    ["Lone", "outstanding", ["not_joined", "no_parent_linked"]],
  ]);
  assert.equal(v.athletes[0].entries[0].acknowledgedAt, "2026-10-18T00:27:25Z");
});

test("task response: tampered or inconsistent rows are rejected; unknown is never complete", () => {
  const { athletes, rows } = team();
  const good = () => roundTrip({ available: true, ...buildTaskCompletion(both, athletes, rows) }) as { summary: Record<string, any>; athletes: Record<string, any>[] };
  const cases: [string, (b: ReturnType<typeof good>) => void][] = [
    ["status claims complete", b => { b.athletes[1].status = "complete"; b.summary.athletes.complete = 2; b.summary.athletes.outstanding = 1; }],
    ["state not recognised (becomes unknown, counts no longer match)", b => { b.athletes[1].entries[0].state = "done"; }],
    ["requirements out of order", b => { b.athletes[0].entries.reverse(); }],
    ["missing requirement", b => { b.athletes[0].entries.pop(); }],
    ["extra requirement", b => { b.athletes[0].entries.push(b.athletes[0].entries[0]); }],
    ["duplicate athlete", b => { b.athletes.push(b.athletes[0]); }],
    ["row missing (partial list)", b => { b.athletes.pop(); }],
    ["per-requirement counts wrong", b => {
      b.summary.requirements.athlete.complete += 1; b.summary.requirements.athlete.outstanding -= 1; b.summary.requirements.athlete.cannotCompleteYet -= 1;
      b.summary.requirements.parent.complete -= 1; b.summary.requirements.parent.outstanding += 1; b.summary.requirements.parent.cannotCompleteYet += 1;
    }],
  ];
  for (const [label, mutate] of cases) {
    const b = good();
    mutate(b);
    assert.equal(parseTaskCompletionResponse(b), null, label);
  }
  // An unknown state with matching counts is accepted but shown grey, never green.
  const unknownRows = rows.filter(r => !(r.task_id === "t1" && r.athlete_id === "a1"));
  const v = parseTaskCompletionResponse(roundTrip({ available: true, ...buildTaskCompletion(both, athletes, unknownRows) }))!;
  const ava = v.athletes.find(r => r.athlete.name === "Ava")!;
  assert.deepEqual([ava.status, ava.entries.map(e => e.state)], ["unknown", ["unknown", "unknown"]]);
  assert.ok(ava.entries.every(e => e.acknowledgedAt === null));
});
