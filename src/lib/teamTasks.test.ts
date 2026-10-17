// Team Management Phase 2 — pure To-Do task rules (teamTasks.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TASK_AUDIENCES,
  TASK_LIMITS,
  TaskValidationError,
  canManageTasks,
  canViewArchived,
  canViewTask,
  fileIdsOf,
  isSubstantiveTaskChange,
  isTaskAudience,
  normalizeTaskUrl,
  sortTasks,
  taskViewerFor,
  validateTaskInput,
  visibleAudiences,
} from "./teamTasks.ts";
import type { TeamActor } from "./permissions.ts";

const FILE_A = "11111111-1111-4111-8111-111111111111";
const FILE_B = "22222222-2222-4222-8222-222222222222";

const coach = (role: "head_coach" | "assistant_coach" | "booster"): TeamActor =>
  ({ kind: "coach", session: { id: "c1", name: "Coach", role, campaign_slug: "wolves" } });
const member = (role: "athlete" | "parent" | "booster"): TeamActor =>
  ({ kind: "member", session: { id: "m1", name: "Member", role, campaign_slug: "wolves", athlete_id: null, account_id: null } });
const platformAdmin: TeamActor = {
  kind: "platform_admin",
  session: { platformAdminId: "pa1", accountId: "acct-pa", name: "ELF", email: "e@x.com", campaign_slug: "wolves" },
};

// ── Module shape ──────────────────────────────────────────────────────────

test("teamTasks.ts is client-safe: only a type import, no env reads", () => {
  const code = readFileSync(new URL("./teamTasks.ts", import.meta.url), "utf8");
  const imports = code.match(/^\s*import\s.*$/gm) ?? [];
  assert.deepEqual(imports.map(l => l.trim()), ['import type { TeamActor } from "./permissions.ts";']);
  assert.doesNotMatch(code, /process\.env/);
});

// ── Audience validation ───────────────────────────────────────────────────

test("audience must be exactly athlete, parent or both", () => {
  assert.deepEqual([...TASK_AUDIENCES], ["athlete", "parent", "both"]);
  for (const ok of ["athlete", "parent", "both"]) assert.ok(isTaskAudience(ok));
  for (const bad of ["Athlete", "booster", "coach", "", null, undefined, 1, ["athlete"]]) assert.equal(isTaskAudience(bad), false);
  assert.throws(() => validateTaskInput({ title: "Physical", audience: "everyone" }), TaskValidationError);
  assert.throws(() => validateTaskInput({ title: "Physical", audience: undefined }), /Choose who the task is for/);
});

// ── Field validation ──────────────────────────────────────────────────────

test("title is required, trimmed, and length-limited", () => {
  assert.throws(() => validateTaskInput({ title: "   ", audience: "both" }), /Title is required/);
  assert.throws(() => validateTaskInput({ title: 42, audience: "both" }), /Title is required/);
  assert.throws(() => validateTaskInput({ title: "x".repeat(TASK_LIMITS.title + 1), audience: "both" }), /200 characters/);
  assert.equal(validateTaskInput({ title: "  Physical form  ", audience: "both" }).title, "Physical form");
});

test("instructions/body are optional, trimmed, blank → null, length-limited", () => {
  const v = validateTaskInput({ title: "T", audience: "athlete", instructions: "  Do it  ", body_text: "   " });
  assert.equal(v.instructions, "Do it");
  assert.equal(v.body_text, null);
  assert.throws(() => validateTaskInput({ title: "T", audience: "athlete", instructions: "x".repeat(5001) }), /5000/);
  assert.throws(() => validateTaskInput({ title: "T", audience: "athlete", body_text: { evil: true } }), /must be text/);
});

test("links must be http(s); unsafe schemes are rejected", () => {
  assert.equal(normalizeTaskUrl(" https://example.com/form "), "https://example.com/form");
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://x.com", "not a url", ""]) {
    assert.throws(() => normalizeTaskUrl(bad), TaskValidationError, bad);
  }
});

test("resources: links and files validated, duplicates dropped, order kept, max 20", () => {
  const v = validateTaskInput({
    title: "T", audience: "both",
    resources: [
      { kind: "link", url: "https://a.com", label: " Form " },
      { kind: "file", attachment_id: FILE_A.toUpperCase() },
      { kind: "link", url: "https://a.com" },
      { kind: "file", attachment_id: FILE_A },
      { kind: "file", attachment_id: FILE_B, label: "" },
    ],
  });
  assert.deepEqual(v.resources, [
    { kind: "link", url: "https://a.com/", attachment_id: null, label: "Form" },
    { kind: "file", url: null, attachment_id: FILE_A, label: null },
    { kind: "file", url: null, attachment_id: FILE_B, label: null },
  ]);
  assert.deepEqual(fileIdsOf(v.resources), [FILE_A, FILE_B]);
  assert.throws(() => validateTaskInput({ title: "T", audience: "both", resources: [{ kind: "file", attachment_id: "../etc" }] }), /Invalid document/);
  assert.throws(() => validateTaskInput({ title: "T", audience: "both", resources: [{ kind: "script" }] }), /Invalid link or document/);
  assert.throws(() => validateTaskInput({ title: "T", audience: "both", resources: "nope" }), /must be a list/);
  const many = Array.from({ length: 21 }, (_, i) => ({ kind: "link", url: `https://x.com/${i}` }));
  assert.throws(() => validateTaskInput({ title: "T", audience: "both", resources: many }), /at most 20/);
});

// ── Revision semantics ────────────────────────────────────────────────────

const base = {
  title: "Physical", instructions: "Bring it", body_text: null, audience: "both",
  resources: [
    { kind: "link", url: "https://a.com/", attachment_id: null, label: "A" },
    { kind: "file", url: null, attachment_id: FILE_A, label: null },
  ],
};

test("substantive: title, instructions, body, audience, or the set of links/files", () => {
  assert.equal(isSubstantiveTaskChange(base, { ...base, title: "Physical exam" }), true);
  assert.equal(isSubstantiveTaskChange(base, { ...base, instructions: "Bring it Monday" }), true);
  assert.equal(isSubstantiveTaskChange(base, { ...base, body_text: "Rules" }), true);
  assert.equal(isSubstantiveTaskChange(base, { ...base, audience: "athlete" }), true);
  assert.equal(isSubstantiveTaskChange(base, { ...base, resources: [base.resources[0]] }), true);
  assert.equal(isSubstantiveTaskChange(base, { ...base, resources: [...base.resources, { kind: "file", url: null, attachment_id: FILE_B, label: null }] }), true);
  assert.equal(isSubstantiveTaskChange(base, { ...base, resources: [{ ...base.resources[0], url: "https://b.com/" }, base.resources[1]] }), true);
});

test("not substantive: no change, reordered links/files, or a link label edit", () => {
  assert.equal(isSubstantiveTaskChange(base, { ...base }), false);
  assert.equal(isSubstantiveTaskChange(base, { ...base, resources: [base.resources[1], base.resources[0]] }), false);
  assert.equal(isSubstantiveTaskChange(base, { ...base, resources: [{ ...base.resources[0], label: "Renamed" }, base.resources[1]] }), false);
  assert.equal(isSubstantiveTaskChange({ ...base, instructions: null }, { ...base, instructions: null }), false);
});

// ── Visibility / authorization ────────────────────────────────────────────

test("viewer roles: Head Coach and platform admin manage; assistant read-only; booster none", () => {
  assert.equal(taskViewerFor(coach("head_coach")), "manager");
  assert.equal(taskViewerFor(platformAdmin), "manager");
  assert.equal(taskViewerFor(coach("assistant_coach")), "coach");
  assert.equal(taskViewerFor(coach("booster")), "booster");
  assert.equal(taskViewerFor(member("booster")), "booster");
  assert.equal(taskViewerFor(member("athlete")), "athlete");
  assert.equal(taskViewerFor(member("parent")), "parent");
  assert.equal(taskViewerFor({ kind: "public" }), "none");
  assert.deepEqual(["manager", "coach", "athlete", "parent", "booster", "none"].filter(v => canManageTasks(v as never)), ["manager"]);
});

test("legacy team-login coach (no ELF account) resolves by role alone", () => {
  // CoachSession carries no account id at all — role is what matters.
  assert.equal(taskViewerFor({ kind: "coach", session: { id: "legacy", name: "Old Login", role: "head_coach", campaign_slug: "wolves" } }), "manager");
});

test("audiences: coaches see all; athletes Athlete+Both; parents Parent+Both; boosters nothing", () => {
  assert.deepEqual([...visibleAudiences("manager")], ["athlete", "parent", "both"]);
  assert.deepEqual([...visibleAudiences("coach")], ["athlete", "parent", "both"]);
  assert.deepEqual([...visibleAudiences("athlete")], ["athlete", "both"]);
  assert.deepEqual([...visibleAudiences("parent")], ["parent", "both"]);
  assert.deepEqual([...visibleAudiences("booster")], []);
  assert.deepEqual([...visibleAudiences("none")], []);
});

test("archived tasks are visible only to the Head Coach", () => {
  const archived = { audience: "both", status: "archived" };
  const active = { audience: "both", status: "active" };
  assert.ok(canViewTask("manager", archived));
  for (const v of ["coach", "athlete", "parent", "booster", "none"] as const) {
    assert.equal(canViewTask(v, archived), false, v);
    assert.equal(canViewArchived(v), false, v);
  }
  assert.ok(canViewTask("coach", active));
  assert.equal(canViewTask("parent", { audience: "athlete", status: "active" }), false);
  assert.equal(canViewTask("athlete", { audience: "parent", status: "active" }), false);
});

// ── Ordering ──────────────────────────────────────────────────────────────

test("tasks sort by sort_order, then created_at, then id — deterministically", () => {
  const rows = [
    { id: "c", sort_order: 1, created_at: "2026-01-01" },
    { id: "b", sort_order: 0, created_at: "2026-02-01" },
    { id: "a", sort_order: 0, created_at: "2026-02-01" },
    { id: "d", sort_order: 0, created_at: "2026-01-01" },
  ];
  assert.deepEqual(sortTasks(rows).map(r => r.id), ["d", "a", "b", "c"]);
  assert.deepEqual(rows.map(r => r.id), ["c", "b", "a", "d"]); // not mutated
});
