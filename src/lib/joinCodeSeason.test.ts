// Complete Season Phase 5D — a completed season's join code can never admit
// anyone. Completing a season revokes its code in the same transaction
// (phase_s1 G17) and the database refuses to un-revoke it (phase_s2 P24);
// these checks pin the app side: every place that turns a typed or scanned
// code into a team only looks at codes that are NOT revoked, a code is only
// ever good for its own team, and every route that joins someone also
// refuses a completed season (409) before any work is done.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const JOIN_ROUTES = [
  "src/app/api/auth/join/route.ts",
  "src/app/api/auth/join-request/route.ts",
  "src/app/api/team/[slug]/join/route.ts",
];

test("every code lookup ignores revoked codes", () => {
  for (const f of [...JOIN_ROUTES, "src/lib/teamData.ts"]) {
    const lookups = [...read(f).matchAll(/team_join_codes\?([^`]*)`/g)].map(m => m[1]);
    assert.ok(lookups.length > 0, `${f}: has a join-code lookup`);
    for (const q of lookups) assert.match(q, /revoked=eq\.false/, `${f}: ${q}`);
  }
});

test("every join route refuses a completed season before joining anyone", () => {
  for (const f of JOIN_ROUTES) {
    const src = read(f);
    const guard = src.indexOf("await seasonWriteBlocked(");
    assert.ok(guard > 0, `${f}: calls seasonWriteBlocked`);
    for (const w of ["createAccount", "addMember", "createJoinRequest", "rest/v1/team_members"]) {
      const i = src.indexOf(w);
      if (i > 0) assert.ok(guard < i, `${f}: season check runs before ${w}`);
    }
  }
});

test("the team-scoped join route only accepts that team's own code", () => {
  assert.match(read("src/app/api/team/[slug]/join/route.ts"),
    /team_join_codes\?code=eq\.\$\{encodeURIComponent\(upperCode\)\}&campaign_slug=eq\.\$\{encodeURIComponent\(slug\)\}&revoked=eq\.false/);
});

test("code-only routes join the team the code belongs to (never one named by the client)", () => {
  for (const f of ["src/app/api/auth/join/route.ts", "src/app/api/auth/join-request/route.ts"]) {
    const src = read(f);
    assert.match(src, /const campaign_slug = joinCode\.campaign_slug as string;/, f);
    assert.doesNotMatch(src, /body\.campaign_slug|campaign_slug\s*[,}]\s*=\s*body/, f);
  }
});

test("QR links and manual entry share one resolver that also refuses archived teams", () => {
  const td = read("src/lib/teamData.ts");
  assert.match(td, /if \(settings\.archived\) return \{ status: "archived" \};/);
  assert.match(read("src/app/api/auth/validate-code/route.ts"), /resolveJoinCode\(code\)/);
  assert.match(read("src/app/join/[code]/page.tsx"), /resolveJoinCode\(/);
});

test("completing a season revokes its code and issues a new one for the next season", () => {
  const sql = read("supabase/migrations/phase_s1_complete_season.sql");
  assert.match(sql, /UPDATE public\.team_join_codes SET revoked = true WHERE campaign_slug = p_from_slug AND NOT revoked;/);
  assert.match(sql, /INSERT INTO public\.team_join_codes \(campaign_slug, code\) VALUES \(v_to, v_join_code\);/);
  assert.match(sql, /SET archived = true, season_completed_at = v_now, successor_campaign_slug = v_to/);
});
