// Complete Season Phase 5A — the completion step's screen: typed confirmation
// (team address + season phrase), the disabled-until-matching button, the
// blocked state, the receipt, and that nothing is offered while the
// COMPLETE_SEASON_EXECUTE flag is off.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: CompleteSeasonPanel, CompletionReceiptView } = await import("./CompleteSeasonPanel.tsx");
const { default: SeasonPreviewReport } = await import("./SeasonPreviewReport.tsx");
const { confirmationMatches } = await import("../../../../../lib/seasonConfirmation.ts");

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const decode = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const DIR = "src/app/team/[slug]/team/complete-season";

const PREVIEW = {
  from: { slug: "lions-track-2027", season_label: "2027 Season", school_name: "Lions High School", sport_name: "Track and Field", program_id: "p",
          has_organization: true, archived: false, completed: false, successor_slug: null, fundraising_enabled: true },
  proposed: { slug: "lions-track-2028", slug_source: "derived", slug_available: true, season_label: "2028 Season", label_source: "derived",
              confirmation_phrase: "COMPLETE 2027 SEASON" },
  actor: { kind: "head_coach" },
  roster: { total: 10, graduating: 2, returning: 8, freshman_to_sophomore: 1, sophomore_to_junior: 1, junior_to_senior: 2, unchanged_middle_school: 1, flagged: [] },
  members: { athletes_carried: 1, parents_carried: 3, boosters_carried: 2, athletes_graduated: 1, parents_graduates_only: 1, unlinked_not_carried: 1,
             parent_links_carried: 4, must_rejoin: [] },
  coaches: { head_carried: 1, assistant_carried: 1, booster_carried: 1, actor_carried: true, must_rejoin: [] },
  calendar: { cutoff_local_date: "2026-10-23", future_events_to_copy: 3, subscription_moves: true },
  copied: { fund_uses: 2, store_products: 2, team_contact_goal: true, team_goal_cents: 500000, default_athlete_goal_cents: 25000 },
  left_in_history: { announcements: 1, message_threads: 2, attendance_sessions: 1, donations: 3, team_sponsors: 2, todo_tasks: 1, clearance_resources: 1 },
  open_items: { pending_athlete_requests: 0, pending_parent_requests: 0, pending_staff_invitations: 0, pending_fundraising_inquiries: 0,
                donations_last_24h: 0, recent_attendance_drafts: 0 },
  blockers: [] as string[], warnings: [] as string[], fingerprint: "0123456789abcdef0123456789abcdef",
};
const panel = (preview = PREVIEW) => decode(renderToStaticMarkup(h(CompleteSeasonPanel as never, {
  slug: "lions-track-2027", preview, applied: { toSlug: "", toSeasonLabel: "" }, onReload: () => {}, onCompleted: () => {},
} as never)));

test("the panel names the team and both seasons, asks for the team address and the phrase, and starts disabled", () => {
  const html = panel();
  assert.match(html, /Lions High School · Track and Field/);
  assert.match(html, /2027 Season/);
  assert.match(html, /2028 Season/);
  assert.match(html, /\(\/lions-track-2028\) becomes the team's active season/, "space kept after the new address");
  assert.match(html, /Type the team address <code>lions-track-2027<\/code>/);
  assert.match(html, /Type <code>COMPLETE 2027 SEASON<\/code>/);
  assert.match(html, /<button type="button"[^>]*disabled=""[^>]*>Complete 2027 Season<\/button>/, "disabled until both match");
  assert.match(html, /fundraiser stays off until ELF turns it on/);
  assert.match(html, /can't be undone from the app/);
});

test("the button enables only when BOTH the team address and the phrase match", () => {
  const exp = { teamSlug: "lions-track-2027", phrase: "COMPLETE 2027 SEASON" };
  assert.ok(confirmationMatches({ teamSlug: "lions-track-2027", phrase: "complete 2027 season" }, exp));
  assert.ok(!confirmationMatches({ teamSlug: "lions-track-2027", phrase: "" }, exp), "phrase missing");
  assert.ok(!confirmationMatches({ teamSlug: "", phrase: "COMPLETE 2027 SEASON" }, exp), "team missing");
  assert.ok(!confirmationMatches({ teamSlug: "lions-track-2028", phrase: "COMPLETE 2027 SEASON" }, exp), "another team");
  const src = read(`${DIR}/CompleteSeasonPanel.tsx`);
  assert.match(src, /const canSubmit = !blocked && matches && !submitting && !!preview\.proposed\.slug;/);
  assert.match(src, /disabled=\{!canSubmit\}/);
});

test("blocked seasons get no confirmation inputs and no button", () => {
  const html = panel({ ...PREVIEW, blockers: ["season_pending_athlete_requests"] });
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, />Complete 2027 Season</);
  assert.match(html, /Resolve the items listed above/);
});

test("one confirmation id per preview, reused on retry; identity is never sent from the browser", () => {
  const src = read(`${DIR}/CompleteSeasonPanel.tsx`);
  assert.match(src, /keyRef\.current = \{ fingerprint: preview\.fingerprint, key: newKey\(\) \};\s*\}, \[preview\.fingerprint\]\);/);
  // A problem shown belongs to the current preview (a reloaded preview hides it).
  assert.match(src, /const shownProblem = problem && problem\.fingerprint === preview\.fingerprint \? problem : null;/);
  assert.match(src, /idempotencyKey: keyRef\.current\.key/);
  assert.doesNotMatch(src, /coach_id|platform_admin_id|p_actor/);
  // After a stale/blocked/already-completed answer, the coach reloads the preview.
  assert.match(src, /const RELOAD_CODES = new Set\(\["stale", "blocked", "already_completed", "duplicate_conflict", "open_checkouts"\]\);/);
});

test("the receipt confirms the result and links to the new season and the archived one", () => {
  const html = decode(renderToStaticMarkup(h(CompletionReceiptView as never, { receipt: {
    transitionId: "t-1", fromSlug: "lions-track-2027", toSlug: "lions-track-2028", toSeasonLabel: "2028 Season",
    completedAt: "2026-10-23T17:00:00Z", replayed: false,
    summary: { athletes_carried: 8, athletes_graduated: 2, members_carried: 6, coaches_carried: 3, members_must_rejoin: 3, coaches_must_rejoin: 2, calendar_events_copied: 3 },
    newSeasonUrl: "/team/lions-track-2028/home", archivedSeasonUrl: "/team/lions-track-2027/home",
  } } as never)));
  assert.match(html, /Season completed/);
  assert.match(html, /8 athletes moved to the new season; 2 graduated/);
  assert.match(html, /5 people need to rejoin/);
  assert.match(html, /href="\/team\/lions-track-2028\/home"[^>]*>Go to the new season/);
  assert.match(html, /href="\/team\/lions-track-2027\/home"[^>]*>View the archived season/);
  assert.match(html, /new fundraiser is off until ELF turns it on/);
  assert.doesNotMatch(html, /payments-unverified|not verified/, "no QA note on a normal receipt");
});

test("Phase 5B: a QA completion with Stripe unconfigured says so on the receipt", () => {
  const html = decode(renderToStaticMarkup(h(CompletionReceiptView as never, { receipt: {
    transitionId: "t-1", fromSlug: "lions-track-2027", toSlug: "lions-track-2028", toSeasonLabel: "2028 Season",
    completedAt: "2026-10-23T17:00:00Z", replayed: false, summary: {}, paymentsUnverified: true,
    newSeasonUrl: "/team/lions-track-2028/home", archivedSeasonUrl: "/team/lions-track-2027/home",
  } } as never)));
  assert.match(html, /data-testid="payments-unverified"/);
  assert.match(html, /QA test environment: open donation checkouts were not verified/);
});

test("with the execute flag off nothing completes: no panel, and the report still says preview only", () => {
  const off = decode(renderToStaticMarkup(h(SeasonPreviewReport as never, { preview: PREVIEW, openCheckouts: { state: "unknown" } } as never)));
  assert.match(off, /Preview only\./);
  const on = decode(renderToStaticMarkup(h(SeasonPreviewReport as never, { preview: PREVIEW, openCheckouts: { state: "unknown" }, completionEnabled: true } as never)));
  assert.match(on, /Before you confirm:/);
  const screen = read(`${DIR}/SeasonPreviewScreen.tsx`);
  assert.match(screen, /\{completionEnabled && state\.kind === "ready" && \(\s*<CompleteSeasonPanel/);
  const page = read(`${DIR}/page.tsx`);
  assert.match(page, /completionEnabled=\{isSeasonCompletionEnabledForTeam\(slug\)\}/);
  assert.match(read("src/lib/seasonComplete.ts"), /env\.COMPLETE_SEASON_PREVIEW === "true" && env\.COMPLETE_SEASON_EXECUTE === "true"/);
  assert.match(read("src/lib/seasonComplete.ts"), /isSeasonCompletionEnabled\(env\) && seasonCompletionTeams\(env\)\.has\(slug\)/);
});

// Phase 5D — pre-production polish.
const receiptHtml = (summary: Record<string, number>) => decode(renderToStaticMarkup(h(CompletionReceiptView as never, { receipt: {
  transitionId: "t-1", fromSlug: "lions-track-2027", toSlug: "lions-track-2028", toSeasonLabel: "2028 Season",
  completedAt: "2026-10-23T17:00:00Z", replayed: false, summary,
  newSeasonUrl: "/team/lions-track-2028/home", archivedSeasonUrl: "/team/lions-track-2027/home",
} } as never)));

test("Phase 5D: the receipt uses singular wording for counts of one", () => {
  const one = receiptHtml({ athletes_carried: 1, athletes_graduated: 1, members_carried: 1, coaches_carried: 1,
    members_must_rejoin: 1, coaches_must_rejoin: 0, calendar_events_copied: 1 });
  assert.match(one, /1 athlete moved to the new season; 1 graduated and stays in this season\./);
  assert.match(one, /1 family member and 1 staff member carried over\./);
  assert.match(one, /1 person needs to rejoin or be invited/);
  assert.match(one, /1 upcoming calendar event was copied\./);
  assert.doesNotMatch(one, /1 people|1 athletes|1 upcoming calendar events|1 family members/);
});

test("Phase 5D: the receipt uses plural wording for zero and many", () => {
  const many = receiptHtml({ athletes_carried: 4, athletes_graduated: 2, members_carried: 3, coaches_carried: 2,
    members_must_rejoin: 2, coaches_must_rejoin: 1, calendar_events_copied: 0 });
  assert.match(many, /4 athletes moved to the new season; 2 graduated and stay in this season\./);
  assert.match(many, /3 family members and 2 staff members carried over\./);
  assert.match(many, /3 people need to rejoin/);
  assert.match(many, /0 upcoming calendar events were copied\./);
});

test("Phase 5D: the confirmation fields stack one per row and fill the form's width", () => {
  const html = panel();
  assert.match(html, /data-testid="complete-season-confirm"/);
  assert.doesNotMatch(read(`${DIR}/CompleteSeasonPanel.tsx`), /styles\.overrides/, "not the 3-column overrides grid");
  const css = read(`${DIR}/SeasonPreview.module.css`);
  assert.match(css, /\.confirmForm \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.confirmForm \.field input \{\s*width: 100%;/);
  // No media query switches the confirmation form to columns.
  assert.doesNotMatch(css.slice(css.indexOf("@media")), /confirmForm/);
});

test("Phase 5D: the preview describes payments failing closed, never 'they'll count toward this season'", () => {
  const unknown = decode(renderToStaticMarkup(h(SeasonPreviewReport as never, { preview: PREVIEW, openCheckouts: { state: "unknown" }, completionEnabled: true } as never)));
  assert.match(unknown, /Open donation checkouts couldn't be checked right now, so the season can't be completed yet/);
  const open = decode(renderToStaticMarkup(h(SeasonPreviewReport as never, { preview: PREVIEW, openCheckouts: { state: "checked", count: 2, more: false }, completionEnabled: true } as never)));
  assert.match(open, /The season can't be completed while a checkout is\s+open/);
  for (const html of [unknown, open]) assert.doesNotMatch(html, /count toward this season|Any that finish/);
});

test("rollout matrix: both off → hidden; PREVIEW only → read-only preview; both on → preview + completion for listed teams only; EXECUTE alone → hidden", async () => {
  const { isSeasonPreviewEnabled } = await import("../../../../../lib/seasonPreview.ts");
  const { isSeasonCompletionEnabledForTeam } = await import("../../../../../lib/seasonComplete.ts");
  const BOTH = { COMPLETE_SEASON_PREVIEW: "true", COMPLETE_SEASON_EXECUTE: "true" };
  const cases = [
    { env: {},                                                              entryAndPage: false, completion: false },
    { env: { COMPLETE_SEASON_PREVIEW: "true" },                             entryAndPage: true,  completion: false },
    { env: { COMPLETE_SEASON_EXECUTE: "true", COMPLETE_SEASON_EXECUTE_TEAMS: "lions-track-2027" }, entryAndPage: false, completion: false },
    { env: BOTH,                                                            entryAndPage: true,  completion: false },
    { env: { ...BOTH, COMPLETE_SEASON_EXECUTE_TEAMS: "hawks-track-2027" },  entryAndPage: true,  completion: false },
    { env: { ...BOTH, COMPLETE_SEASON_EXECUTE_TEAMS: "lions-track-2027" },  entryAndPage: true,  completion: true },
  ];
  for (const c of cases) {
    assert.equal(isSeasonPreviewEnabled(c.env), c.entryAndPage, `preview gate ${JSON.stringify(c.env)}`);
    assert.equal(isSeasonCompletionEnabledForTeam("lions-track-2027", c.env), c.completion, `completion gate ${JSON.stringify(c.env)}`);
  }
  // The entry card and the page are behind the preview gate; the page 404s
  // before it decides anything else, and only then asks the completion gate
  // for THIS team.
  const page = read(`${DIR}/page.tsx`);
  const pageGate = page.indexOf("if (!isSeasonPreviewEnabled()) notFound();");
  assert.ok(pageGate > 0 && pageGate < page.indexOf("completionEnabled={isSeasonCompletionEnabledForTeam(slug)}"));
  assert.match(read("src/app/team/[slug]/team/page.tsx"), /\{isSeasonPreviewEnabled\(\) && canPreviewSeason\(actor\) && \(\s*<ActiveSeasonOnly><CompleteSeasonEntry/);
  // With completion off the screen offers no inputs and no button.
  const screen = read(`${DIR}/SeasonPreviewScreen.tsx`);
  assert.match(screen, /\{completionEnabled && state\.kind === "ready" && \(\s*<CompleteSeasonPanel/);
});
