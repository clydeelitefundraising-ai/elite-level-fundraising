import test from "node:test";
import assert from "node:assert/strict";
import { buildDesktopNavItems, isDesktopNavItemActive } from "./desktopNavItems.ts";

const BASE_PARAMS = {
  showSponsors: false,
  showRequests: false,
  communicationsBadge: 0,
  messagesBadge: 0,
  pendingRequestCount: 0,
};

test("buildDesktopNavItems: always includes the core destinations regardless of permission flags", () => {
  const items = buildDesktopNavItems(BASE_PARAMS);
  const keys = items.map(i => i.key);
  assert.deepEqual(keys, ["home", "team", "calendar", "communications", "messages", "fundraiser", "settings"]);
});

test("buildDesktopNavItems: Sponsors is included only when showSponsors is true", () => {
  const without = buildDesktopNavItems(BASE_PARAMS);
  assert.equal(without.some(i => i.key === "sponsors"), false);

  const withSponsors = buildDesktopNavItems({ ...BASE_PARAMS, showSponsors: true });
  assert.equal(withSponsors.some(i => i.key === "sponsors"), true);
});

test("buildDesktopNavItems: Requests is included only when showRequests is true (Head-Coach-only, incl. Platform Admin)", () => {
  // showRequests is computed by the caller (layout.tsx) from the existing,
  // already-unit-tested isHeadCoach() helper, which treats a platform
  // admin as head-coach-equivalent (see permissions.test.ts) — this test
  // only verifies that whatever boolean the caller passes correctly gates
  // the item, not the permission logic itself, which lives elsewhere.
  const without = buildDesktopNavItems(BASE_PARAMS);
  assert.equal(without.some(i => i.key === "requests"), false);

  const withRequests = buildDesktopNavItems({ ...BASE_PARAMS, showRequests: true, pendingRequestCount: 4 });
  const requestsItem = withRequests.find(i => i.key === "requests");
  assert.ok(requestsItem);
  assert.equal(requestsItem?.badge, 4);
});

test("buildDesktopNavItems: Settings is always last, after any conditional items", () => {
  const items = buildDesktopNavItems({ ...BASE_PARAMS, showSponsors: true, showRequests: true });
  assert.equal(items[items.length - 1].key, "settings");
});

test("buildDesktopNavItems: badge numbers are wired to the correct items, never mixed up", () => {
  const items = buildDesktopNavItems({
    ...BASE_PARAMS,
    communicationsBadge: 2,
    messagesBadge: 5,
    showRequests: true,
    pendingRequestCount: 1,
  });
  const byKey = Object.fromEntries(items.map(i => [i.key, i.badge]));
  assert.equal(byKey.communications, 2);
  assert.equal(byKey.messages, 5);
  assert.equal(byKey.requests, 1);
  assert.equal(byKey.home, undefined);
});

// D2a: the Fundraising nav item's badge was removed — it used to show
// donationStats.donor_count (an all-time donation-record count), which
// misused the same red "attention" visual language as Communications/
// Requests/Messages despite never being an unread/pending signal. The
// number itself still appears as plain text on the Coach Dashboard and
// Fundraising page — only the nav badge is gone.
test("buildDesktopNavItems: Fundraising nav item never has a badge, regardless of other counts", () => {
  const items = buildDesktopNavItems({
    ...BASE_PARAMS,
    communicationsBadge: 2,
    messagesBadge: 5,
    showRequests: true,
    pendingRequestCount: 1,
  });
  const fundraiser = items.find(i => i.key === "fundraiser");
  assert.ok(fundraiser);
  assert.equal(fundraiser?.badge, undefined);
});

// ─── isDesktopNavItemActive ─────────────────────────────────────────────────

test("isDesktopNavItemActive: exact route match is active", () => {
  assert.equal(isDesktopNavItemActive("/team/wildcats-2026/home", "wildcats-2026", "home"), true);
});

test("isDesktopNavItemActive: a nested Team route (/team/[slug]/team/[id]) marks Team active", () => {
  assert.equal(isDesktopNavItemActive("/team/wildcats-2026/team/athlete-123", "wildcats-2026", "team"), true);
});

test("isDesktopNavItemActive: a nested Messages thread route marks Messages active", () => {
  assert.equal(isDesktopNavItemActive("/team/wildcats-2026/messages/thread-1", "wildcats-2026", "messages"), true);
});

test("isDesktopNavItemActive: the attachment viewer nested under Messages marks Messages active", () => {
  assert.equal(
    isDesktopNavItemActive("/team/wildcats-2026/messages/attachments/att-1/view", "wildcats-2026", "messages"),
    true,
  );
});

test("isDesktopNavItemActive: an unrelated route is not active", () => {
  assert.equal(isDesktopNavItemActive("/team/wildcats-2026/calendar", "wildcats-2026", "messages"), false);
});

test("isDesktopNavItemActive: a route for a DIFFERENT team's slug never matches", () => {
  assert.equal(isDesktopNavItemActive("/team/other-team/home", "wildcats-2026", "home"), false);
});

test("isDesktopNavItemActive: a route sharing a PREFIX but not a real path segment never false-positives", () => {
  // "/team/[slug]/teamwork" must not be considered a nested route under
  // "team" just because the string "team" is a prefix of "teamwork" — the
  // trailing "/" check in isDesktopNavItemActive is what prevents this.
  assert.equal(isDesktopNavItemActive("/team/wildcats-2026/teamwork", "wildcats-2026", "team"), false);
});
