// Team App demo, Phase 2 — Communications (Updates, Team Files, Messages,
// conversations, groups): messaging rules, role permissions, the local
// store, and fidelity of the reproduced screens to the real components.
// Isolation of everything the Comms screens load is covered by the import-
// graph walk in teamAppDemo.test.ts (its entry files include them).

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { join } from "node:path";
import {
  isFamilyThread, observerParticipants, otherParticipants, selfParticipantRow, threadDisplayTitle,
} from "../../../app/team/[slug]/messages/_shared/participantDisplay.ts";
import { isCoachOnlyRole, isHeadCoach, isStaff } from "../../../lib/permissions.ts";
import { DEMO_ACTORS, DEMO_ROSTER, buildDemoAnnouncements } from "./demoData.ts";
import {
  ANA, DANA, DEMO_MEMBERS, ERIN, JORDAN, LUCAS, MARCUS, MAYA,
  addComment, buildDemoEngagement, buildDemoFiles, buildDemoThreads, createGroup, deleteAnnouncement, dmParticipants,
  groupParticipants, likeStatus, personForActor, postAnnouncement, replyInThread, startDirectMessage, threadsFor,
  toggleLike, unreadMessageCount, visibleComments, demoDirectory, markThreadRead, type DemoStore,
} from "./commsData.ts";
import { commsSectionForHref } from "./demoProtocol.ts";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const NOW = new Date("2026-10-30T20:00:00Z");
const D = "src/components/marketing/team-app-demo";
const T = "src/app/team/[slug]";

function freshStore(): DemoStore {
  const announcements = buildDemoAnnouncements(NOW);
  return { announcements, engagement: buildDemoEngagement(announcements, NOW), threads: buildDemoThreads(NOW), files: buildDemoFiles(NOW), seq: 0 };
}
const keysOf = (seeds: ReturnType<typeof dmParticipants>) => seeds.map((s) => `${s.person.name}${s.autoIncluded ? "+auto" : ""}${s.observer ? "+observer" : ""}`);

// ── Messaging rules (lib/messages.ts, restated) ─────────────────────────────

test("messaging: messaging an athlete or parent includes the family; head coach oversight only when someone else starts it", () => {
  assert.deepEqual(keysOf(dmParticipants(DANA, JORDAN)), ["Dana Whitfield", "Jordan Ellis", "Erin Ellis+auto"]);
  assert.deepEqual(keysOf(dmParticipants(DANA, ERIN)), ["Dana Whitfield", "Erin Ellis", "Jordan Ellis+auto"]);
  assert.deepEqual(keysOf(dmParticipants(MARCUS, MAYA)), ["Marcus Hale", "Maya Torres", "Ana Torres+auto", "Dana Whitfield+auto+observer"]);
  assert.deepEqual(keysOf(dmParticipants(JORDAN, MARCUS)), ["Jordan Ellis", "Marcus Hale", "Erin Ellis+auto", "Dana Whitfield+auto+observer"]);
  assert.deepEqual(keysOf(dmParticipants(ERIN, DANA)), ["Erin Ellis", "Dana Whitfield", "Jordan Ellis+auto"], "the head coach is never added twice");
  assert.deepEqual(keysOf(dmParticipants(MARCUS, DANA)), ["Marcus Hale", "Dana Whitfield"], "coach-to-coach: the head coach is already in it");
});

test("messaging: athletes and parents can only start a conversation with a coach", () => {
  for (const member of DEMO_MEMBERS) {
    for (const other of DEMO_MEMBERS.filter((m) => m !== member)) {
      assert.throws(() => dmParticipants(member, other), /only start a conversation with a coach/);
    }
  }
  // The New Message sheet for members only offers coaches.
  const msgs = read(`${D}/DemoMessages.tsx`);
  assert.match(msgs, /useState<RecipientType \| null>\(isStaff \? null : "coach"\)/);
  assert.match(msgs, /\{isStaff \? "Choose recipient" : "Choose coach"\}/);
  assert.match(read(`${T}/messages/MessagesView.tsx`), /useState<RecipientType \| null>\(\s*isStaff \? null : "coach",\s*\)/);
});

test("messaging: the same people reuse the same conversation, in either direction", () => {
  let s = freshStore();
  const before = s.threads.length;
  const r1 = startDirectMessage(s, ERIN, DANA, "Quick question about Friday.", NOW.toISOString());
  assert.equal(r1.store.threads.length, before, "Erin → Coach Whitfield reuses the family thread");
  assert.equal(r1.threadId, s.threads[0].id);
  s = r1.store;
  const r2 = startDirectMessage(s, DANA, LUCAS, "Nice catch today, Lucas.", NOW.toISOString());
  assert.equal(r2.store.threads.length, before + 1, "a new pair starts a new conversation");
  const r3 = startDirectMessage(r2.store, DANA, LUCAS, "Second message.", NOW.toISOString());
  assert.equal(r3.threadId, r2.threadId);
});

test("groups: only coaches create them; selected athletes' accounts plus their families join, roster-only athletes wait", () => {
  assert.throws(() => groupParticipants(JORDAN, [], []), /Only coaches/);
  const caleb = DEMO_ROSTER.find((a) => a.name === "Caleb Brooks")!;
  const names = groupParticipants(DANA, [JORDAN.athleteId!, caleb.id], [MARCUS.id]).map((p) => p.person.name);
  assert.deepEqual(names, ["Dana Whitfield", "Marcus Hale", "Jordan Ellis", "Erin Ellis"], "Caleb hasn't joined ELF yet");
  // Created through the store, the group opens with no messages yet.
  const r = createGroup(freshStore(), DANA, "Kickers & Specialists", [caleb.id, LUCAS.athleteId!], [], NOW.toISOString());
  const g = r.store.threads.find((x) => x.id === r.threadId)!;
  assert.equal(g.thread_type, "group");
  assert.equal(g.group_name, "Kickers & Specialists");
  assert.deepEqual(g.participants.map((p) => p.name), ["Dana Whitfield", "Lucas Bennett"]);
  assert.equal(g.messages.length, 0);
  // The app's own rule for who sees New Group: head/assistant coaches only.
  assert.equal(isCoachOnlyRole("head_coach"), true);
  assert.equal(isCoachOnlyRole("assistant_coach"), true);
  assert.equal(isCoachOnlyRole("booster"), false);
  assert.match(read(`${D}/DemoComms.tsx`), /canCreateGroup=\{actor\.kind === "coach" && isCoachOnlyRole\(actor\.session\.role\)\}/);
  assert.match(read(`${T}/communications/CommunicationsView.tsx`), /canCreateGroup=\{actor\.kind === "coach" && isCoachOnlyRole\(actor\.session\.role\)\}/);
});

// ── What each role sees (with the app's own participant helpers) ────────────

test("inboxes: each role sees only conversations they're in; the head coach's oversight threads are separated", () => {
  const s = freshStore();
  const title = (who: typeof DANA) => threadsFor(s, who.key).map((t) => threadDisplayTitle(t, t.participants, who.kind, who.id));
  const coach = threadsFor(s, DANA.key);
  const oversight = coach.filter((t) => selfParticipantRow(t.participants, "coach", DANA.id)?.is_observer === true);
  assert.equal(coach.length, 4);
  assert.deepEqual(oversight.map((t) => threadDisplayTitle(t, t.participants, "coach", DANA.id)).sort(), ["Jordan Ellis · Marcus Hale · Erin Ellis", "Marcus Hale · Maya Torres · Ana Torres"]);
  assert.deepEqual(title(ERIN).sort(), ["Dana Whitfield · Jordan Ellis", "Jordan Ellis · Marcus Hale", "QBs & Receivers"].sort());
  assert.deepEqual(title(JORDAN).sort(), ["Dana Whitfield · Erin Ellis", "Marcus Hale · Erin Ellis", "QBs & Receivers"].sort());
  assert.ok(!threadsFor(s, ERIN.key).some((t) => t.participants.some((p) => p.name === "Maya Torres" && t.thread_type === "dm")), "Erin never sees the Torres family's DM");
  // Family + oversight indicators, decided by the real helpers.
  const marcusMaya = coach.find((t) => t.participants.some((p) => p.name === "Ana Torres") && t.thread_type === "dm")!;
  assert.equal(isFamilyThread(marcusMaya.participants), true);
  assert.deepEqual(observerParticipants(marcusMaya.participants).map((p) => p.name), ["Dana Whitfield"]);
  assert.deepEqual(otherParticipants(marcusMaya.participants, "member", ANA.id).map((p) => p.name), ["Marcus Hale", "Maya Torres"]);
});

test("unread: opening a conversation clears it for that viewer only; the nav and Messages badges count it", () => {
  let s = freshStore();
  assert.equal(unreadMessageCount(s, DANA.key), 1, "Erin's reply is waiting for Coach Whitfield");
  assert.equal(unreadMessageCount(s, ERIN.key), 2, "two new group messages for Erin");
  const family = threadsFor(s, DANA.key).find((t) => t.unread_count === 1)!;
  s = markThreadRead(s, family.id, DANA.key, NOW.toISOString());
  assert.equal(unreadMessageCount(s, DANA.key), 0);
  assert.equal(unreadMessageCount(s, JORDAN.key), 3, "Jordan's own unread is untouched");
  s = replyInThread(s, family.id, DANA, "See you Tuesday.", new Date(NOW.getTime() + 60_000).toISOString());
  assert.equal(unreadMessageCount(s, DANA.key), 0, "your own message is never unread");
  const tv = read(`${D}/TeamAppDemo.tsx`);
  assert.match(tv, /badgeCounts=\{\{ communications: store \? unreadMessageCount\(store, me\.key\) : 0 \}\}/);
});

// ── Updates: permissions, likes, comments ───────────────────────────────────

test("updates: only staff post, edit and see audience chips + Check Seen; only the head coach deletes", () => {
  assert.deepEqual(["coach", "athlete", "parent"].map((r) => isStaff(DEMO_ACTORS[r as "coach"])), [true, false, false]);
  assert.deepEqual(["coach", "athlete", "parent"].map((r) => isHeadCoach(DEMO_ACTORS[r as "coach"])), [true, false, false]);
  const comms = read(`${D}/DemoComms.tsx`);
  assert.match(comms, /canEdit: isStaff\(actor\), canDelete: isHeadCoach\(actor\)/);
  assert.match(read(`${T}/files/useUpdatesWorkspace.ts`), /const canEdit\s+= isStaff\(actor\);\s*const canDelete = isHeadCoach\(actor\);/);
  const card = read(`${D}/DemoUpdates.tsx`);
  assert.match(card, /<CoachBar show=\{canEdit\} label="Post Update" onAdd=\{openAdd\} \/>/);
  assert.match(card, /\{canEdit && scope !== "everyone" && \(/);
  assert.match(card, /\{canEdit && \(\s*<div style=\{\{ marginTop: "\.38rem" \}\}>/);
  assert.match(card, /\{!canEdit && \(\s*<div style=\{\{ marginTop: "\.38rem", display: "flex", justifyContent: "flex-end" \}\}>/);
  // Post/Edit uses the real form (AnnouncementFormModal), driven by the demo workspace.
  assert.match(card, /<AnnouncementFormModal workspace=\{workspace\} athletes=/);
});

test("updates: likes toggle per viewer; a head coach's comment publishes, anyone else's awaits approval and only its author sees it", () => {
  let s = freshStore();
  const pinned = s.announcements.find((a) => a.priority === "pinned")!;
  const before = likeStatus(s, pinned.id, JORDAN.key);
  s = toggleLike(s, pinned.id, JORDAN.key);
  assert.deepEqual(likeStatus(s, pinned.id, JORDAN.key), { count: before.count + 1, liked_by_me: true });
  assert.equal(likeStatus(s, pinned.id, ERIN.key).liked_by_me, true, "Erin's existing like");
  s = addComment(s, pinned.id, JORDAN, "On it!", NOW.toISOString());
  s = addComment(s, pinned.id, DANA, "Thanks everyone.", NOW.toISOString());
  const forJordan = visibleComments(s.engagement, pinned.id, JORDAN.key).map((c) => `${c.body}:${c.status}`);
  const forErin = visibleComments(s.engagement, pinned.id, ERIN.key).map((c) => `${c.body}:${c.status}`);
  assert.ok(forJordan.includes("On it!:pending") && forJordan.includes("Thanks everyone.:approved"));
  assert.ok(!forErin.some((c) => c.startsWith("On it!")), "a pending comment is private to its author");
  assert.ok(forErin.includes("Thanks everyone.:approved"));
  assert.match(read("src/lib/platform/comments.ts"), /status:\s+input\.isHeadCoachAuthor \? "approved" : "pending"/);
});

test("updates: posting and deleting stay in the store; the Home feed reads the same store", () => {
  let s = freshStore();
  const n = s.announcements.length;
  s = postAnnouncement(s, DANA, { title: "New jerseys arrived", body: "", category: "team", priority: "normal", recipient_scope: "everyone", recipient_athlete_id: null }, NOW.toISOString());
  assert.equal(s.announcements.length, n + 1);
  assert.equal(s.announcements[0].author_role, "Head Coach");
  s = deleteAnnouncement(s, s.announcements[0].id);
  assert.equal(s.announcements.length, n);
  assert.match(read(`${D}/TeamAppDemo.tsx`), /<DemoHome [^>]*announcements=\{store\.announcements\}/);
});

// ── Navigation ──────────────────────────────────────────────────────────────

test("navigation: Send Message and ?tab=messages open Messages; other Comms links open Updates; no tab is active inside a conversation", () => {
  assert.equal(commsSectionForHref("/team/sunridge-valley-football-demo/messages"), "messages");
  assert.equal(commsSectionForHref("/team/sunridge-valley-football-demo/communications?tab=messages"), "messages");
  assert.equal(commsSectionForHref("/team/sunridge-valley-football-demo/communications?tab=updates"), "updates");
  assert.equal(commsSectionForHref("/team/sunridge-valley-football-demo/communications"), "updates");
  assert.match(read(`${T}/messages/page.tsx`), /redirect\(`\/team\/\$\{slug\}\/communications\?tab=messages`\)/);
  // The real conversation page (/messages/<id>) matches no bottom-nav tab.
  assert.match(read(`${D}/TeamAppDemo.tsx`), /const activeNav = openThreadId \|\| route\.screen === "attendance" \|\| route\.screen === "contacts" \|\| route\.screen === "athlete" \? "" : tab;/);
});

// ── Data ────────────────────────────────────────────────────────────────────

test("data: fictional people only, the same Sunridge roster, and the demo's actors map to its people", () => {
  assert.equal(personForActor(DEMO_ACTORS.coach), DANA);
  assert.equal(personForActor(DEMO_ACTORS.athlete), JORDAN);
  assert.equal(personForActor(DEMO_ACTORS.parent), ERIN);
  const dir = demoDirectory();
  assert.equal(dir.athletes.length, DEMO_ROSTER.length);
  assert.deepEqual(dir.athletes.filter((a) => a.joined).map((a) => a.name), ["Maya Torres", "Jordan Ellis", "Lucas Bennett"]);
  const src = read(`${D}/commsData.ts`);
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(src), "no email addresses");
  assert.ok(!/https?:\/\//.test(src), "no URLs");
  for (const t of buildDemoThreads(NOW)) for (const m of t.messages) assert.ok(m.body.length > 0 && !/https?:/.test(m.body));
  assert.deepEqual([MAYA.name, ANA.name, LUCAS.name, MARCUS.name], ["Maya Torres", "Ana Torres", "Lucas Bennett", "Marcus Hale"]);
});

// ── Fidelity: reproduced screens keep the real components' styles ──────────

function styleDecls(src: string): Set<string> {
  const out = new Set<string>();
  let i = 0;
  while ((i = src.indexOf("style={{", i)) >= 0) {
    let depth = 0, j = i + 7;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) break;
    }
    for (const m of src.slice(i + 8, j).matchAll(/([A-Za-z]+):\s*((?:[^,{}()]|\([^()]*\)|\{[^{}]*\})+?)\s*(?=,|$|\n)/g)) {
      out.add(`${m[1]}: ${m[2].replace(/\s+/g, " ").trim()}`);
    }
    i = j;
  }
  return out;
}
const fn = (src: string, name: string) => {
  const s = src.indexOf(`function ${name}(`);
  assert.ok(s >= 0, name);
  const e = src.slice(s + 1).search(/\n(export )?(function |const [A-Z_]+ =|type )/);
  return e < 0 ? src.slice(s) : src.slice(s, s + 1 + e);
};

// Each twin's declarations must exist in the real component. The only
// exceptions are conditionals collapsed to the branch the demo always
// shows (never busy, sending, blocked, removed, highlighted or dragging).
const TWINS: { name: string; demo: () => string; real: () => string; collapsed: string[] }[] = [
  { name: "Communications header + tabs", demo: () => read(`${D}/DemoComms.tsx`), real: () => read(`${T}/communications/CommunicationsView.tsx`), collapsed: [] },
  { name: "UpdatesView", demo: () => fn(read(`${D}/DemoUpdates.tsx`), "DemoUpdatesView"), real: () => read(`${T}/files/UpdatesView.tsx`), collapsed: [] },
  { name: "UpdateCard", demo: () => fn(read(`${D}/DemoUpdates.tsx`), "DemoUpdateCard"), real: () => fn(read(`${T}/files/UpdateCard.tsx`), "UpdateCard"), collapsed: ['boxShadow: "none"'] },
  { name: "Check Seen", demo: () => fn(read(`${D}/DemoUpdates.tsx`), "DemoReadReceiptPanel"), real: () => fn(read(`${T}/files/UpdateCard.tsx`), "ReadReceiptPanel"), collapsed: [] },
  { name: "LikeButton", demo: () => fn(read(`${D}/DemoUpdates.tsx`), "DemoLikeButton"), real: () => read(`${T}/files/LikeButton.tsx`), collapsed: ['cursor: "pointer"'] },
  { name: "CommentsSection", demo: () => fn(read(`${D}/DemoUpdates.tsx`), "DemoCommentsSection"), real: () => read(`${T}/files/CommentsSection.tsx`), collapsed: [
    'background: !body.trim() ? "var(--surface-light-elevated)" : "var(--team-primary)"',
    'color: !body.trim() ? "var(--text-muted-app)" : "var(--team-primary-foreground)"',
    'cursor: !body.trim() ? "default" : "pointer"',
  ] },
  { name: "FilesView", demo: () => fn(read(`${D}/DemoUpdates.tsx`), "DemoFilesView"), real: () => read(`${T}/files/FilesView.tsx`), collapsed: ['border: `2px dashed ${"#d1d5db"}`', 'background: "#fafafa"', "opacity: .5", "opacity: 1"] },
  { name: "MessagesView + ThreadCard + New Message", demo: () => ["DemoMessagesView", "DemoThreadCard", "DemoComposeModal"].map((n) => fn(read(`${D}/DemoMessages.tsx`), n)).join("\n"), real: () => read(`${T}/messages/MessagesView.tsx`), collapsed: [
    'cursor: !msgBody.trim() ? "default" : "pointer"', "opacity: !msgBody.trim() ? .5 : 1",
  ] },
  { name: "ThreadView + MessageBubble", demo: () => ["DemoThreadView", "DemoMessageBubble"].map((n) => fn(read(`${D}/DemoMessages.tsx`), n)).join("\n"), real: () => read(`${T}/messages/[threadId]/ThreadView.tsx`), collapsed: [
    'background: isSelf ? primaryColor : "#fff"', 'color: isSelf ? "#fff" : "#1f2937"', 'fontStyle: "normal"', 'boxShadow: "0 1px 3px rgba(0,0,0,.08)"',
  ] },
  { name: "Create Group + picker", demo: () => ["DemoCreateGroupModal", "DemoGroupParticipantPicker"].map((n) => fn(read(`${D}/DemoMessages.tsx`), n)).join("\n"), real: () => read(`${T}/messages/_shared/CreateGroupModal.tsx`) + read(`${T}/messages/_shared/GroupParticipantPicker.tsx`), collapsed: [] },
  { name: "AttachmentPickerButton", demo: () => fn(read(`${D}/DemoMessages.tsx`), "DemoAttachmentButton"), real: () => read(`${T}/messages/_shared/AttachmentPickerButton.tsx`), collapsed: ['cursor: "pointer"', "opacity: 1"] },
];

for (const twin of TWINS) {
  test(`fidelity: ${twin.name} twin uses only the real component's styles`, () => {
    const real = styleDecls(twin.real());
    const demo = styleDecls(twin.demo());
    assert.ok(demo.size > 5, "twin found");
    const extra = [...demo].filter((d) => !real.has(d) && !twin.collapsed.includes(d));
    assert.deepEqual(extra, []);
    // Every collapsed declaration really is a branch of a real conditional.
    for (const c of twin.collapsed) assert.ok(!real.has(c), `${c} no longer needs collapsing`);
  });
}

test("fidelity: the real messaging labels and safety copy are unchanged in the twins", () => {
  const real = read(`${T}/messages/MessagesView.tsx`) + read(`${T}/messages/[threadId]/ThreadView.tsx`);
  const demo = read(`${D}/DemoMessages.tsx`);
  for (const s of [
    "Parent/guardian will be included. Head coach oversight applies.",
    "Athlete will be included. Head coach oversight applies.",
    "Parent/guardian included",
    "included for oversight",
    "Search your roster to message an athlete.",
    "Your coach will start a conversation with you here.",
    "Reply… (⌘+Enter to send)",
  ]) {
    assert.ok(real.includes(s), `real: ${s}`);
    assert.ok(demo.includes(s), `demo: ${s}`);
  }
});

test("phones: no device bezel — the demo runs full width (rule placed after the base frame rules so it wins)", () => {
  const css = read("src/app/marketing-product.css");
  const phoneBlock = css.indexOf("@media (max-width: 640px) {\n  .mk-sim-device");
  assert.ok(phoneBlock > 0);
  for (const base of [".mk-sim-phone {", ".mk-sim-status {", ".mk-sim-frame {"]) assert.ok(css.indexOf(base) < phoneBlock, `${base} comes first`);
  const block = css.slice(phoneBlock, css.indexOf("\n}\n", phoneBlock));
  assert.match(block, /\.mk-sim-device \{ margin: 0 calc\(-1 \* var\(--mk-space-6\)\); \}/);
  assert.match(block, /\.mk-sim-phone \{ width: 100%;[^}]*border: 0;[^}]*border-radius: 0; box-shadow: none; \}/);
  assert.match(block, /\.mk-sim-status \{ display: none; \}/);
  // The desktop frame (12px bezel around a 390px screen) is unchanged.
  assert.match(css, /\.mk-sim-phone \{\n  position: relative;\n  \/\* 414px - 2 x 12px border = a 390px screen, the width of a typical phone\. \*\/\n  width: 414px;/);
});

test("the marketing stylesheets parse (the same PostCSS the build uses)", () => {
  for (const f of ["src/app/marketing-product.css", "src/app/marketing.css", "src/app/marketing-tokens.css"]) {
    assert.doesNotThrow(() => postcss.parse(read(f)), f);
  }
});
