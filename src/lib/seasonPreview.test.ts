// Complete Season Phase 3 — preview library rules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const {
  isSeasonPreviewEnabled, canPreviewSeason, seasonPreviewDbActor, parsePreviewOverrides, classifyPreviewError,
} = await import("./seasonPreview.ts");

const coach = (role: string, id = "c1") => ({ kind: "coach", session: { id, role, name: "C", campaign_slug: "t" } }) as never;
const member = (role: string) => ({ kind: "member", session: { id: "m1", role, name: "M", campaign_slug: "t" } }) as never;
const admin = { kind: "platform_admin", session: { platformAdminId: "pa-1", accountId: "a", name: "A", email: "e", campaign_slug: "t" } } as never;
const pub = { kind: "public" } as never;

test("feature flag: on only for exactly COMPLETE_SEASON_PREVIEW=true (off by default)", () => {
  assert.equal(isSeasonPreviewEnabled({}), false);
  assert.equal(isSeasonPreviewEnabled({ COMPLETE_SEASON_PREVIEW: "true" }), true);
  for (const v of ["false", "TRUE", "1", "yes", " true", ""]) assert.equal(isSeasonPreviewEnabled({ COMPLETE_SEASON_PREVIEW: v }), false, v);
  assert.equal(isSeasonPreviewEnabled({ NEXT_PUBLIC_COMPLETE_SEASON_PREVIEW: "true" }), false, "never a public (client) variable");
});

test("who may preview: Head Coach and platform admin only", () => {
  assert.equal(canPreviewSeason(coach("head_coach")), true);
  assert.equal(canPreviewSeason(admin), true);
  for (const a of [coach("assistant_coach"), coach("booster"), member("athlete"), member("parent"), member("booster"), pub]) {
    assert.equal(canPreviewSeason(a), false);
  }
});

test("the database actor comes from the session and is null for anyone else", () => {
  assert.deepEqual(seasonPreviewDbActor(coach("head_coach", "coach-7")), { coach_id: "coach-7" });
  assert.deepEqual(seasonPreviewDbActor(admin), { platform_admin_id: "pa-1" });
  for (const a of [coach("assistant_coach"), coach("booster"), member("parent"), pub, coach("head_coach", "")]) {
    assert.equal(seasonPreviewDbActor(a), null);
  }
});

test("overrides: optional, validated, never identity", () => {
  const ok = (q: string) => parsePreviewOverrides(new URLSearchParams(q));
  assert.deepEqual(ok(""), { ok: true, overrides: { toSlug: null, toSeasonLabel: null } });
  assert.deepEqual(ok("next_slug=%20lions-2028%20&next_label=%2027-28%20Season%20"), { ok: true, overrides: { toSlug: "lions-2028", toSeasonLabel: "27-28 Season" } });
  for (const q of ["next_slug=Lions-2028", "next_slug=ab", "next_slug=-ab", `next_slug=${"a".repeat(81)}`, "next_slug=a%20b", `next_label=${"x".repeat(41)}`]) {
    assert.equal(ok(q).ok, false, q);
  }
});

test("errors: missing migration, missing grant, actor refusals and anything else", () => {
  const e = (code: string, message = "") => JSON.stringify({ code, message });
  assert.equal(classifyPreviewError(e("PGRST202", "Could not find the function")), "not_installed");
  assert.equal(classifyPreviewError(e("42883")), "not_installed");
  assert.equal(classifyPreviewError(e("42501", "permission denied for function team_season_preview")), "not_permitted");
  assert.equal(classifyPreviewError(e("P0001", "season_actor_account_required")), "account_required");
  assert.equal(classifyPreviewError(e("P0001", "season_actor_not_authorized")), "forbidden");
  assert.equal(classifyPreviewError(e("P0001", "season_actor_invalid")), "forbidden");
  assert.equal(classifyPreviewError(e("P0001", "season_team_not_found")), "not_found");
  assert.equal(classifyPreviewError(e("P0001", "other")), "error");
  assert.equal(classifyPreviewError("<html>"), "error");
});

test("the preview type matches what team_season_preview() returns (top-level keys)", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/phase_s1_complete_season.sql"), "utf8");
  const ret = sql.slice(sql.indexOf("  RETURN jsonb_build_object(\n    'from'".replace(/\n/g, sql.includes("\r\n") ? "\r\n" : "\n")));
  for (const k of ["from", "proposed", "actor", "roster", "members", "coaches", "calendar", "copied", "left_in_history", "open_items", "blockers", "warnings", "fingerprint"]) {
    assert.match(ret, new RegExp(`'${k}'`), k);
  }
  const lib = readFileSync(join(process.cwd(), "src/lib/seasonPreview.ts"), "utf8");
  for (const k of ["freshman_to_sophomore", "sophomore_to_junior", "junior_to_senior", "unchanged_middle_school", "must_rejoin",
                   "parent_links_carried", "future_events_to_copy", "donations_last_24h", "pending_staff_invitations", "team_sponsors"]) {
    assert.ok(lib.includes(k) && sql.includes(`'${k}'`), k);
  }
});
