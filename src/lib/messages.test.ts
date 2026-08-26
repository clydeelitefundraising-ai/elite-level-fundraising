import test from "node:test";
import assert from "node:assert/strict";
import { resolvePhotoUrl } from "./messages.ts";

// Phase A30: platform admin is a third source resolvePhotoUrl can draw
// from (via platform_admins.account_id -> elf_accounts), alongside the
// existing coach/member elf_accounts joins and the athlete-specific
// athletes.profile_photo override. Locks in the precedence order across
// all three real actor kinds so a future edit can't silently drop one.

test("resolvePhotoUrl: athlete's own athletes.profile_photo wins over any elf_accounts photo", () => {
  const url = resolvePhotoUrl(
    null,
    { name: "A", role: "athlete", athlete_id: "ath1", athletes: { profile_photo: "athlete.jpg" }, elf_accounts: { profile_photo_url: "account.jpg" } },
    null,
  );
  assert.equal(url, "athlete.jpg");
});

test("resolvePhotoUrl: coach falls back to elf_accounts.profile_photo_url", () => {
  const url = resolvePhotoUrl(
    { name: "Coach", role: "head_coach", elf_accounts: { profile_photo_url: "coach.jpg" } },
    null,
    null,
  );
  assert.equal(url, "coach.jpg");
});

test("resolvePhotoUrl: member (non-athlete, e.g. parent/booster) falls back to elf_accounts.profile_photo_url", () => {
  const url = resolvePhotoUrl(
    null,
    { name: "Parent", role: "parent", athlete_id: null, athletes: null, elf_accounts: { profile_photo_url: "parent.jpg" } },
    null,
  );
  assert.equal(url, "parent.jpg");
});

test("resolvePhotoUrl: platform admin resolves via its own elf_accounts join when coach/member are both absent", () => {
  const url = resolvePhotoUrl(null, null, { elf_accounts: { name: "ELF Employee", profile_photo_url: "admin.jpg" } });
  assert.equal(url, "admin.jpg");
});

test("resolvePhotoUrl: null when no actor has a resolvable photo at all", () => {
  assert.equal(resolvePhotoUrl(null, null, null), null);
  assert.equal(resolvePhotoUrl(null, null, { elf_accounts: null }), null);
});
