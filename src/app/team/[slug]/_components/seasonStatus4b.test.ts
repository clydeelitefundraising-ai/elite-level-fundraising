// Complete Season Phase 4B — the remaining archived-season controls: staff,
// team settings, request approvals, family links, contacts and outreach,
// attendance, fundraising inquiry and account activation. Each control is
// checked both ways: present for an active season, hidden/disabled for a
// completed one. Information stays visible. Server-side refusal is covered
// by seasonWritableCoverage.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { SeasonStatusProvider, ReadOnlyFieldset } = await import("./SeasonStatus.tsx");
const { default: StaffView } = await import("../staff/StaffView.tsx");
const { default: FamilyView } = await import("../family/FamilyView.tsx");
const { default: FundraisingInquiryState } = await import("../fundraiser/FundraisingInquiryState.tsx");
const { default: ActivateAccountView } = await import("../activate-account/ActivateAccountView.tsx");

const TEAM = "src/app/team/[slug]";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const decode = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const ACTIVE = { readOnly: false, completedAt: null };
const COMPLETED = { readOnly: true, completedAt: "2026-10-22T21:51:00Z" };
const render = (status: typeof ACTIVE, el: unknown) =>
  decode(renderToStaticMarkup(h(SeasonStatusProvider, { status }, el as never)));

// ── Shared helper ──────────────────────────────────────────────────────────

test("ReadOnlyFieldset: untouched when active; visible but disabled (with a note) when completed", () => {
  const section = h(ReadOnlyFieldset, null, h("button", null, "Save Team Colors"));
  const active = render(ACTIVE, section);
  assert.equal(active, "<button>Save Team Colors</button>");
  const done = render(COMPLETED, section);
  assert.match(done, /<fieldset disabled=""/);
  assert.match(done, /This setting is read-only because the season is completed\./);
  assert.match(done, /Save Team Colors/, "the information stays visible");
});

// ── Rendered both ways ─────────────────────────────────────────────────────

test("Staff: Add Staff on an active season; none on a completed season (staff list stays)", () => {
  const active = render(ACTIVE, h(StaffView, { slug: "lions-track-2027" }));
  assert.match(active, /Add Staff/);
  assert.match(active, /Manage the assistant coaches and boosters/);
  const done = render(COMPLETED, h(StaffView, { slug: "hawks-track-2027" }));
  assert.doesNotMatch(done, /Add Staff/);
  assert.match(done, /Team Staff/);
  assert.match(done, /helped run this season/);
});

test("Family: link requests on an active season; a note on a completed season (links stay listed)", () => {
  const props = { slug: "t", linked: [{ id: "a1", name: "Hank Hawk", event: null }], pending: [], searchable: [] };
  const active = render(ACTIVE, h(FamilyView, props));
  assert.match(active, /Link Another Athlete/);
  const done = render(COMPLETED, h(FamilyView, props));
  assert.doesNotMatch(done, /Link Another Athlete|Link My Athlete/);
  assert.match(done, /This season is completed — to link an athlete, open the team's current season\./);
  assert.match(done, /Hank Hawk/);
});

test("Fundraising inquiry: closed on a completed season", () => {
  assert.doesNotMatch(render(ACTIVE, h(FundraisingInquiryState, { slug: "t" })), /This season is completed/);
  assert.match(render(COMPLETED, h(FundraisingInquiryState, { slug: "t" })), /This season is completed\. To ask about fundraising, open the team's current season\./);
});

test("Account activation: form on an active season; explanation on a completed season", () => {
  const props = { slug: "t", name: "Pat", email: "pat@example.test", alreadyLinked: false };
  assert.match(render(ACTIVE, h(ActivateAccountView, props)), /Activate Your ELF Account/);
  const done = render(COMPLETED, h(ActivateAccountView, props));
  assert.doesNotMatch(done, /<form/);
  assert.match(done, /Season Completed/);
});

// ── Wiring of the remaining controls ───────────────────────────────────────

test("staff: remove and invitation controls are season-gated", () => {
  const src = read(`${TEAM}/staff/StaffView.tsx`);
  assert.equal(src.split("canRemove={!seasonReadOnly && rowBusy !== s.id}").length - 1, 2, "both staff lists");
  assert.match(src, /canManage=\{!seasonReadOnly\}/);
  assert.match(src, /\{canManage && <div style=\{\{ display: "flex", gap: "\.3rem", flexShrink: 0 \}\}>/);
  assert.match(src, /\{!seasonReadOnly && <button\s*onClick=\{openAdd\}/);
});

test("settings: join code management hidden; branding and coach fundraising read-only", () => {
  // Settings Redesign: each section now lives on its own Settings screen.
  const src = read(`${TEAM}/settings/TeamAccessSection.tsx`);
  assert.match(src, /const canManageJoinCode = coach\.role === "head_coach" && !seasonReadOnly;/);
  assert.match(src, /\{canManageJoinCode && \(\s*<>\s*<button\s*onClick=\{handleGenerate\}/);
  assert.match(src, /\{!seasonReadOnly && <button\s*onClick=\{handleGenerate\}/);
  assert.match(src, /canManageJoinCode=\{canManageJoinCode\}/);
  assert.match(read(`${TEAM}/settings/branding/page.tsx`), /<ReadOnlyFieldset><TeamBrandingSection slug=\{slug\} branding=\{branding\} \/><\/ReadOnlyFieldset>/);
  assert.match(read(`${TEAM}/settings/coach-fundraising/page.tsx`), /<ReadOnlyFieldset><CoachFundraisingSection slug=\{slug\} initialAllowCoachFundraising=\{allowCoachFundraising\} \/><\/ReadOnlyFieldset>/);
  assert.match(read(`${TEAM}/settings/athlete-photos/page.tsx`), /<ReadOnlyFieldset><PublicAthletePhotosSection slug=\{slug\} \/><\/ReadOnlyFieldset>/);
  // Account-level sections are deliberately not wrapped.
  assert.match(read(`${TEAM}/settings/notifications/page.tsx`), /\n        <NotificationPreferencesSection showHeading=\{false\} \/>/);
  assert.match(read(`${TEAM}/settings/account/page.tsx`), /\n      <AccountPrivacySection slug=\{slug\} showHeading=\{false\} \/>/);
  for (const f of ["notifications/page.tsx", "account/page.tsx"]) {
    assert.ok(!read(`${TEAM}/settings/${f}`).includes("ReadOnlyFieldset"), `${f}: account-level, never season-locked`);
  }
});

test("requests: approvals disabled on a completed season; reports (safety) stay live", () => {
  const src = read(`${TEAM}/requests/RequestsView.tsx`);
  for (const panel of ["AthleteRequestsPanel", "CommentApprovalsPanel", "ParentAccessRequestsPanel"]) {
    assert.match(src, new RegExp(`<ReadOnlyFieldset [^>]*>\\s*<${panel}`), `${panel} is wrapped`);
  }
  assert.doesNotMatch(src, /<ReadOnlyFieldset[^>]*>\s*<ReportsPanel/);
});

test("contacts and outreach: add/edit/delete/goal/log controls are season-gated; views and export stay", () => {
  const contacts = read(`${TEAM}/contacts/ContactsView.tsx`);
  assert.match(contacts, /\{!seasonReadOnly && <button\s*onClick=\{openAdd\}/);
  assert.match(contacts, /canEdit=\{!seasonReadOnly\}/);
  const coach = read(`${TEAM}/contacts/coach/CoachContactsView.tsx`);
  assert.match(coach, /const canSetGoals = canSetGoalsForRole && !seasonReadOnly;/);
  assert.match(coach, /\{!seasonReadOnly && <button\s*onClick=\{\(\) => handleDelete\(c\.id\)\}/);
  assert.match(coach, /onClick=\{handleExportCsv\}/, "CSV export stays");
  const athlete = read(`${TEAM}/team/[id]/CoachAthleteView.tsx`);
  assert.match(athlete, /\{!seasonReadOnly && <button\s*onClick=\{\(\) => \{ setEditing\(null\); setShowModal\(true\); \}\}/);
  assert.match(athlete, /\{!seasonReadOnly && <div style=\{\{ display: "flex", flexDirection: "column", gap: "\.15rem", flexShrink: 0 \}\}>/);
  assert.match(athlete, /\{!seasonReadOnly && <div style=\{\{ marginBottom: "\.75rem", display: "flex", flexDirection: "column", gap: "\.45rem" \}\}>/);
  const ws = read(`${TEAM}/fundraiser/useFollowUpsWorkspace.ts`);
  assert.match(ws, /const canUpdate = !useSeasonReadOnly\(\);/);
  for (const f of ["FollowUpsView.tsx", "DesktopFollowUpsView.tsx"]) {
    const v = read(`${TEAM}/fundraiser/${f}`);
    assert.match(v, /\{canUpdate && <button onClick=\{\(\) => openUpdate\(r\)\} style=\{smallBtn\}>Update<\/button>\}/, f);
    assert.match(v, /<button onClick=\{\(\) => openHistory\(r\)\}/, `${f}: history stays`);
  }
  const fr = read(`${TEAM}/fundraiser/FundraiserView.tsx`);
  assert.match(fr, /const ctaLabel   = goalMet \|\| seasonReadOnly \? "View Contacts →" : "Add Contacts →";/);
  assert.match(fr, /\{seasonReadOnly \? \(\s*<p role="note"[\s\S]*?profiles can&apos;t be linked/);
});

test("attendance: every date loads read-only on a completed season, with the season reason", () => {
  const hook = read(`${TEAM}/attendance/useAttendanceEditor.ts`);
  assert.match(hook, /seasonReadOnly && res\.value\.editability === "editable" \? \{ \.\.\.res\.value, editability: "session_not_draft" as const \} : res\.value/);
  assert.match(hook, /\}, \[api, load, seasonReadOnly\]\);/);
  const screen = read(`${TEAM}/attendance/AttendanceScreen.tsx`);
  assert.match(screen, /seasonReadOnly \? "This season is completed, so its attendance is read-only\." : readOnlyReasonText\(mode\.reason\)/);
  // Only the client view changes — the server's editability values are untouched.
  assert.match(read("src/lib/teamAttendance.ts"), /reason: "session_not_draft" \| "date_in_future" \| "date_not_editable" \};/);
});

test("exempt operations keep working on a completed season", () => {
  for (const f of ["requests/ReportsPanel.tsx", "_components/ReportModal.tsx", "_components/BlockUserModal.tsx",
    "_components/BlockedUsersModal.tsx", "_components/DeleteAccountModal.tsx", "settings/NotificationPreferencesSection.tsx",
    "settings/AccountPrivacySection.tsx", "notifications/NotificationsView.tsx", "profile/ProfileView.tsx"]) {
    assert.doesNotMatch(read(`${TEAM}/${f}`), /useSeasonReadOnly|ReadOnlyFieldset/, `${f} must not be season-gated`);
  }
});
