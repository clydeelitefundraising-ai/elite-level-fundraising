// Athlete profile "Messages" — opens the athlete's existing conversation,
// or the composer with the athlete preselected, and returns to the profile.
// The thread lookup itself is covered by
// src/lib/messages.athleteProfileThread.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { athleteMessagesHref, athleteParam, athleteProfilePath } from "../../../../../lib/athleteMessagesLink.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const DIR = "src/app/team/[slug]";

test("existing conversation → the thread itself, carrying the athlete for the way back", () => {
  assert.equal(
    athleteMessagesHref({ slug: "monroe-valley", athleteId: "a-1", existingThreadId: "t-9", seasonReadOnly: false }),
    "/team/monroe-valley/messages/t-9?athlete=a-1",
  );
  // A read-only season still opens an existing conversation (readable).
  assert.equal(
    athleteMessagesHref({ slug: "monroe-valley", athleteId: "a-1", existingThreadId: "t-9", seasonReadOnly: true }),
    "/team/monroe-valley/messages/t-9?athlete=a-1",
  );
});

test("no conversation → the composer with the athlete preselected; a read-only season → the inbox", () => {
  assert.equal(
    athleteMessagesHref({ slug: "monroe-valley", athleteId: "a-1", existingThreadId: null, seasonReadOnly: false }),
    "/team/monroe-valley/communications?tab=messages&compose=athlete&athlete=a-1",
  );
  assert.equal(
    athleteMessagesHref({ slug: "monroe-valley", athleteId: "a-1", existingThreadId: null, seasonReadOnly: true }),
    "/team/monroe-valley/communications?tab=messages",
  );
});

test("the athlete parameter is validated before it becomes a path", () => {
  assert.equal(athleteParam("3f2c9a1e-0b7d-4a55-9d0e-2b1c8f6a7e10"), "3f2c9a1e-0b7d-4a55-9d0e-2b1c8f6a7e10");
  for (const bad of [null, undefined, "", "../settings", "a/b", "//evil.example", "a?b", "x".repeat(65)]) {
    assert.equal(athleteParam(bad), null, String(bad));
  }
  assert.equal(athleteProfilePath("monroe-valley", "a-1"), "/team/monroe-valley/team/a-1");
  assert.equal(athleteProfilePath("monroe-valley", null), null);
});

test("the profile's Messages button uses the server-resolved link, not the inbox", () => {
  const view = read(`${DIR}/team/[id]/CoachAthleteView.tsx`);
  assert.ok(view.includes("href={messagesHref}"));
  assert.ok(!view.includes("communications?tab=messages`}"), "no hard-coded inbox link");
  const page = read(`${DIR}/team/[id]/page.tsx`);
  assert.match(page, /findExistingDirectThread\(\{ slug, actor: actorKey, recipientActorType: "member", recipientId: athleteAccount\.id \}\)/);
  assert.ok(!/resolveOrCreateThreadForRecipient|POST/.test(page), "the profile never creates a thread");
});

test("composer preselection is staff-only, off in a read-only season, and selects only from the directory", () => {
  const mv = read(`${DIR}/messages/MessagesView.tsx`);
  assert.match(mv, /composeForAthleteId && isStaff && !seasonReadOnly \? composeForAthleteId : null/);
  assert.match(mv, /dir\.athletes\.find\(a => a\.athleteId === preselectAthleteId\)/);
  assert.match(mv, /if \(entry\.teamMemberId\) setRecipientId\(entry\.teamMemberId\)/, "an athlete who hasn't joined stays unselectable");
  const comms = read(`${DIR}/communications/CommunicationsView.tsx`);
  assert.match(comms, /searchParams\.get\("compose"\) === "athlete" \? athleteParam\(searchParams\.get\("athlete"\)\) : null/);
});

test("an athlete who hasn't joined is explained, never selected; Next needs a real recipient", () => {
  const mv = read(`${DIR}/messages/MessagesView.tsx`);
  // Preselected from the profile: unjoined → the explanation, no recipient.
  assert.match(mv, /if \(entry\.teamMemberId\) setRecipientId\(entry\.teamMemberId\);\n\s*else setUnjoinedAthlete\(entry\);/);
  // Tapping an unjoined row clears any recipient instead of selecting one.
  assert.match(mv, /if \(selectable\) \{ setRecipientId\(a\.teamMemberId as string\); setUnjoinedAthlete\(null\); \}\n\s*else \{ setRecipientId\(""\); setUnjoinedAthlete\(a\); \}/);
  assert.ok(mv.includes("This athlete hasn&apos;t joined ELF yet. They need an active account before you can message them."));
  // Next is enabled only by a selected directory recipient.
  assert.match(mv, /onClick=\{\(\) => recipientId && setStep\("message"\)\}\n\s*disabled=\{!recipientId\}/);
  assert.match(mv, /if \(!recipientId \|\| \(!body && selected\.length === 0\)\) return;/);
});

test("Message Parent/Guardian opens the existing Parent flow with that guardian selected", () => {
  const mv = read(`${DIR}/messages/MessagesView.tsx`);
  assert.match(mv, /pendingGuardian\.current = guardian;\n\s*setRecipientType\("parent"\);/);
  assert.match(mv, /setRecipientId\(guardian\?\.id \?\? ""\);/);
  assert.match(mv, /onClick=\{\(\) => messageGuardian\(g\)\}/);
  assert.ok(mv.includes("Message Parent/Guardian · {g.name}"));
  // Guardians come only from the server directory (staff-only, account
  // holders, campaign-scoped — see messages/directory/route.test.ts) and
  // are sent as an ordinary parent ("member") recipient.
  assert.match(mv, /const actorType = recipientType === "coach" \? "coach" : "member";/);
  const route = read("src/app/api/team/[slug]/messages/directory/route.ts");
  assert.match(route, /if \(isStaff\(actor\)\) \{/);
  // Never the viewer themselves; who is message-capable is the shared rule
  // (messageRecipients.ts), flagged per guardian.
  assert.match(route, /p\.id !== actorMemberId && \(!actorAccountId \|\| p\.account_id !== actorAccountId\)/);
});

test("the composer keeps Next reachable on a narrow screen", () => {
  const mv = read(`${DIR}/messages/MessagesView.tsx`);
  assert.match(mv, /position: "sticky", bottom: "-1\.2rem", background: "#fff"/);
  assert.ok(mv.includes('width: "min(430px,100%)"'));
  assert.ok(mv.includes('overflowY: "auto"'));
});

test("back from the conversation returns to the athlete profile when opened from it", () => {
  const page = read(`${DIR}/messages/[threadId]/page.tsx`);
  assert.match(page, /athleteProfilePath\(slug, athleteParam\(/);
  assert.ok(page.includes("backHref={backToProfile}"));
  const view = read(`${DIR}/messages/[threadId]/ThreadView.tsx`);
  assert.ok(view.includes("router.push(backHref ?? `/team/${slug}/communications?tab=messages`)"));
});

test("Parent tab: a parent with no active ELF account is shown, explained, and never selected", () => {
  const mv = read(`${DIR}/messages/MessagesView.tsx`);
  assert.match(mv, /const unavailable = r\.messageable === false;/);
  assert.match(mv, /aria-disabled=\{unavailable\}/);
  assert.match(mv, /if \(unavailable\) \{ setRecipientId\(""\); setUnavailableParent\(r\); \}\n\s*else \{ setRecipientId\(r\.id\); setUnavailableParent\(null\); \}/);
  assert.ok(mv.includes("{unavailable && <div style={{ fontSize: \".7rem\", color: \"#9ca3af\" }}>{PARENT_UNAVAILABLE_TEXT}</div>}"));
  assert.ok(mv.includes("doesn&apos;t have an active ELF account yet, so you can&apos;t start a conversation with them. Any existing conversation with them still works."));
});

test("Message Parent/Guardian offers only message-capable guardians and explains the rest", () => {
  const mv = read(`${DIR}/messages/MessagesView.tsx`);
  assert.match(mv, /\.filter\(g => g\.messageable\)\.map\(g => \(/);
  assert.match(mv, /\.filter\(g => !g\.messageable\)\.map\(g => \(/);
  assert.ok(mv.includes("No linked parent or guardian has an active ELF account yet."));
  // Both lists come from the server's single rule.
  const route = read("src/app/api/team/[slug]/messages/directory/route.ts");
  assert.match(route, /import \{ isMessageCapableParent \} from "@\/lib\/messageRecipients";/);
  assert.match(route, /messageable: parentMessageable\.get\(m\.id\) === true \}\)\);/);
  assert.match(route, /list\.push\(\{ id: p\.id, name: p\.name, messageable: parentMessageable\.get\(p\.id\) === true \}\);/);
});
