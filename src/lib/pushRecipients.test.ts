import test from "node:test";
import assert from "node:assert/strict";
import { getAccountIdsForThreadParticipants, getHeadCoachAccountIds, getAccountIdsForScope } from "./pushRecipients.ts";

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
  // Family Relationships Phase B: exclusion is now account_id-based (it has
  // to resolve the sender's own account_id to exclude it correctly even
  // when the same account is ALSO represented by a different participant
  // identity elsewhere in the thread — see the "sender represented as both
  // coach and member" test below), so the coach-id lookup always runs even
  // when the sender turns out to be the only participant. The important,
  // unchanged guarantee is the OUTCOME: no recipients.
  const { calls, restore } = mockFetchSequence([
    { json: [{ actor_type: "coach", coach_id: "sender-coach", member_id: null }] },
    { json: [{ id: "sender-coach", account_id: "acct-sender" }] },
  ]);
  let result: string[];
  try {
    result = await getAccountIdsForThreadParticipants("thread-1", "coach:sender-coach");
  } finally {
    restore();
  }

  assert.deepEqual(result, []);
  assert.equal(calls.length, 2);
});

// Family Relationships Phase B: a coach who is also a parent can be
// represented in the same thread by TWO participant rows (coach:<id> and
// member:<id>) that both resolve to the same account_id. The OLD exclusion
// (matching only the literal sending actor key) would have left the member
// identity's account_id in the result, so the sender received a push for
// their own message. Exclusion must now be by resolved account_id.
test("getAccountIdsForThreadParticipants: sender represented as both coach and member — their account is excluded entirely, not just the sending identity", async () => {
  const { restore } = mockFetchSequence([
    { json: [
      { actor_type: "coach", coach_id: "mike-coach", member_id: null },
      { actor_type: "member", coach_id: null, member_id: "mike-member" },
      { actor_type: "member", coach_id: null, member_id: "other-parent" },
    ] },
    { json: [{ id: "mike-coach", account_id: "acct-mike" }] },
    { json: [{ id: "mike-member", account_id: "acct-mike" }, { id: "other-parent", account_id: "acct-other-parent" }] },
  ]);
  let result: string[];
  try {
    result = await getAccountIdsForThreadParticipants("thread-1", "coach:mike-coach");
  } finally {
    restore();
  }

  assert.deepEqual(result, ["acct-other-parent"]);
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

// ─── getAccountIdsForScope — athlete_specific — Family Relationships Phase B ──

test("K. athlete-specific push includes a parent linked to the athlete ONLY via team_member_athletes, plus every coach", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.includes("team_members?athlete_id=eq.athlete-b")) {
      return { ok: true, status: 200, json: async () => [{ id: "athlete-b-member", role: "athlete", athlete_id: "athlete-b", account_id: "acct-athlete-b" }] } as Response;
    }
    if (u.includes("team_member_athletes?athlete_id=eq.athlete-b")) {
      return { ok: true, status: 200, json: async () => [{ team_member_id: "parent-member" }] } as Response;
    }
    if (u.includes("team_members?id=in.(parent-member)")) {
      return { ok: true, status: 200, json: async () => [{ id: "parent-member", role: "parent", athlete_id: null, account_id: "acct-parent" }] } as Response;
    }
    if (u.includes("team_coaches?campaign_slug=eq.wolves&select=account_id")) {
      return { ok: true, status: 200, json: async () => [{ account_id: "acct-coach" }] } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  }) as typeof fetch;

  let result: string[];
  try {
    result = await getAccountIdsForScope("wolves", "athlete_specific", "athlete-b");
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.deepEqual(result.sort(), ["acct-athlete-b", "acct-coach", "acct-parent"]);
});

test("L. duplicate identities for the same account produce one recipient (dedupe)", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.includes("team_members?athlete_id=eq.athlete-b")) {
      return { ok: true, status: 200, json: async () => [{ id: "athlete-b-member", role: "athlete", athlete_id: "athlete-b", account_id: "acct-shared" }] } as Response;
    }
    if (u.includes("team_member_athletes?athlete_id=eq.athlete-b")) {
      return { ok: true, status: 200, json: async () => [] } as Response;
    }
    if (u.includes("team_coaches?campaign_slug=eq.wolves&select=account_id")) {
      // Same account also appears as a coach — must still collapse to one id.
      return { ok: true, status: 200, json: async () => [{ account_id: "acct-shared" }] } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  }) as typeof fetch;

  let result: string[];
  try {
    result = await getAccountIdsForScope("wolves", "athlete_specific", "athlete-b");
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.deepEqual(result, ["acct-shared"]);
});
