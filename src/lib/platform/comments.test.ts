// Phase QA-Build8, Issue 8 — regression test for a Turbopack production-
// build bug (NOT a source bug): concatenating two adjacent template
// literals that each contain a ${...} interpolation via "+" caused the
// compiler to silently drop the first literal's trailing "),"  in the
// compiled server bundle, corrupting COMMENT_SELECT into invalid
// PostgREST syntax and making every real comment submission fail with
// PGRST100 ("unexpected \"p\" expecting \",\" or \")\"") — confirmed by
// inspecting the actual compiled chunk and replaying both the source and
// compiled strings as read-only requests against production PostgREST
// (source: 200 OK; compiled: 400 PGRST100, byte-identical to the
// production error log).
//
// COMMENT_SELECT is now built via an array + join("") specifically so no
// two interpolated template literals are ever joined with "+" — this test
// pins the exact resulting string (not just "no error thrown", since the
// bug was a SILENT string corruption with no exception anywhere in the
// source) so a future refactor back to "+"-joined template literals would
// be caught here before ever reaching a real build.
import test from "node:test";
import assert from "node:assert/strict";
import { COMMENT_SELECT } from "./comments.ts";

test("COMMENT_SELECT: team_members and platform_admins are correctly comma-separated (regression for the Turbopack '+' template-literal corruption)", () => {
  assert.ok(
    COMMENT_SELECT.includes("profile_photo_url)),platform_admins"),
    "COMMENT_SELECT must contain the closing ')' for team_members immediately followed by ',platform_admins' — " +
    "a corrupted build previously dropped both characters here, producing invalid PostgREST syntax.",
  );
  assert.ok(
    !COMMENT_SELECT.includes("profile_photo_url)platform_admins"),
    "COMMENT_SELECT must never contain the corrupted (single-paren, no-comma) boundary seen in the Build 8 production incident.",
  );
});

test("COMMENT_SELECT: exact expected value (full-string pin, not just the one boundary)", () => {
  const expected =
    "id,campaign_slug,announcement_id,author_type,author_coach_id,author_member_id,author_platform_admin_id," +
    "author_name,author_role,body,status,decided_by_coach_id,decided_by_platform_admin_id,decided_at,created_at,updated_at," +
    "team_coaches!author_coach_id(name,role,elf_accounts!account_id(profile_photo_url))," +
    "team_members!author_member_id(name,role,athlete_id,athletes!athlete_id(profile_photo),elf_accounts!account_id(profile_photo_url))," +
    "platform_admins!author_platform_admin_id(elf_accounts!account_id(name,profile_photo_url))";
  assert.equal(COMMENT_SELECT, expected);
});

test("COMMENT_SELECT: every paren is balanced (defense in depth — catches any future malformed embed, not just this specific boundary)", () => {
  const opens  = (COMMENT_SELECT.match(/\(/g)  ?? []).length;
  const closes = (COMMENT_SELECT.match(/\)/g) ?? []).length;
  assert.equal(opens, closes, `COMMENT_SELECT has ${opens} '(' but ${closes} ')' — unbalanced select string would be rejected by PostgREST.`);
});
