// Group Messaging G1 — push.ts's account-id resolution fix.
//
// Mirrors pushRecipients.test.ts's exact fake-fetch-sequence technique:
// push.ts's resolveEligiblePushAccountIds() is a thin PostgREST fetch
// wrapper with no live DB in this test environment. This specifically
// covers the bug the G1 audit found and this phase fixed: the legacy
// VAPID/web-push channel used to dedupe/exclude by raw actor key, so a
// coach-who-is-also-a-parent (two participant rows resolving to the same
// account) could still self-notify through whichever row wasn't the
// literal sender. resolveEligiblePushAccountIds now matches
// getAccountIdsForThreadParticipants's (pushRecipients.ts) account-id-based
// behavior exactly, by construction (same shape).
import test from "node:test";
import assert from "node:assert/strict";
import { resolveEligiblePushAccountIds } from "./push.ts";
import type { ParticipantRef } from "./messages.ts";

type FetchCall = { url: string };

function mockFetchSequence(responses: { json: unknown }[]): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  let i = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    calls.push({ url: String(url) });
    const resp = responses[Math.min(i, responses.length - 1)];
    i++;
    return { ok: true, status: 200, json: async () => resp.json } as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function coach(id: string): ParticipantRef {
  return { actor_type: "coach", coach_id: id, member_id: null, platform_admin_id: null };
}
function member(id: string): ParticipantRef {
  return { actor_type: "member", coach_id: null, member_id: id, platform_admin_id: null };
}

test("excludes the sending coach's account, includes every other participant's account", async () => {
  const { restore } = mockFetchSequence([
    { json: [{ id: "sender-coach", account_id: "acct-sender" }, { id: "other-coach", account_id: "acct-other-coach" }] },
    { json: [{ id: "member-1", account_id: "acct-member-1" }] },
  ]);
  let result: string[];
  try {
    result = await resolveEligiblePushAccountIds([coach("sender-coach"), coach("other-coach"), member("member-1")], "coach:sender-coach");
  } finally {
    restore();
  }
  assert.deepEqual(result.sort(), ["acct-member-1", "acct-other-coach"]);
});

test("coach+parent dual identity: two participant rows for the SAME account both resolve to one account_id, excluded entirely when that account is the sender", async () => {
  // Coach Smith is both the coach-row AND (via family mirroring) the
  // member-row participant in this thread — both rows carry the same
  // underlying account_id. Coach Smith sends; the recipient list must
  // exclude their account entirely, regardless of which row sent it.
  const { restore } = mockFetchSequence([
    { json: [{ id: "coach-smith", account_id: "acct-smith" }] },
    { json: [{ id: "member-smith", account_id: "acct-smith" }, { id: "member-other", account_id: "acct-other" }] },
  ]);
  let result: string[];
  try {
    result = await resolveEligiblePushAccountIds(
      [coach("coach-smith"), member("member-smith"), member("member-other")],
      "coach:coach-smith",
    );
  } finally {
    restore();
  }
  assert.deepEqual(result, ["acct-other"], "acct-smith must never appear — neither participant row representing the sender's own account should self-notify");
});

test("coach+parent dual identity: sender is the MEMBER row, the SAME account's coach row is still excluded", async () => {
  const { restore } = mockFetchSequence([
    { json: [{ id: "coach-smith", account_id: "acct-smith" }] },
    { json: [{ id: "member-smith", account_id: "acct-smith" }, { id: "member-other", account_id: "acct-other" }] },
  ]);
  let result: string[];
  try {
    result = await resolveEligiblePushAccountIds(
      [coach("coach-smith"), member("member-smith"), member("member-other")],
      "member:member-smith",
    );
  } finally {
    restore();
  }
  assert.deepEqual(result, ["acct-other"]);
});

test("accounts are deduped even if represented by multiple participant rows and neither is the sender", async () => {
  const { restore } = mockFetchSequence([
    { json: [{ id: "coach-smith", account_id: "acct-smith" }] },
    { json: [{ id: "member-smith", account_id: "acct-smith" }, { id: "member-other", account_id: "acct-other" }] },
  ]);
  let result: string[];
  try {
    result = await resolveEligiblePushAccountIds(
      [coach("coach-smith"), member("member-smith"), member("member-other")],
      "member:someone-else-entirely",
    );
  } finally {
    restore();
  }
  assert.deepEqual(result.sort(), ["acct-other", "acct-smith"], "acct-smith must appear exactly once despite two participant rows");
});

test("empty participant list resolves to no eligible accounts without any fetch", async () => {
  const { calls, restore } = mockFetchSequence([]);
  let result: string[];
  try {
    result = await resolveEligiblePushAccountIds([], "coach:nobody");
  } finally {
    restore();
  }
  assert.deepEqual(result, []);
  assert.equal(calls.length, 0);
});

test("a participant with no resolvable account_id is simply excluded from the result, not a crash", async () => {
  const { restore } = mockFetchSequence([
    { json: [{ id: "coach-1", account_id: null }] },
    { json: [] },
  ]);
  let result: string[];
  try {
    result = await resolveEligiblePushAccountIds([coach("coach-1")], "coach:someone-else");
  } finally {
    restore();
  }
  assert.deepEqual(result, []);
});
