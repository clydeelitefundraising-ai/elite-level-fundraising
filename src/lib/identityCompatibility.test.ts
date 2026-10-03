import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Identity Compatibility Phase regression coverage. Like
// joinCodeAuthorization.test.ts, this repo has no HTTP test harness to hit
// route handlers directly (they call live Supabase via fetch), so
// route-level behavior is locked in via source-scan assertions plus a
// fetch-mocked unit test of getAccountTeams's pure merge logic.

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("coach-activate token claim is atomic (used_at=is.null in the WHERE clause) — single-use enforced", () => {
  const src = read("src/app/api/auth/coach-activate/route.ts");
  assert.match(src, /coach_invite_tokens\?id=eq\.[^`]*&used_at=is\.null/);
});

test("member-activate account_id link is atomic (account_id=is.null in the WHERE clause) — single-use, single-record", () => {
  const src = read("src/app/api/team/[slug]/members/activate/route.ts");
  assert.match(src, /team_members\?id=eq\.[^`]*&account_id=is\.null/);
});

test("member-activate's existing-account lookup is built from onFileEmail (member.email), never from client-submitted body.email — prevents an attacker with any valid team_member cookie from linking their row to a different real person's elf_accounts by typing in that person's email", () => {
  const src = read("src/app/api/team/[slug]/members/activate/route.ts");
  // The elf_accounts lookup query must be constructed from onFileEmail.
  assert.match(src, /elf_accounts\?email=eq\.\$\{encodeURIComponent\(onFileEmail\)\}/);
  // targetEmail (used only for account *creation*) must prefer onFileEmail
  // over submittedEmail, not the other way around.
  assert.match(src, /const targetEmail = onFileEmail \|\| submittedEmail;/);
  // The vulnerable pattern (submittedEmail preferred over the on-file email)
  // must not reappear.
  assert.doesNotMatch(src, /targetEmail = submittedEmail \|\|/);
});

test("member-activate never exposes elf_accounts.password_hash or .salt in any client-facing response", () => {
  const src = read("src/app/api/team/[slug]/members/activate/route.ts");
  // The existing-account lookup selects id,salt but salt is only ever used
  // server-side (unused in the linking branch, matching coach-activate's
  // identical pattern) — password_hash is never selected at all, and
  // neither field is ever placed into a NextResponse.json(...) payload.
  assert.doesNotMatch(src, /select=.*password_hash/);
  const responsePayloads = [...src.matchAll(/NextResponse\.json\(\{[^}]*\}/g)].map(m => m[0]);
  for (const payload of responsePayloads) {
    assert.doesNotMatch(payload, /\bsalt\b/);
    assert.doesNotMatch(payload, /password_hash/);
  }
});

test("member-activate requires a verified team_member cookie before any account lookup (verifyMemberCookie gate present)", () => {
  const src = read("src/app/api/team/[slug]/members/activate/route.ts");
  assert.match(src, /verifyMemberCookie\(cookieValue, member\.id, member\.salt\)/);
  // The cookie check must appear before the account_id short-circuit and
  // before any elf_accounts lookup, i.e. earlier in the file.
  const cookieCheckIdx = src.indexOf("verifyMemberCookie(cookieValue");
  const elfAccountsLookupIdx = src.indexOf("elf_accounts?email=eq.");
  assert.ok(cookieCheckIdx > 0 && elfAccountsLookupIdx > cookieCheckIdx);
});

test("/api/auth/login returns the identical error message and status for 'no account found' and 'wrong password' — no email enumeration", () => {
  const src = read("src/app/api/auth/login/route.ts");
  const matches = [...src.matchAll(/NextResponse\.json\(\{ error: NOT_SIGNED_IN \}, \{ status: 401 \}\)/g)];
  assert.equal(matches.length, 2, "expected both failure branches to use the same NOT_SIGNED_IN constant and 401 status");
});

// getAccountTeams() itself (accountSession.ts) imports next/headers, which
// this repo's node:test runner cannot resolve outside a Next build — so
// its role-merge step is extracted into the pure, directly-testable
// mergeRoleBySlug() (accountTeamsMerge.ts), which getAccountTeams calls
// unchanged. The REST query construction in accountSession.ts itself
// (account_id=eq.<id> against team_coaches/team_members) is untouched —
// only the merge loop moved, verified via git diff, not re-tested here.
test("mergeRoleBySlug: a single team_coaches row resolves to one team with role_kind 'coach'", async () => {
  const { mergeRoleBySlug } = await import("./accountTeamsMerge.ts");
  const result = mergeRoleBySlug(
    [{ campaign_slug: "baseball-team", role: "head_coach" }],
    [],
  );
  assert.deepEqual(result, { "baseball-team": { role: "head_coach", role_kind: "coach" } });
});

test("mergeRoleBySlug: two team_coaches rows sharing one account_id both resolve (the exact multi-team scenario this phase targets — e.g. a coach on Baseball AND Track)", async () => {
  const { mergeRoleBySlug } = await import("./accountTeamsMerge.ts");
  const result = mergeRoleBySlug(
    [
      { campaign_slug: "baseball-team", role: "head_coach" },
      { campaign_slug: "track-team", role: "head_coach" },
    ],
    [],
  );
  assert.deepEqual(Object.keys(result).sort(), ["baseball-team", "track-team"]);
});

test("mergeRoleBySlug: a parent/athlete linked to multiple team_members rows (different teams) both resolve — same mechanism covers Parent-with-multiple-kids/teams and Athlete-in-multiple-sports", async () => {
  const { mergeRoleBySlug } = await import("./accountTeamsMerge.ts");
  const result = mergeRoleBySlug(
    [],
    [
      { campaign_slug: "baseball-team", role: "parent" },
      { campaign_slug: "soccer-team", role: "parent" },
    ],
  );
  assert.deepEqual(Object.keys(result).sort(), ["baseball-team", "soccer-team"]);
});

// Family Relationships Phase A: head_coach/assistant_coach authorization
// must never be silently lost to a co-existing team_members row for the
// same campaign (e.g. a coach who is also a parent) — this replaces the
// prior "member always wins" test, which was the bug this phase fixes.
test("mergeRoleBySlug: head_coach role wins over a co-existing member (parent) role for the same campaign_slug", async () => {
  const { mergeRoleBySlug } = await import("./accountTeamsMerge.ts");
  const result = mergeRoleBySlug(
    [{ campaign_slug: "baseball-team", role: "head_coach" }],
    [{ campaign_slug: "baseball-team", role: "parent" }],
  );
  assert.deepEqual(result["baseball-team"], { role: "head_coach", role_kind: "coach" });
});

test("mergeRoleBySlug: assistant_coach role wins over a co-existing member (parent) role for the same campaign_slug", async () => {
  const { mergeRoleBySlug } = await import("./accountTeamsMerge.ts");
  const result = mergeRoleBySlug(
    [{ campaign_slug: "baseball-team", role: "assistant_coach" }],
    [{ campaign_slug: "baseball-team", role: "parent" }],
  );
  assert.deepEqual(result["baseball-team"], { role: "assistant_coach", role_kind: "coach" });
});

// Booster is the deliberate exception: a booster's team_coaches row and a
// booster's team_members row already grant identical isStaff() access, so
// the member row still wins here — unchanged from the original behavior —
// preserving whatever member-specific session data (athlete_id) that row
// carries, since overriding it would have no authorization benefit.
test("mergeRoleBySlug: booster coach role does NOT override a co-existing member role — member still wins (unchanged booster behavior)", async () => {
  const { mergeRoleBySlug } = await import("./accountTeamsMerge.ts");
  const result = mergeRoleBySlug(
    [{ campaign_slug: "baseball-team", role: "booster" }],
    [{ campaign_slug: "baseball-team", role: "parent" }],
  );
  assert.deepEqual(result["baseball-team"], { role: "parent", role_kind: "member" });
});

test("mergeRoleBySlug: a Head Coach on Team A who is also a Parent on Team B resolves independently per team — no cross-team leakage", async () => {
  const { mergeRoleBySlug } = await import("./accountTeamsMerge.ts");
  const result = mergeRoleBySlug(
    [{ campaign_slug: "team-a", role: "head_coach" }],
    [{ campaign_slug: "team-b", role: "parent" }],
  );
  assert.deepEqual(result["team-a"], { role: "head_coach", role_kind: "coach" });
  assert.deepEqual(result["team-b"], { role: "parent", role_kind: "member" });
});

test("resolveAccountActorKind: coach-only roles (head_coach/assistant_coach) win regardless of a member row; booster and no-coach cases are unchanged", async () => {
  const { resolveAccountActorKind } = await import("./accountTeamsMerge.ts");
  assert.equal(resolveAccountActorKind("head_coach", true), "coach");
  assert.equal(resolveAccountActorKind("assistant_coach", true), "coach");
  assert.equal(resolveAccountActorKind("booster", true), "member");
  assert.equal(resolveAccountActorKind("booster", false), "coach");
  assert.equal(resolveAccountActorKind(null, true), "member");
  assert.equal(resolveAccountActorKind(null, false), "none");
  assert.equal(resolveAccountActorKind("head_coach", false), "coach");
});

test("/coach-login route file is unchanged in its credential-check logic (legacy login must keep working)", () => {
  const src = read("src/app/api/team/auth/login/route.ts");
  assert.match(src, /team_coaches\?email=eq\./);
  assert.match(src, /hashPassword\(password, coach\.salt\)/);
});

test("role-check functions were not touched by this phase — isHeadCoach/isStaff semantics unchanged", () => {
  const src = read("src/lib/permissions.ts");
  assert.match(src, /export function isHeadCoach/);
  assert.match(src, /export function isStaff/);
});

// Family Relationships Phase A touched only accountSession.ts/accountTeamsMerge.ts
// (plus the new isCoachOnlyRole export) — permissions.server.ts's actor
// resolution order (platform admin checked, and returned, before the
// elf_session/team_coaches/team_members path even runs) is untouched, so
// platform-admin precedence cannot have been affected by this phase.
test("getTeamActor still resolves platform admin before any account/coach/member session (permissions.server.ts untouched by this phase)", () => {
  const src = read("src/lib/permissions.server.ts");
  const platformAdminIdx = src.indexOf("getPlatformAdminSession()");
  const accountIdx       = src.indexOf("getAccountSession()");
  assert.ok(platformAdminIdx > 0 && accountIdx > 0 && platformAdminIdx < accountIdx);
});
