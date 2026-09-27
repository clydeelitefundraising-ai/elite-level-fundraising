import test from "node:test";
import assert from "node:assert/strict";
import { getAccountIdsForThreadParticipants, getHeadCoachAccountIds } from "./pushRecipients.ts";

// Small, targeted regression coverage for DM push recipient/sender
// exclusion — the one thing the messages route's after() consolidation
// (see messages/threads/[threadId]/messages/route.ts) must NOT change.
// Same global-fetch-stubbing technique as notifications.test.ts's Mark All
// Read tests: pushRecipients.ts's functions are thin PostgREST fetch
// wrappers with no live DB in this test environment.

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

test("getAccountIdsForThreadParticipants: excludes the sending coach, includes every other participant", async () => {
  const { restore } = mockFetchSequence([
    { json: [
      { actor_type: "coach", coach_id: "sender-coach", member_id: null },
      { actor_type: "coach", coach_id: "other-coach", member_id: null },
      { actor_type: "member", coach_id: null, member_id: "member-1" },
    ] },
    { json: [{ account_id: "acct-other-coach" }] }, // team_coaches lookup (sender excluded before this fetch)
    { json: [{ account_id: "acct-member-1" }] },    // team_members lookup
  ]);
  let result: string[];
  try {
    result = await getAccountIdsForThreadParticipants("thread-1", "coach:sender-coach");
  } finally {
    restore();
  }

  assert.deepEqual(result.sort(), ["acct-member-1", "acct-other-coach"]);
});

test("getAccountIdsForThreadParticipants: excludes the sending member, includes every other participant", async () => {
  const { restore } = mockFetchSequence([
    { json: [
      { actor_type: "member", coach_id: null, member_id: "sender-member" },
      { actor_type: "member", coach_id: null, member_id: "other-member" },
      { actor_type: "coach", coach_id: "coach-1", member_id: null },
    ] },
    { json: [{ account_id: "acct-coach-1" }] },
    { json: [{ account_id: "acct-other-member" }] },
  ]);
  let result: string[];
  try {
    result = await getAccountIdsForThreadParticipants("thread-1", "member:sender-member");
  } finally {
    restore();
  }

  assert.deepEqual(result.sort(), ["acct-coach-1", "acct-other-member"]);
});

test("getAccountIdsForThreadParticipants: a thread with only the sender resolves to no recipients (no false self-notification)", async () => {
  const { calls, restore } = mockFetchSequence([
    { json: [{ actor_type: "coach", coach_id: "sender-coach", member_id: null }] },
  ]);
  let result: string[];
  try {
    result = await getAccountIdsForThreadParticipants("thread-1", "coach:sender-coach");
  } finally {
    restore();
  }

  assert.deepEqual(result, []);
  // No coach/member account_id lookups are attempted once both id lists are empty.
  assert.equal(calls.length, 1);
});

// Small, targeted regression coverage for the Requests push recipient
// resolution used by the join/join-request/parent-access-requests after()
// fix — the one thing that fix must NOT change.

test("getHeadCoachAccountIds: returns only Head Coach account IDs for the requested campaign", async () => {
  const { calls, restore } = mockFetchSequence([
    { json: [{ account_id: "acct-head-coach-1" }] },
  ]);
  let result: string[];
  try {
    result = await getHeadCoachAccountIds("team-alpha");
  } finally {
    restore();
  }

  assert.deepEqual(result, ["acct-head-coach-1"]);
  assert.match(calls[0].url, /campaign_slug=eq\.team-alpha/);
  assert.match(calls[0].url, /role=eq\.head_coach/);
});

test("getHeadCoachAccountIds: no eligible Head Coach resolves to an empty recipient list", async () => {
  const { restore } = mockFetchSequence([
    { json: [] },
  ]);
  let result: string[];
  try {
    result = await getHeadCoachAccountIds("team-beta");
  } finally {
    restore();
  }

  assert.deepEqual(result, []);
});
