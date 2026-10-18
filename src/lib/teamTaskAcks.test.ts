// Team Management Phase 3 — pure acknowledgment rules.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACK_STATEMENT,
  ackRowStatus,
  buildAckView,
  normalizeAckName,
  requirementsFor,
  sameAthleteSet,
  type AckIdentity,
  type AckStatusRow,
} from "./teamTaskAcks.ts";

const row = (o: Partial<AckStatusRow> & Pick<AckStatusRow, "athlete_id" | "requirement">): AckStatusRow => ({
  task_id: "t1", task_revision: 2, satisfied: false, acknowledgment_id: null, acknowledged_by_member_id: null,
  acknowledged_full_name: null, acknowledged_member_name: null, acknowledged_at: null,
  has_eligible_member: true, earlier_revision_acknowledged: false, ...o,
});
const names = new Map([["emma", "Emma Smith"], ["jake", "Jake Smith"]]);
const parent: AckIdentity = { memberId: "m-pat", accountId: "acct-pat", memberName: "Pat", requirement: "parent", athleteIds: ["emma", "jake"] };
const athlete: AckIdentity = { memberId: "m-emma", accountId: "acct-emma", memberName: "Emma", requirement: "athlete", athleteIds: ["emma"] };
const task = (audience: string) => ({ id: "t1", revision: 2, audience });

test("the statement is the approved version-1 wording", () => {
  assert.equal(ACK_STATEMENT, "I acknowledge that I have reviewed and understand the information, instructions, links, and documents associated with this task.");
});

test("names are normalized like the database does; invalid names are rejected", () => {
  assert.equal(normalizeAckName("  Pat   Q.  Smith "), "Pat Q. Smith");
  for (const bad of ["", " ", "P", "a".repeat(121), `Pat${String.fromCharCode(7)}Smith`, null, 42, undefined]) {
    assert.equal(normalizeAckName(bad), null, String(bad));
  }
  assert.equal(normalizeAckName("a".repeat(120))?.length, 120);
});

test("requirements follow the audience", () => {
  assert.deepEqual(requirementsFor("both"), ["athlete", "parent"]);
  assert.deepEqual(requirementsFor("athlete"), ["athlete"]);
  assert.deepEqual(requirementsFor("parent"), ["parent"]);
  assert.deepEqual(requirementsFor("nonsense"), []);
});

test("parent, two children, nothing done: both children listed and covered", () => {
  const rows = ["emma", "jake"].flatMap(id => [row({ athlete_id: id, requirement: "athlete" }), row({ athlete_id: id, requirement: "parent" })]);
  const v = buildAckView(task("both"), parent, rows, names)!;
  assert.deepEqual(v.children.map(c => c.name), ["Emma Smith", "Jake Smith"]);
  assert.deepEqual(v.outstandingAthleteIds.sort(), ["emma", "jake"]);
  assert.deepEqual(v.children[0].entries.map(e => e.requirement), ["athlete", "parent"]);
  assert.equal(v.revision, 2);
  assert.equal(ackRowStatus(v), "todo");
});

test("another parent already acknowledged one child: that child isn't covered again; no names leak", () => {
  const rows = [
    row({ athlete_id: "emma", requirement: "parent", satisfied: true, acknowledged_by_member_id: "m-sam",
      acknowledged_full_name: "Samantha Smith", acknowledged_member_name: "Sam", acknowledged_at: "2026-10-17T10:00:00Z" }),
    row({ athlete_id: "jake", requirement: "parent" }),
  ];
  const v = buildAckView(task("parent"), parent, rows, names)!;
  assert.deepEqual(v.outstandingAthleteIds, ["jake"]);
  const emma = v.children.find(c => c.athleteId === "emma")!.entries[0];
  assert.equal(emma.by, "parent");
  assert.ok(!JSON.stringify(v).includes("Samantha") && !JSON.stringify(v).includes("m-sam"), "other parent's name/id never in the view");
});

test("own acknowledgment shows as 'you'; all done -> row status done", () => {
  const rows = ["emma", "jake"].map(id => row({ athlete_id: id, requirement: "parent", satisfied: true, acknowledged_by_member_id: "m-pat", acknowledged_at: "2026-10-17T10:00:00Z" }));
  const v = buildAckView(task("parent"), parent, rows, names)!;
  assert.deepEqual(v.outstandingAthleteIds, []);
  assert.ok(v.children.every(c => c.entries[0].by === "you"));
  assert.equal(ackRowStatus(v), "done");
});

test("athlete: only their own record; parent status visible within the family", () => {
  const rows = [
    row({ athlete_id: "emma", requirement: "athlete", earlier_revision_acknowledged: true }),
    row({ athlete_id: "emma", requirement: "parent", satisfied: true, acknowledged_by_member_id: "m-pat" }),
    row({ athlete_id: "jake", requirement: "athlete" }), // not linked to this athlete -> ignored
  ];
  const v = buildAckView(task("both"), athlete, rows, names)!;
  assert.deepEqual(v.children.map(c => c.athleteId), ["emma"]);
  const [ath, par] = v.children[0].entries;
  assert.equal(ath.satisfied, false);
  assert.equal(ath.earlierRevision, true);  // task changed since they acknowledged
  assert.equal(par.by, "parent");
  assert.deepEqual(v.outstandingAthleteIds, ["emma"]);
});

test("a task that doesn't ask this role yields no view (coach-parent on an athlete-only task)", () => {
  assert.equal(buildAckView(task("athlete"), parent, [], names), null);
  assert.equal(buildAckView(task("parent"), athlete, [], names), null);
  assert.equal(ackRowStatus(null), null);
});

test("no linked athletes on this team: empty view, no row icon", () => {
  const v = buildAckView(task("both"), { ...athlete, athleteIds: [] }, [], names)!;
  assert.deepEqual(v.children, []);
  assert.equal(ackRowStatus(v), null);
});

test("no eligible member is reported (athlete hasn't joined / no parent linked)", () => {
  const rows = [row({ athlete_id: "emma", requirement: "athlete", has_eligible_member: false }), row({ athlete_id: "emma", requirement: "parent" })];
  const v = buildAckView(task("both"), parent, rows, names)!;
  assert.equal(v.children[0].entries[0].noEligibleMember, true);
  assert.equal(v.children[0].entries[1].noEligibleMember, false);
});

test("athlete-set comparison ignores order and duplicates", () => {
  assert.ok(sameAthleteSet(["a", "b", "a"], ["b", "a"]));
  assert.ok(!sameAthleteSet(["a"], ["a", "b"]));
  assert.ok(!sameAthleteSet(["a", "c"], ["a", "b"]));
});
