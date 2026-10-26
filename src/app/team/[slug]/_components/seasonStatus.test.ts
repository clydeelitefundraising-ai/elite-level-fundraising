// Complete Season Phase 4 — archived (completed) season UI: the banner, hidden
// change controls, the Team Selector order/badge, the Complete Season entry,
// the fundraising countdown, the preview placeholders and the not-available
// page. Presentation only — seasonWritableCoverage.test.ts still proves every
// write route refuses a completed season on the server.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { SeasonStatusProvider, CompletedSeasonBanner, ActiveSeasonOnly } = await import("./SeasonStatus.tsx");
const { default: CoachBar } = await import("./CoachBar.tsx");
const { default: CompleteSeasonNotFound } = await import("../team/complete-season/not-found.tsx");
const { buildQuickActions } = await import("../home/coachDashboardHelpers.ts");
const { nextSeasonLabelPlaceholder, nextSlugPlaceholder } = await import("../team/complete-season/seasonPreviewText.ts");
const { completedSeasonBannerText, formatSeasonCompletedDate, isSeasonCompleted } = await import("../../../../lib/seasonState.ts");
const { activeSeasonsFirst } = await import("../../../../lib/teamOrder.ts");

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const TEAM = "src/app/team/[slug]";
const decode = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const ACTIVE = { readOnly: false, completedAt: null };
const COMPLETED = { readOnly: true, completedAt: "2026-10-22T21:51:00Z" };
const inSeason = (status: typeof ACTIVE, child: unknown) =>
  decode(renderToStaticMarkup(h(SeasonStatusProvider, { status }, child as never)));

// ── Banner ─────────────────────────────────────────────────────────────────

test("banner text uses the real completion date (Arizona time) and the approved wording", () => {
  assert.equal(
    completedSeasonBannerText("2026-10-22T21:51:00Z"),
    "This season was completed on October 22, 2026. You are viewing archived information. This season is read-only.",
  );
  // 05:30 UTC on the 23rd is still the 22nd in Arizona (UTC-7, no DST).
  assert.equal(formatSeasonCompletedDate("2026-10-23T05:30:00Z"), "October 22, 2026");
  // Missing or bad timestamps still give an honest banner, without a date.
  for (const v of [null, undefined, "", "not-a-date"]) {
    assert.equal(completedSeasonBannerText(v), "This season was completed. You are viewing archived information. This season is read-only.");
  }
});

test("the banner renders as a status message", () => {
  const html = decode(renderToStaticMarkup(h(CompletedSeasonBanner, { completedAt: COMPLETED.completedAt })));
  assert.match(html, /role="status"/);
  assert.match(html, /This season was completed on October 22, 2026\. You are viewing archived information\. This season is read-only\./);
});

test("the team layout provides the season status and shows the banner only for a completed season", () => {
  const layout = read(`${TEAM}/layout.tsx`);
  assert.match(layout, /readOnly: isSeasonCompleted\(settings\)/);
  assert.match(layout, /completedAt: settings\.season_completed_at \?\? null/);
  assert.match(layout, /<SeasonStatusProvider status=\{seasonStatus\}>/);
  assert.match(layout, /\{seasonStatus\.readOnly && <CompletedSeasonBanner completedAt=\{seasonStatus\.completedAt\} \/>\}/);
  assert.ok(isSeasonCompleted({ season_completed_at: COMPLETED.completedAt }));
  assert.ok(!isSeasonCompleted({ season_completed_at: null, successor_campaign_slug: null }));
});

// ── Change controls ────────────────────────────────────────────────────────

test("CoachBar (Post, Add Event, Upload, Add Product, Add Sponsor, Add Athlete) hides on a completed season", () => {
  const bar = h(CoachBar, { show: true, label: "Add Event", onAdd: () => {} });
  assert.match(inSeason(ACTIVE, bar), /Add Event/);
  assert.equal(inSeason(COMPLETED, bar), "");
  // Without a provider (outside /team/[slug]) behavior is unchanged.
  assert.match(decode(renderToStaticMarkup(bar)), /Add Event/);
});

test("quick actions: unchanged for an active season, none on a completed season", () => {
  const coach = { kind: "coach", session: { id: "c1", name: "Coach", role: "head_coach", campaign_slug: "t" } } as never;
  const parent = { kind: "member", session: { id: "m1", name: "P", role: "parent", campaign_slug: "t", athlete_id: null } } as never;
  assert.deepEqual(buildQuickActions("t", coach).map(a => a.key), ["post-announcement", "add-event", "send-message", "manage-team"]);
  assert.deepEqual(buildQuickActions("t", coach, { seasonReadOnly: false }).map(a => a.key), ["post-announcement", "add-event", "send-message", "manage-team"]);
  assert.deepEqual(buildQuickActions("t", parent).map(a => a.key), ["send-message", "manage-team"]);
  assert.deepEqual(buildQuickActions("t", coach, { seasonReadOnly: true }), []);
  assert.deepEqual(buildQuickActions("t", parent, { seasonReadOnly: true }), []);
});

test("every audited change control reads the season status", () => {
  // file -> what must be gated by the season status in it
  const gated: Record<string, RegExp[]> = {
    "_components/CoachBar.tsx": [/if \(!show \|\| seasonReadOnly\) return null;/],
    "home/HomeView.tsx": [/const canEdit   = isStaffViewer && !seasonReadOnly;/, /const canDelete = isHeadCoach\(actor\) && !seasonReadOnly;/, /buildQuickActions\(slug, actor, \{ seasonReadOnly \}\)/],
    "home/CoachDashboard.tsx": [/buildQuickActions\(slug, actor, \{ seasonReadOnly \}\)/, /\{!seasonReadOnly && \(\s*<Link href=\{`\/team\/\$\{slug\}\/calendar`\}/],
    "calendar/useCalendarWorkspace.ts": [/const canManage = isStaff\(actor\) && !seasonReadOnly;/],
    "team/useAthleteRoster.ts": [/const canEdit   = staffMode && !seasonReadOnly;/, /const canDelete = isHeadCoach\(actor\) && !seasonReadOnly;/],
    "team/AthleteRosterGrid.tsx": [/\{canEdit && \(\s*<div style=\{\{ display: "flex", alignItems: "center", gap: 2/, /attendanceHref && !seasonReadOnly && <TakeAttendanceLink/],
    "team/DesktopRosterTable.tsx": [/attendanceHref && !seasonReadOnly && <TakeAttendanceLink/, /\{canEdit && \(\s*<button\s*onClick=\{openAdd\}/, /\{canEdit && \(\s*<button\s*onClick=\{\(\) => \{ const a = findAthlete/],
    "team/TodoListView.tsx": [/const canManage = !!data\?\.canManage && !seasonReadOnly;/],
    "team/ClearanceView.tsx": [/const canManage = canManageResources && !seasonReadOnly;/],
    "team/TaskAcknowledgment.tsx": [/outstanding\.length > 0 && !seasonReadOnly && \(\s*<form/],
    "team/TeamStaffRosterView.tsx": [/const canManageBoosterVisibility = canManageBoosterSetting && !seasonReadOnly;/],
    "files/UpdateCard.tsx": [/\{!seasonReadOnly && <div style=\{\{ display: "flex", gap: "\.15rem", justifyContent: "flex-end" \}\}>/],
    "files/FilesView.tsx": [/const canUpload = isStaff\(actor\) && !seasonReadOnly;/, /const canDelete = isHeadCoach\(actor\) && !seasonReadOnly;/],
    "files/CommentsSection.tsx": [/\(c\.is_own \|\| canModerate\) && !seasonReadOnly/, /\{!seasonReadOnly && <div style=\{\{ display: "flex", gap: "\.4rem", alignItems: "flex-end" \}\}>/],
    "files/LikeButton.tsx": [/disabled=\{busy \|\| seasonReadOnly\}/],
    "shop/ShopView.tsx": [/const canEditShop = isCoach && !seasonReadOnly;/, /\{canEditShop && \(/, /canEdit=\{canEditShop\}/],
    "sponsors/SponsorsView.tsx": [/const canManage = isCoachOnly\(actor\) && !seasonReadOnly;/],
  };
  for (const [file, patterns] of Object.entries(gated)) {
    const src = read(`${TEAM}/${file}`);
    // Directly, or via the roster hook's seasonReadOnly/canEdit flags.
    assert.match(src, /useSeasonReadOnly|seasonReadOnly/, `${file} doesn't read the season status`);
    for (const p of patterns) assert.match(src, p, `${file}: ${p}`);
  }
});

test("history stays visible: read receipts, comment reporting, staff-only product visibility", () => {
  const card = read(`${TEAM}/files/UpdateCard.tsx`);
  assert.match(card, /<\/div>\}\n\s*<ReadReceiptPanel/, "read receipts render outside the hidden Edit/Delete row");
  const comments = read(`${TEAM}/files/CommentsSection.tsx`);
  assert.match(comments, /\{!c\.is_own && \(\s*<button\s*onClick=\{\(\) => setReportingId\(c\.id\)\}/, "reporting stays (safety is exempt from read-only)");
  const shop = read(`${TEAM}/shop/ShopView.tsx`);
  assert.match(shop, /const visibleProducts   = isCoach \? products : products\.filter\(p => p\.visible\);/);
});

test("account-level and safety actions are not gated", () => {
  for (const file of ["_components/DeleteAccountModal.tsx", "_components/ReportModal.tsx", "_components/BlockUserModal.tsx", "_components/BlockedUsersModal.tsx", "settings/NotificationPreferencesSection.tsx"]) {
    assert.doesNotMatch(read(`${TEAM}/${file}`), /useSeasonReadOnly/, `${file} must keep working on a completed season`);
  }
});

// ── Complete Season entry ──────────────────────────────────────────────────

test("the Complete Season card is hidden on a completed season; permissions unchanged", () => {
  const card = h(ActiveSeasonOnly, null, h("p", null, "Preview completing this season"));
  assert.match(inSeason(ACTIVE, card), /Preview completing this season/);
  assert.equal(inSeason(COMPLETED, card), "");
  const page = read(`${TEAM}/team/page.tsx`);
  assert.match(page, /isSeasonPreviewEnabled\(\) && canPreviewSeason\(actor\) && \(\s*<ActiveSeasonOnly><CompleteSeasonEntry slug=\{slug\} \/><\/ActiveSeasonOnly>/);
});

// ── Fundraising ────────────────────────────────────────────────────────────

test("completed seasons show 'Season completed' instead of a countdown; totals untouched", () => {
  const fr = read(`${TEAM}/fundraiser/page.tsx`);
  assert.match(fr, /const remaining  = settings\.deadline && !seasonCompleted \? daysLeft\(settings\.deadline\) : null;/);
  assert.match(fr, /\{seasonCompleted && \(\s*<div data-testid="season-completed-stat"[\s\S]*?Season completed/);
  assert.match(fr, /const daysRemaining = settings\.deadline && !isSeasonCompleted\(settings\)/);
  const an = read(`${TEAM}/analytics/page.tsx`);
  assert.match(an, /const daysRemaining = settings\.deadline && !isSeasonCompleted\(settings\)/);
});

// ── Team Selector ──────────────────────────────────────────────────────────

test("Team Selector: active seasons first, saved order kept within each group", () => {
  const teams = [
    { slug: "hawks-track-2027", done: true },
    { slug: "lions-track-2027", done: false },
    { slug: "owls-2026", done: true },
    { slug: "hawks-track-2028", done: false },
  ];
  assert.deepEqual(activeSeasonsFirst(teams, t => t.done).map(t => t.slug),
    ["lions-track-2027", "hawks-track-2028", "hawks-track-2027", "owls-2026"]);
  assert.deepEqual(activeSeasonsFirst([], () => true), []);
});

test("Team Selector reads season state separately, so its existing query is unchanged", () => {
  const src = read("src/lib/accountSession.ts");
  // The pre-existing selects are untouched (production has no season columns yet).
  assert.match(src, /const baseSelect = "campaign_slug,school_name,mascot,sport_name,primary_color,season,logo_url";/);
  assert.match(src, /select=\$\{baseSelect\},branding_customized`/);
  assert.match(src, /select=campaign_slug,season_completed_at,successor_campaign_slug`/);
  assert.match(src, /if \(!res\.ok\) return new Set\(\);/);
  assert.match(src, /return activeSeasonsFirst\(/);
  assert.match(read("src/app/teams/TeamsView.tsx"), /\{team\.season_completed && \([\s\S]*?Completed\s*<\/span>/);
  assert.match(read(`${TEAM}/_components/TeamSwitcher.tsx`), /\[team\.sport_name, team\.season\]\.filter\(Boolean\)\.join\(" · "\)/);
  assert.match(read(`${TEAM}/_components/TeamSwitcher.tsx`), /team\.season_completed && <strong[^>]*> · Completed<\/strong>/);
  assert.match(read("src/app/teams/TeamReorderList.tsx"), /\{team\.season_completed && \([\s\S]*?Completed\s*<\/div>/);
});

// ── Preview placeholders and denial ────────────────────────────────────────

test("preview placeholders never show another team's address", () => {
  assert.equal(nextSlugPlaceholder("owls-soccer-fall", null, 2027), "e.g. owls-soccer-fall-2027");
  assert.equal(nextSlugPlaceholder("lions-track-2027", "lions-track-2028", 2027), "lions-track-2028");
  assert.equal(nextSlugPlaceholder("", null, 2027), "e.g. team-name-2027");
  assert.equal(nextSeasonLabelPlaceholder(null, 2027), "e.g. 2027 Season");
  assert.equal(nextSeasonLabelPlaceholder("2028 Season", 2027), "2028 Season");
  const screen = read(`${TEAM}/team/complete-season/SeasonPreviewScreen.tsx`);
  assert.doesNotMatch(screen, /lions-track/);
});

test("the preview's not-available page is app-styled, generic, and offers a way back", () => {
  (globalThis as Record<string, unknown>).__testRouteParams = { slug: "lions-track-2027" };
  const html = decode(renderToStaticMarkup(h(CompleteSeasonNotFound)));
  assert.match(html, /This page isn't available/);
  assert.match(html, /href="\/team\/lions-track-2027\/team"/);
  assert.match(html, /href="\/team\/lions-track-2027\/home"/);
  assert.doesNotMatch(html, /graduat|roster|Complete Season/i, "reveals nothing about the preview");
  const src = read(`${TEAM}/team/complete-season/not-found.tsx`);
  assert.doesNotMatch(src, /fetch\(|season\/preview/, "loads no preview data");
  // The page still 404s (notFound) for everyone but the Head Coach / platform admin.
  const page = read(`${TEAM}/team/complete-season/page.tsx`);
  assert.match(page, /if \(!canPreviewSeason\(actor\)\) notFound\(\);/);
});
