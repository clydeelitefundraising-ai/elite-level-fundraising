// Platform Admin dashboard redesign — the display model: limits, ordering,
// failure vs genuine empty, and which fields may reach the page.
import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_LIMIT, ATTENTION_ITEM_LIMIT, activityKind, attentionToShow, buildActivity, buildInquiryGroup,
  buildModerationGroup, buildSchoolsGroup, relativeAge, teamLabel,
} from "./adminDashboardView.ts";

const NOW = new Date("2026-11-03T20:00:00Z");
const ago = (mins: number) => new Date(NOW.getTime() - mins * 60000).toISOString();
const TEAMS = { "lions-2027": { school_name: "QA Lions High School", sport_name: "Track", season: "2027" } };

const report = (id: string, mins: number, extra: Record<string, unknown> = {}) => ({
  id, campaign_slug: "lions-2027", target_type: "message", reason: "harassment", status: "open", created_at: ago(mins),
  reporter_name: "Pat Parent", reporter_id: "acct-1", details: "SECRET report text", resolution_note: "SECRET note", ...extra,
});

test("relative age: minutes, hours, days, then a date", () => {
  assert.equal(relativeAge(ago(0), NOW), "just now");
  assert.equal(relativeAge(ago(5), NOW), "5m ago");
  assert.equal(relativeAge(ago(125), NOW), "2h ago");
  assert.equal(relativeAge(ago(60 * 24 * 3), NOW), "3d ago");
  assert.equal(relativeAge("2026-08-01T00:00:00Z", NOW), "Aug 1");
  assert.equal(relativeAge("not a date", NOW), "");
});

test("team label: school + sport, else whichever exists, else the slug", () => {
  assert.equal(teamLabel("lions-2027", TEAMS["lions-2027"]), "QA Lions High School Track");
  assert.equal(teamLabel("x", { school_name: "Only School", sport_name: null, season: null }), "Only School");
  assert.equal(teamLabel("x", undefined), "x");
});

test("moderation: newest open reports first, at most three, reason/type/team/age only", () => {
  const rows = [report("a", 300), report("b", 10), report("c", 60), report("d", 5), report("e", 1, { status: "dismissed" })];
  const g = buildModerationGroup(4, rows, TEAMS, NOW);
  assert.equal(g.state, "loaded");
  assert.equal(g.headline, "4 open reports");
  assert.equal(g.lines.length, ATTENTION_ITEM_LIMIT);
  assert.deepEqual(g.lines[0], { text: "Harassment · message", meta: "QA Lions High School Track · 5m ago" });
  const shown = JSON.stringify(g);
  for (const secret of ["Pat Parent", "acct-1", "SECRET"]) assert.ok(!shown.includes(secret), `leaked ${secret}`);
});

test("moderation: count 0 is a genuine empty; a failed count or a count without rows is a failure", () => {
  assert.equal(buildModerationGroup(0, [], TEAMS, NOW).state, "empty");
  const failed = buildModerationGroup(null, [], TEAMS, NOW);
  assert.equal(failed.state, "failed");
  assert.equal(failed.headline, "Couldn't load moderation reports");
  const partial = buildModerationGroup(2, [], TEAMS, NOW);
  assert.equal(partial.state, "failed");
  assert.equal(partial.headline, "2 open reports — details couldn't load");
  assert.deepEqual(partial.lines, []);
});

test("inquiries: only new ones, newest first, team + requester role + age", () => {
  const rows = [
    { id: "1", campaign_slug: "lions-2027", requested_by_role: "head_coach", status: "new", created_at: ago(90), requested_by_account_id: "coach-1" },
    { id: "2", campaign_slug: "unknown-2027", requested_by_role: "assistant_coach", status: "new", created_at: ago(30), requested_by_account_id: "coach-2" },
    { id: "3", campaign_slug: "lions-2027", requested_by_role: "head_coach", status: "resolved", created_at: ago(1), requested_by_account_id: "coach-3" },
  ];
  const g = buildInquiryGroup(2, rows, TEAMS, NOW);
  assert.equal(g.state, "loaded");
  assert.equal(g.headline, "2 new inquiries");
  assert.deepEqual(g.lines, [
    { text: "unknown-2027", meta: "Assistant coach · 30m ago" },
    { text: "QA Lions High School Track", meta: "Head coach · 1h ago" },
  ]);
  assert.ok(!JSON.stringify(g).includes("coach-1"));
  assert.equal(buildInquiryGroup(1, [rows[0]], TEAMS, NOW).headline, "1 new inquiry");
  assert.equal(buildInquiryGroup(0, [], TEAMS, NOW).state, "empty");
  assert.equal(buildInquiryGroup(null, [], TEAMS, NOW).headline, "Couldn't load fundraising inquiries");
});

test("schools: team-seasons without a school, or a failure — never a guess", () => {
  const g = buildSchoolsGroup([{ organization_id: null }, { organization_id: "o1" }, { organization_id: null }]);
  assert.deepEqual([g.state, g.count, g.headline, g.href], ["loaded", 2, "2 team-seasons without a school", "/platform-admin/school-links"]);
  assert.equal(buildSchoolsGroup([{ organization_id: null }]).headline, "1 team-season without a school");
  assert.equal(buildSchoolsGroup([{ organization_id: "o1" }]).state, "empty");
  assert.deepEqual([buildSchoolsGroup(null).state, buildSchoolsGroup(null).headline], ["failed", "Couldn't load school links"]);
});

test("needs attention shows failures and waiting work, hides genuine empties", () => {
  const groups = [
    buildModerationGroup(0, [], TEAMS, NOW),
    buildInquiryGroup(null, [], TEAMS, NOW),
    buildSchoolsGroup([{ organization_id: null }]),
  ];
  assert.deepEqual(attentionToShow(groups).map(g => g.id), ["inquiries", "schools"]);
  assert.deepEqual(attentionToShow([buildModerationGroup(0, [], TEAMS, NOW), buildSchoolsGroup([])]), []);
});

test("recent activity: newest six, summary + role-level actor + age, no email addresses", () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({
    id: `a${i}`, action: "organization.update", summary: i === 0 ? "" : `Change ${i}`,
    actor_type: i % 2 ? "platform_admin" : "admin_tool", actor_email: "pat@elf.test", admin_identifier: "pat@elf.test", created_at: ago(i * 10),
  }));
  const a = buildActivity(rows, NOW);
  assert.equal(a.state, "loaded");
  assert.equal(a.items.length, ACTIVITY_LIMIT);
  assert.deepEqual(a.items[0], { id: "a0", kind: "organization", icon: "▣", text: "organization.update", actor: "Admin tool", age: "just now", at: ago(0) });
  assert.deepEqual(a.items[1], { id: "a1", kind: "organization", icon: "▣", text: "Change 1", actor: "Platform Admin", age: "10m ago", at: ago(10) });
  assert.ok(!JSON.stringify(a).includes("pat@elf.test"));
  assert.equal(buildActivity([{ id: "x", action: "a", summary: "y".repeat(400), created_at: ago(1) }], NOW).items[0].text.length, 160);
  assert.deepEqual(buildActivity([], NOW), { state: "empty", items: [] });
  assert.deepEqual(buildActivity(null, NOW), { state: "failed", items: [] });
});

test("activity icons: a decorative category from the action prefix, with a neutral fallback", () => {
  assert.deepEqual(activityKind("school_link.set"), { kind: "school", icon: "⇄" });
  assert.deepEqual(activityKind("organization.update"), { kind: "organization", icon: "▣" });
  assert.deepEqual(activityKind("sponsor_package.created"), { kind: "partner", icon: "◇" });
  assert.deepEqual(activityKind("community_partner.updated"), { kind: "partner", icon: "◇" });
  assert.deepEqual(activityKind("campaign.created"), { kind: "campaign", icon: "◫" });
  assert.deepEqual(activityKind("coach.password_reset"), { kind: "people", icon: "◉" });
  assert.deepEqual(activityKind("communication_template.updated"), { kind: "message", icon: "✉" });
  assert.deepEqual(activityKind("export.roster"), { kind: "export", icon: "⇩" });
  assert.deepEqual(activityKind("something.else"), { kind: "other", icon: "•" });
  assert.deepEqual(activityKind(""), { kind: "other", icon: "•" });
});
