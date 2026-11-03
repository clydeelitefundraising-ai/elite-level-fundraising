import test from "node:test";
import assert from "node:assert/strict";
import { toAuditActor, adminIdentifierFor, ADMIN_TOOL_ACTOR, type AuditActor } from "./auditLog.ts";
import type { TeamActor } from "./permissions.ts";

// Phase 3A: locks in that a coach and a platform admin never collapse into
// the same audit identity, and that the legacy /admin tool and the new
// self-registration edge case are both explicit, distinct actor_type
// values rather than falling back to the old hardcoded "admin" string.

function coachActor(): Extract<TeamActor, { kind: "coach" }> {
  return { kind: "coach", session: { id: "c1", name: "Jane Coach", role: "head_coach", campaign_slug: "test-team" } };
}

function platformAdminActor(): Extract<TeamActor, { kind: "platform_admin" }> {
  return {
    kind: "platform_admin",
    session: { platformAdminId: "pa1", accountId: "acct1", name: "ELF Employee", email: "employee@elitelevelfundraising.com", campaign_slug: "test-team" },
  };
}

test("toAuditActor: coach maps to type=coach with the team_coaches id, never platform_admin's id space", () => {
  const actor = toAuditActor(coachActor());
  assert.deepEqual(actor, { type: "coach", id: "c1", name: "Jane Coach" });
});

test("toAuditActor: platform_admin maps to type=platform_admin with platformAdminId + email, never a team_coaches id", () => {
  const actor = toAuditActor(platformAdminActor());
  assert.deepEqual(actor, {
    type: "platform_admin", id: "pa1", email: "employee@elitelevelfundraising.com", name: "ELF Employee",
  });
});

test("adminIdentifierFor: coach and platform_admin never produce the same identifier for different people", () => {
  const coach: AuditActor = { type: "coach", id: "c1", name: "Jane Coach" };
  const admin: AuditActor = { type: "platform_admin", id: "pa1", email: "employee@elitelevelfundraising.com" };
  const idA = adminIdentifierFor(coach);
  const idB = adminIdentifierFor(admin);
  assert.notEqual(idA, idB);
  assert.equal(idA, "Jane Coach");
  assert.equal(idB, "employee@elitelevelfundraising.com");
});

test("adminIdentifierFor: coach with no name falls back to a coach-prefixed id, never blank", () => {
  assert.equal(adminIdentifierFor({ type: "coach", id: "c1" }), "coach:c1");
});

test("adminIdentifierFor: admin_tool always resolves to the exact legacy string, byte-compatible with every historical row", () => {
  assert.equal(adminIdentifierFor(ADMIN_TOOL_ACTOR), "admin");
  assert.equal(adminIdentifierFor({ type: "admin_tool" }), "admin");
});

test("adminIdentifierFor: system actor carries its note, distinguishable from admin_tool", () => {
  assert.equal(adminIdentifierFor({ type: "system", note: "staff_invite_self_accept" }), "system:staff_invite_self_accept");
});

test("recordAuditEvent resolves true/false and never throws; logAuditEvent stays fire-and-forget", async () => {
  const { recordAuditEvent, logAuditEvent } = await import("./auditLog.ts");
  const env = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const realFetch = globalThis.fetch, realWarn = console.warn;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-key";
  const calls: string[] = [];
  console.warn = () => {};
  try {
    const params = { actor: { type: "admin_tool" as const }, action: "test.action" };
    globalThis.fetch = (async (url: string) => { calls.push(url); return new Response("", { status: 201 }); }) as typeof fetch;
    assert.equal(await recordAuditEvent(params), true);
    globalThis.fetch = (async () => new Response("", { status: 500 })) as typeof fetch;
    assert.equal(await recordAuditEvent(params), false);
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    assert.equal(await recordAuditEvent(params), false);
    globalThis.fetch = (async (url: string) => { calls.push(url); return new Response("", { status: 201 }); }) as typeof fetch;
    assert.equal(logAuditEvent(params), undefined);
    assert.equal(calls.filter(u => u.endsWith("/rest/v1/audit_logs")).length, 2, "logAuditEvent still posts the same insert");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(await recordAuditEvent(params), false, "no credentials → false, no request");
  } finally {
    globalThis.fetch = realFetch; console.warn = realWarn;
    process.env.NEXT_PUBLIC_SUPABASE_URL = env.url; process.env.SUPABASE_SERVICE_ROLE_KEY = env.key;
    if (env.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (env.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
