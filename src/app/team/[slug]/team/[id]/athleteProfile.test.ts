// Phase 3C-2 — the coach-only "To-Do Tasks" card and the Linked Members
// correction on the staff athlete profile (/team/[slug]/team/[id]).
// Behaviour of the completion API itself is covered by
// api/team/[slug]/todo/completion/completion.route.test.ts; the linked
// members read by src/lib/athleteLinkedMembers.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { TeamActor } from "../../../../../lib/permissions.ts";
import { taskViewerFor } from "../../../../../lib/teamTasks.ts";
import {
  COMPLETION_STATE_DISPLAY,
  REQUIREMENT_LABELS,
  canViewCompletion,
  parseAthleteCompletionResponse,
} from "../../../../../lib/teamTaskCompletion.ts";

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const page = src("./page.tsx");
const view = src("./CoachAthleteView.tsx");
const card = src("./AthleteTaskCompletion.tsx");

const coach = (role: string): TeamActor => ({ kind: "coach", session: { id: "c", name: "C", role, campaign_slug: "s" } as never });
const member = (role: string): TeamActor => ({ kind: "member", session: { id: "m", name: "M", role, campaign_slug: "s", athlete_id: "a1", account_id: null } as never });
const admin: TeamActor = { kind: "platform_admin", session: { platformAdminId: "p", accountId: "a", name: "A", email: "e", campaign_slug: "s" } };

// ── Who sees the card ─────────────────────────────────────────────────────

test("card visibility: Head Coach, Assistant Coach and platform admins only — never boosters", () => {
  const sees = (a: TeamActor) => canViewCompletion(taskViewerFor(a));
  assert.equal(sees(coach("head_coach")), true);
  assert.equal(sees(coach("assistant_coach")), true);
  assert.equal(sees(admin), true);
  assert.equal(sees(coach("booster")), false);   // booster coach — can open this page
  assert.equal(sees(member("booster")), false);  // booster member — can open this page
  assert.equal(sees(member("athlete")), false);
  assert.equal(sees(member("parent")), false);
  assert.equal(sees({ kind: "public" }), false);
});

test("page decides visibility on the server from the resolved actor; athletes/parents still go to their own page", () => {
  assert.match(page, /showTaskCompletion=\{canViewCompletion\(taskViewerFor\(actor\)\)\}/);
  assert.match(page, /if \(!isStaff\(actor\)\) redirect\(`\/team\/\$\{slug\}\/athlete\/\$\{id\}`\);/);
  assert.match(page, /if \(!athlete \|\| athlete\.campaign_slug !== slug\) notFound\(\);/);
  // The card is rendered only behind that flag, and it reads the coach-only API.
  assert.match(view, /\{showTaskCompletion && <AthleteTaskCompletion slug=\{slug\} athleteId=\{athlete\.id\} \/>\}/);
  assert.match(view, /showTaskCompletion = false,/); // default: hidden
  // Coach source (the default here) reads the coach-only API.
  assert.match(card, /: `\/api\/team\/\$\{slug\}\/todo\/completion\/athletes\/\$\{id\}`/);
  assert.match(card, /source = "coach"/);
});

test("placement: after Linked Members, before (and outside) the fundraising sections", () => {
  const members = view.indexOf("{/* ── Members section ── */}");
  const todo = view.indexOf("{showTaskCompletion && <AthleteTaskCompletion");
  const fundraising = view.indexOf("{fundraisingActive && (\n      <>");
  assert.ok(members > 0 && todo > members && fundraising > todo, `${members} < ${todo} < ${fundraising}`);
  // Shown whether or not fundraising is active.
  assert.ok(!view.slice(fundraising).includes("AthleteTaskCompletion"));
});

// ── Labels, icons and the response check ──────────────────────────────────

test("every state has its icon and visible text; only complete is green, unknown is grey", () => {
  assert.deepEqual(COMPLETION_STATE_DISPLAY, {
    complete:         { icon: "check",   text: "Acknowledged" },
    outstanding:      { icon: "x",       text: "Not acknowledged yet" },
    needs_update:     { icon: "x",       text: "Needs new acknowledgment" },
    not_joined:       { icon: "x",       text: "Hasn't joined ELF yet" },
    no_parent_linked: { icon: "x",       text: "No parent linked" },
    unknown:          { icon: "unknown", text: "Status unavailable" },
  });
  assert.deepEqual(REQUIREMENT_LABELS, { athlete: "Athlete", parent: "Parent/guardian" });
  assert.match(card, /const fill = icon === "check" \? "#16a34a" : icon === "x" \? "#dc2626" : "#9ca3af";/);
  // The text is always rendered next to the icon (never icon-only), and the date only when complete.
  assert.match(card, /<StateIcon state=\{entry\.state\} \/>[\s\S]*?\{REQUIREMENT_LABELS\[entry\.requirement\]\}:[\s\S]*?\{text\}/);
  assert.match(card, /const date = entry\.state === "complete" \? formatAcknowledgedDate\(entry\.acknowledgedAt\) : "";/);
});

const ok = (tasks: unknown[]) => ({ available: true, tasks });
const task = (entries: unknown[], id = "t1", title = "Physical Forms") => ({ task: { id, title, audience: "both", revision: 1 }, entries, status: "x" });

test("response check: athlete-only, parent-only and both tasks keep only their own requirements", () => {
  const parsed = parseAthleteCompletionResponse(ok([
    task([{ requirement: "athlete", state: "complete", acknowledgedAt: "2026-10-18T00:27:25Z" }, { requirement: "parent", state: "no_parent_linked", acknowledgedAt: null }]),
    task([{ requirement: "athlete", state: "not_joined", acknowledgedAt: null }], "t2", "Athlete Waiver"),
    task([{ requirement: "parent", state: "needs_update", acknowledgedAt: null }], "t3", "Parent Consent"),
    task([{ requirement: "parent", state: "outstanding", acknowledgedAt: null }], "t4", "Medical"),
  ]));
  assert.deepEqual(parsed?.map(t => [t.task.title, t.entries.map(e => `${e.requirement}:${e.state}`)]), [
    ["Physical Forms", ["athlete:complete", "parent:no_parent_linked"]],
    ["Athlete Waiver", ["athlete:not_joined"]],
    ["Parent Consent", ["parent:needs_update"]],
    ["Medical", ["parent:outstanding"]],
  ]);
  assert.equal(parsed?.[0].entries[0].acknowledgedAt, "2026-10-18T00:27:25Z");
  assert.deepEqual(parseAthleteCompletionResponse(ok([])), []); // empty state
});

test("response check: anything unexpected is unavailable; unknown states are never green", () => {
  for (const bad of [null, {}, { available: false, tasks: [] }, { available: true }, { error: "x" },
    ok([{ task: { id: "t1" }, entries: [] }]),
    ok([task([])]),
    ok([task([{ requirement: "coach", state: "complete" }])]),
    ok([task([{ requirement: "athlete", state: "complete" }, { requirement: "athlete", state: "complete" }])]),
  ]) {
    assert.equal(parseAthleteCompletionResponse(bad), null, JSON.stringify(bad));
  }
  for (const state of ["done", "__proto__", "toString", 1, null]) {
    const p = parseAthleteCompletionResponse(ok([task([{ requirement: "athlete", state }])]));
    assert.equal(p?.[0].entries[0].state, "unknown", String(state));
  }
});

// ── Failure handling ──────────────────────────────────────────────────────

test("card: failed or unverifiable reads show the unavailable message with Try again, never statuses", () => {
  assert.match(card, /export const UNAVAILABLE_TEXT = "To-Do task status is temporarily unavailable\.";/);
  assert.match(card, /if \(!res\.ok\) return \{ kind: "error" \};/);
  assert.match(card, /return tasks \? \{ kind: "ready", tasks \} : \{ kind: "error" \};/);
  assert.match(card, /\} catch \{\s*return \{ kind: "error" \};/);
  assert.match(card, /state\.kind === "error" && \(\s*<div role="alert"[\s\S]*?\{UNAVAILABLE_TEXT\}[\s\S]*?onClick=\{retry\}[\s\S]*?Try again/);
  // Statuses render only from a fully parsed response.
  assert.ok(card.indexOf('state.kind === "ready" && state.tasks.length > 0') > card.indexOf('state.kind === "error"'));
  assert.match(card, /No active To-Do tasks\./);
  assert.match(card, /minHeight: 44/); // touch target
});

test("Linked Members: a failed read says so instead of looking like 'no linked members'", () => {
  assert.match(page, /getAthleteLinkedMembers\(slug, athlete\.id\)/);
  assert.match(page, /members=\{members\.ok \? members\.members : \[\]\}\s*membersUnavailable=\{!members\.ok\}/);
  assert.doesNotMatch(page, /getAthleteMembers/);
  assert.match(view, /\{membersUnavailable && \([\s\S]*?Linked members couldn&apos;t be loaded\. Refresh the page to try again\./);
  assert.match(view, /\{!membersUnavailable && members\.length > 0 && \(/);
});
