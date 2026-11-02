// The single definition of a message-capable parent (messageRecipients.ts)
// and the facts it relies on about the legacy team-code join.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEGACY_MEMBER_SESSION_DAYS,
  isMessageCapableParent,
  parentRecipientStatus,
} from "./messageRecipients.ts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const NOW = new Date("2026-11-02T18:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

test("a parent with an ELF account is always message-capable, however old the row", () => {
  assert.equal(parentRecipientStatus({ role: "parent", account_id: "acct-1", created_at: ago(900) }, NOW), "account");
  assert.equal(parentRecipientStatus({ role: "parent", account_id: "acct-1", created_at: null }, NOW), "account");
});

test("a legacy team-code parent is message-capable only while their 30-day session can exist", () => {
  assert.equal(parentRecipientStatus({ role: "parent", account_id: null, created_at: ago(0) }, NOW), "legacy_session");
  assert.equal(parentRecipientStatus({ role: "parent", account_id: null, created_at: ago(29.9) }, NOW), "legacy_session");
  assert.equal(parentRecipientStatus({ role: "parent", account_id: null, created_at: ago(30) }, NOW), "no_account");
  assert.equal(parentRecipientStatus({ role: "parent", account_id: null, created_at: ago(365) }, NOW), "no_account");
});

test("no account and no usable join date: not message-capable (never guessed)", () => {
  for (const created_at of [null, undefined, "", "not a date", ago(-2)]) {
    assert.equal(isMessageCapableParent({ role: "parent", account_id: null, created_at }, NOW), false, String(created_at));
  }
});

test("the 30-day window is the legacy join cookie's lifetime, set once and never renewed", () => {
  const legacy = read("src/app/api/team/[slug]/join/route.ts");
  assert.match(legacy, /response\.cookies\.set\("team_member", cookieValue, \{[\s\S]*?maxAge: 60 \* 60 \* 24 \* 30,/);
  assert.equal(LEGACY_MEMBER_SESSION_DAYS, 30);
  // The legacy route creates rows with no account_id; nothing else in the
  // app issues a team_member cookie for an account-less row.
  assert.doesNotMatch(legacy, /account_id/);
  const accountJoin = read("src/app/api/auth/join/route.ts");
  assert.match(accountJoin, /createLinkedAthleteMember\(\{[\s\S]*?accountId,/);
});

test("replies and existing conversations never go through the new-conversation check", () => {
  const reply = read("src/app/api/team/[slug]/messages/threads/[threadId]/messages/route.ts");
  assert.doesNotMatch(reply, /isMessageCapableParent|resolveOrCreateThreadForRecipient\(/);
  const messages = read("src/lib/messages.ts");
  // The check sits after the reuse return, right before a thread is created.
  const reuse = messages.indexOf("return { ok: true, thread: existingThread, reused: true };");
  const check = messages.indexOf('if (recipientMember?.role === "parent" && !isMessageCapableParent(');
  const create = messages.indexOf("// Create thread — always subjectless going forward (Phase 2B).");
  assert.ok(reuse > 0 && check > reuse && create > check);
});
