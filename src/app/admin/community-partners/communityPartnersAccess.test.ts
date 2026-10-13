import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCommunityPartnersAdminPageState } from "./communityPartnersAccess.ts";

test("resolveCommunityPartnersAdminPageState: a missing session resolves to the sign-in-required state", () => {
  assert.equal(resolveCommunityPartnersAdminPageState(null), "sign-in-required");
});

test("resolveCommunityPartnersAdminPageState: undefined is also treated as missing (same as null)", () => {
  assert.equal(resolveCommunityPartnersAdminPageState(undefined), "sign-in-required");
});

test("resolveCommunityPartnersAdminPageState: a real platform-admin identity resolves to the management state", () => {
  const admin = { platformAdminId: "pa-1", accountId: "acct-1", name: "ELF Admin", email: "admin@elitelevelfundraising.com", role: "platform_admin" };
  assert.equal(resolveCommunityPartnersAdminPageState(admin), "management");
});

// A falsy-but-not-nullish value (e.g. an empty object from a hypothetical
// future refactor) must still resolve to "management" — this function
// only ever receives exactly what getPlatformAdminSession() returns
// (a real identity object or null), never a boolean, so it deliberately
// checks `!= null` rather than plain truthiness.
test("resolveCommunityPartnersAdminPageState: only null/undefined mean 'no session' — any object means a session exists", () => {
  assert.equal(resolveCommunityPartnersAdminPageState({}), "management");
});

// ── Relocation: the old /platform-admin surface no longer exists ─────────

test("the old /platform-admin/community-partners page/view no longer exist — no duplicate management interface remains", () => {
  assert.equal(existsSync(join(process.cwd(), "src/app/platform-admin/community-partners/page.tsx")), false);
  assert.equal(existsSync(join(process.cwd(), "src/app/platform-admin/community-partners/CommunityPartnersAdminView.tsx")), false);
});

test("the new /admin/community-partners page and view exist at their relocated path", () => {
  assert.equal(existsSync(join(process.cwd(), "src/app/admin/community-partners/page.tsx")), true);
  assert.equal(existsSync(join(process.cwd(), "src/app/admin/community-partners/CommunityPartnersAdminView.tsx")), true);
});

test("PlatformAdminHeader.tsx no longer links to the old /platform-admin/community-partners route", () => {
  const src = readFileSync(join(process.cwd(), "src/app/platform-admin/_components/PlatformAdminHeader.tsx"), "utf8");
  assert.doesNotMatch(src, /\/platform-admin\/community-partners/);
});

test("AdminShell.tsx's Relationships group includes the new ELF Community Partners nav item at its relocated path", () => {
  const src = readFileSync(join(process.cwd(), "src/app/admin/AdminShell.tsx"), "utf8");
  assert.match(src, /href:\s*"\/admin\/community-partners"/);
  assert.match(src, /ELF Community Partners/);
});
