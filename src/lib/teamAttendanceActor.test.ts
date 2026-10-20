// Team Management Phase 5 — the attendance actor comes only from the
// server-resolved session, never from the request.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { attendanceDbActor, canEditAttendance } from "./teamAttendanceActor.ts";
import { isCoachOnly, type TeamActor } from "./permissions.ts";

const coach = (role: string, id = "coach-row-1") =>
  ({ kind: "coach", session: { id, name: "Hana Head", role, campaign_slug: "team-a" } }) as unknown as TeamActor;
const member = (role: string) =>
  ({ kind: "member", session: { id: "member-row-1", name: "Mo", role, campaign_slug: "team-a", athlete_id: null } }) as unknown as TeamActor;
const admin = { kind: "platform_admin", session: { platformAdminId: "pa-1", accountId: "acct-4", name: "Ada", email: "a@x", campaign_slug: "team-a" } } as TeamActor;
const publicActor = { kind: "public" } as TeamActor;

test("Head and Assistant Coaches -> their team_coaches id; platform admin -> their platform_admins id", () => {
  assert.deepEqual(attendanceDbActor(coach("head_coach")), { coach_id: "coach-row-1" });
  assert.deepEqual(attendanceDbActor(coach("assistant_coach")), { coach_id: "coach-row-1" });
  assert.deepEqual(attendanceDbActor(admin), { platform_admin_id: "pa-1" });
});

test("boosters (either table), athletes, parents and signed-out visitors get no database identity", () => {
  for (const actor of [coach("booster"), member("booster"), member("athlete"), member("parent"), publicActor, coach("unknown_role")]) {
    assert.equal(attendanceDbActor(actor), null, JSON.stringify(actor));
    assert.equal(canEditAttendance(actor), false);
  }
});

test("matches the existing coach-only permission exactly (isCoachOnly)", () => {
  for (const actor of [coach("head_coach"), coach("assistant_coach"), coach("booster"), member("booster"), member("athlete"), member("parent"), admin, publicActor]) {
    assert.equal(canEditAttendance(actor), isCoachOnly(actor), JSON.stringify(actor));
  }
});

test("only the two session ids are used; injected fields can't add or change an identity", () => {
  const tampered = {
    kind: "coach",
    session: {
      id: "coach-row-1", name: "X", role: "assistant_coach", campaign_slug: "team-a",
      coach_id: "victim-coach", platform_admin_id: "victim-admin", account_id: "victim-acct",
    },
    coach_id: "victim-coach",
    platform_admin_id: "victim-admin",
  } as unknown as TeamActor;
  const out = attendanceDbActor(tampered);
  assert.deepEqual(out, { coach_id: "coach-row-1" });
  assert.deepEqual(Object.keys(out!), ["coach_id"]);

  const adminTampered = { ...admin, session: { ...admin.session, coach_id: "victim-coach" } } as unknown as TeamActor;
  assert.deepEqual(attendanceDbActor(adminTampered), { platform_admin_id: "pa-1" });
  // A fresh object every time: callers can't mutate the actor through it.
  assert.notEqual(attendanceDbActor(coach("head_coach")), attendanceDbActor(coach("head_coach")));
});

test("missing or non-string ids give no identity (never an empty or forged one)", () => {
  assert.equal(attendanceDbActor(coach("head_coach", "")), null);
  assert.equal(attendanceDbActor(coach("head_coach", 42 as unknown as string)), null);
  assert.equal(attendanceDbActor({ kind: "platform_admin", session: { ...admin.session, platformAdminId: "" } } as TeamActor), null);
});

// ── Codebase tripwire ────────────────────────────────────────────────────
// Applies from Phase 5-3 on: anything that calls the save function or
// lives under an attendance API route must take the actor from
// getTeamActor() via attendanceDbActor(), and must never read an identity
// out of the request.
const SRC = fileURLToPath(new URL("..", import.meta.url));
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}
// p is relative to src/ (the checkout folder's own name must not matter).
const files = walk(SRC).map(abs => ({ p: relative(SRC, abs), code: readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "") }));

const attendanceFiles = files.filter(f => /attendance/i.test(f.p) || /team_attendance_/.test(f.code));

test("tripwire: only attendanceDbActor() builds the database actor", () => {
  for (const { p, code } of attendanceFiles) {
    if (p.endsWith(join("lib", "teamAttendanceActor.ts"))) continue;
    // No identity fields anywhere in attendance code outside this module —
    // not built, not read, not typed (attendanceDbActor() is the only source).
    assert.doesNotMatch(code, /\b(coach_id|platform_admin_id|coachId|platformAdminId)\b/, `${p} handles an identity field; use attendanceDbActor()`);
    if (/team_attendance_save_draft/.test(code)) {
      assert.match(code, /attendanceDbActor\(/, `${p} calls the save function without attendanceDbActor()`);
    }
  }
});

test("tripwire: attendance API routes resolve the actor on the server and never read one from the request", () => {
  const routes = files.filter(f => /[\\/]api[\\/]team[\\/]\[slug\][\\/]attendance[\\/]/.test(f.p));
  for (const { p, code } of routes) {
    if (/export async function (POST|PUT|PATCH|DELETE)\b/.test(code)) {
      assert.match(code, /getTeamActor\(slug\)/, `${p} must resolve the actor with getTeamActor(slug)`);
    }
    assert.doesNotMatch(code, /\b(body|json|payload|input)\??\.(coach_id|coachId|platform_admin_id|platformAdminId|actor|p_actor|account_id|accountId)\b/, p);
  }
  // No attendance routes exist before Phase 5-3; this applies to them once they do.
});
