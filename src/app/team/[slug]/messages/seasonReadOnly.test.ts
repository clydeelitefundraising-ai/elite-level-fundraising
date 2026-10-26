// Complete Season Phase 2 — a completed season's conversations stay visible
// but read-only: no composer, no attachments, no new conversations or
// groups. (The server routes and the database refuse sends regardless;
// see seasonWritableCoverage.test.ts and the phase_s2 SQL tests.)
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: ThreadView } = await import("./[threadId]/ThreadView.tsx");

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const thread = {
  id: "t1", campaign_slug: "lions-2027", subject: "Practice", thread_type: "dm", group_name: null,
  created_by_type: "coach", created_by_coach_id: "c1", created_by_member_id: null, created_by_platform_admin_id: null,
  creator_name: "Hana Head", creator_role: "head_coach", last_message_at: "2027-05-01T00:00:00Z",
  last_message_preview: "See you", created_at: "2027-04-01T00:00:00Z", archived_at: null,
};
const participants = [
  { id: "p1", actor_type: "coach", coach_id: "c1", member_id: null, platform_admin_id: null, is_auto_included: false, is_observer: false,
    removed_at: null, name: "Hana Head", role: "head_coach", photo_url: null },
  { id: "p2", actor_type: "member", coach_id: null, member_id: "m1", platform_admin_id: null, is_auto_included: false, is_observer: false,
    removed_at: null, name: "Jo Junior", role: "athlete", photo_url: null },
];
const messages = [{
  id: "msg1", thread_id: "t1", sender_type: "coach", sender_coach_id: "c1", sender_member_id: null, sender_platform_admin_id: null,
  body: "Historical message text", created_at: "2027-05-01T00:00:00Z", sender_name: "Hana Head", sender_role: "head_coach",
  sender_photo_url: null, read_at: null, attachments: [], deleted_at: null,
}];
const render = (seasonReadOnly: boolean) => renderToStaticMarkup(createElement(ThreadView as never, {
  slug: "lions-2027", thread, participants, initialMessages: messages, actorKind: "coach", actorId: "c1",
  actorName: "Hana Head", primaryColor: "#112233", seasonReadOnly,
} as never));

test("completed season: the conversation is shown in full, with a read-only notice instead of the composer", () => {
  const html = render(true);
  assert.ok(html.includes("Historical message text"), "history is visible");
  assert.ok(html.includes("This season has been completed. Its messages are read-only."));
  assert.ok(!html.includes("<textarea"), "no reply box");
  assert.ok(!html.includes('aria-label="Send message"'), "no send button");
  assert.ok(!html.includes('type="file"') && !html.includes("Attach photos, videos, or files"), "no attachment picker");
});

test("active season: unchanged — composer, attachment picker and send button are there", () => {
  const html = render(false);
  assert.ok(html.includes("Historical message text"));
  assert.ok(html.includes("<textarea"));
  assert.ok(html.includes('aria-label="Send message"'));
  assert.ok(html.includes('type="file"') && html.includes("Attach photos, videos, or files"));
  assert.ok(!html.includes("This season has been completed"));
});

test("the thread page derives read-only from the season and turns off group management with it", () => {
  const page = read("src/app/team/[slug]/messages/[threadId]/page.tsx");
  assert.match(page, /const seasonReadOnly = isSeasonCompleted\(settings\);/);
  assert.match(page, /const canManageGroup =\n\s+!seasonReadOnly &&/);
  assert.match(page, /const canArchiveGroup = !seasonReadOnly &&/);
  assert.match(page, /seasonReadOnly=\{seasonReadOnly\}/);
});

test("the message list hides New / New Group on a completed season; the communications page passes the season state", () => {
  const list = read("src/app/team/[slug]/messages/MessagesView.tsx");
  const i = list.indexOf("{seasonReadOnly ? (");
  assert.ok(i > 0);
  assert.ok(list.indexOf('aria-label="Start a new message"') > i && list.indexOf('aria-label="Create a new group"') > i);
  assert.match(read("src/app/team/[slug]/communications/page.tsx"), /seasonReadOnly=\{isSeasonCompleted\(settings\)\}/);
  assert.match(read("src/app/team/[slug]/communications/CommunicationsView.tsx"), /seasonReadOnly=\{seasonReadOnly\}/);
});

test("historical threads are NOT hidden: the existing archived_at mechanism is untouched and never set for a completed season", () => {
  const lib = read("src/lib/messages.ts");
  assert.match(lib, /archived_at=is\.null/);
  assert.doesNotMatch(lib, /season_completed/);
  const s1 = read("supabase/migrations/phase_s1_complete_season.sql");
  assert.doesNotMatch(s1, /archived_at\s*=/, "the transition never archives threads");
});
