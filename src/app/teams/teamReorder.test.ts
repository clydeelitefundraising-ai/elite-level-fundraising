// Custom Team Ordering — structural checks on the Team Selector's reorder
// mode (TeamsView.tsx + TeamReorderList.tsx). Source scans, same approach as
// the repo's other client-component tests; they pin the approved behavior
// rather than render it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const view = readFileSync(new URL("./TeamsView.tsx", import.meta.url), "utf8");
const list = readFileSync(new URL("./TeamReorderList.tsx", import.meta.url), "utf8");

test("Reorder control only for accounts with two or more teams, hidden while reordering", () => {
  assert.match(view, /const canReorder\s*=\s*displayTeams\.length >= 2;/);
  assert.match(view, /\{canReorder && !reordering && \(/);
});

test("reorder mode replaces the linked team grid with the reorder list (navigation disabled)", () => {
  assert.match(view, /\) : reordering \? \(\s*<TeamReorderList/);
  // The linked cards only exist in the non-reorder branch.
  const linkedBranch = view.slice(view.indexOf("<TeamReorderList"));
  assert.match(linkedBranch, /\) : \(\s*<div className=\{styles\.teamsGrid\}>\s*\{displayTeams\.map/);
  assert.doesNotMatch(list, /<a[\s>]|href=/, "reorder rows must never be links");
});

test("pending/declined request cards stay outside the reorderable list", () => {
  assert.match(view, /teams=\{applySlugOrder\(displayTeams, draft\)\}/);
  assert.doesNotMatch(list, /PendingTeamCard|pendingCards/);
});

test("saving happens only from Done, via one PUT to the team-order endpoint", () => {
  assert.equal(view.match(/fetch\(/g)?.length, 1);
  assert.match(view, /fetch\("\/api\/account\/team-order", \{\s*method:\s*"PUT"/);
  assert.match(view, /onClick=\{saveReorder\}[^>]*>\s*\{saving \? "Saving…" : "Done"\}/);
  assert.match(view, /onClick=\{cancelReorder\}/);
  assert.doesNotMatch(list, /fetch\(/, "moving a team must not save anything");
});

test("save failure shows an error and keeps the previously persisted order", () => {
  // savedOrder (the displayed persisted order) only changes after res.ok.
  const body = view.slice(view.indexOf("async function saveReorder"), view.indexOf("return (", view.indexOf("async function saveReorder")));
  assert.ok(body.indexOf("if (!res.ok) throw") < body.indexOf("setSavedOrder(draft)"));
  assert.match(body, /catch \{[\s\S]*setOrderError\(/);
  assert.match(view, /role="alert"/);
});

test("ProfileMenu / Settings navigation still follows the server-provided first team", () => {
  assert.equal(view.match(/firstTeamSlug=\{teams\[0\]\?\.campaign_slug \?\? null\}/g)?.length, 2);
});

test("reorder list is a single column at every width", () => {
  assert.match(list, /<ol[\s\S]*?display: "flex", flexDirection: "column"/);
  assert.doesNotMatch(list, /styles\.teamsGrid|grid-template-columns|display: "grid"/);
});

test("drag supports mouse, touch and keyboard; touch only on the handle", () => {
  for (const s of ["MouseSensor", "TouchSensor", "KeyboardSensor", "sortableKeyboardCoordinates"]) assert.match(list, new RegExp(s));
  assert.match(list, /ref=\{setActivatorNodeRef\}\s*\{\.\.\.attributes\}\s*\{\.\.\.listeners\}/);
  assert.match(list, /touchAction: "none"/);
});

test("accessible up/down fallback with labels, disabled at the ends, and announcements", () => {
  assert.match(list, /aria-label=\{`Move \$\{label\} up`\}/);
  assert.match(list, /aria-label=\{`Move \$\{label\} down`\}/);
  assert.match(list, /disabled=\{disabled \|\| index === 0\}/);
  assert.match(list, /disabled=\{disabled \|\| index === count - 1\}/);
  assert.match(list, /aria-live="polite"/);
  assert.match(list, /screenReaderInstructions/);
  assert.match(list, /minWidth: 44, minHeight: 44/);
});

test("sport and season are shown prominently in reorder mode", () => {
  assert.match(list, /const detail = \[team\.sport_name, team\.season\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(list, /fontWeight: 700, fontSize: "\.84rem", color: "#374151"[\s\S]*?\{detail\}/);
  assert.match(list, /return \[team\.school_name, team\.sport_name, team\.season\]/);
});

test("drag-and-drop library is confined to the client reorder component", () => {
  assert.match(list, /^"use client";/);
  assert.doesNotMatch(view, /@dnd-kit/);
});
