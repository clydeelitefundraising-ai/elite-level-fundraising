// Complete Season Phase 3 — the preview screen: everything the coach must
// see, blockers and warnings, the not-available state, mobile layout, the
// entry card under the To-Do List, and no way to complete anything.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: SeasonPreviewReport } = await import("./SeasonPreviewReport.tsx");
const { default: SeasonPreviewScreen, previewUrl } = await import("./SeasonPreviewScreen.tsx");
const { default: CompleteSeasonEntry } = await import("./CompleteSeasonEntry.tsx");
const { BLOCKER_TEXT, WARNING_TEXT } = await import("./seasonPreviewText.ts");

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const decode = (html: string) => html.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// The Lions fixture's real preview values (Phase 1 SQL test D1–D9).
function lions(overrides: Record<string, unknown> = {}) {
  return {
    from: { slug: "lions-track-2027", season_label: "2027 Season", school_name: "Lions High School", sport_name: "Track and Field",
            program_id: "p", has_organization: true, archived: false, completed: false, successor_slug: null, fundraising_enabled: true },
    proposed: { slug: "lions-track-2028", slug_source: "derived", slug_available: true, season_label: "2028 Season", label_source: "derived",
                confirmation_phrase: "COMPLETE 2027 SEASON" },
    actor: { kind: "head_coach" },
    roster: { total: 10, graduating: 2, returning: 8, freshman_to_sophomore: 1, sophomore_to_junior: 1, junior_to_senior: 2, unchanged_middle_school: 1,
              flagged: [
                { athlete_id: "s07", name: "Bree Blank", class_year: null, reason: "blank" },
                { athlete_id: "s06", name: "Otto Other", class_year: "Other", reason: "other" },
                { athlete_id: "s08", name: "Rhys Redshirt", class_year: "RS Sophomore", reason: "nonstandard" },
              ] },
    members: { athletes_carried: 1, parents_carried: 3, boosters_carried: 1, athletes_graduated: 1, parents_graduates_only: 1,
               unlinked_not_carried: 2, parent_links_carried: 4,
               must_rejoin: [{ member_id: "m03", name: "Sol Sophomore", role: "athlete" }, { member_id: "m07", name: "Nora NoAccount", role: "parent" }] },
    coaches: { head_carried: 1, assistant_carried: 1, booster_carried: 1, actor_carried: true,
               must_rejoin: [{ coach_id: "c04", name: "Lee Legacy", role: "head_coach" }] },
    calendar: { cutoff_local_date: "2026-10-22", future_events_to_copy: 3, subscription_moves: true },
    copied: { fund_uses: 2, store_products: 2, team_contact_goal: true, team_goal_cents: 500000, default_athlete_goal_cents: 25000 },
    left_in_history: { announcements: 1, message_threads: 2, attendance_sessions: 1, donations: 2, team_sponsors: 2, todo_tasks: 1, clearance_resources: 1 },
    open_items: { pending_athlete_requests: 0, pending_parent_requests: 0, pending_staff_invitations: 0, pending_fundraising_inquiries: 0,
                  donations_last_24h: 1, recent_attendance_drafts: 1 },
    blockers: [], warnings: ["season_flagged_grades", "season_members_must_rejoin", "season_coaches_must_rejoin", "season_recent_donations", "season_attendance_drafts_frozen"],
    fingerprint: "0123456789abcdef0123456789abcdef",
    ...overrides,
  };
}
const report = (preview: unknown, openCheckouts: unknown = { state: "checked", count: 0, more: false }) =>
  decode(renderToStaticMarkup(createElement(SeasonPreviewReport as never, { preview, openCheckouts } as never)));

test("all 18 preview items are shown, with the database's numbers", () => {
  const html = report(lions());
  const expect = [
    // 1–2 current and next season, slug and label
    "2027 Season", "/lions-track-2027", "2028 Season", "/lions-track-2028",
    // 3–8 grades
    "Seniors graduate", "Freshmen → Sophomores", "Sophomores → Juniors", "Juniors → Seniors", "Middle school (unchanged)",
    "need a grade review", "Bree Blank", "No grade", "Otto Other", "Rhys Redshirt", "RS Sophomore",
    // 9–10 returning athletes, parents, coaches, boosters
    "Athletes returning", "Parent–athlete links", "Boosters", "Head Coaches", "Assistant Coaches",
    // 11 must rejoin
    "Must rejoin the new season", "Sol Sophomore", "Nora NoAccount", "Lee Legacy",
    // 13 history
    "direct and group messages stay readable", "attendance", "fresh To-Do List",
    // 14 fundraising
    "start at <strong>$0</strong>", "starts <strong>inactive</strong>", "$5,000", "$250", "deadline is cleared",
    // 15 sponsors and partners
    "2 Team Sponsors stay with this season and aren't renewed automatically", "ELF Community Partners are unchanged",
    // 16 calendar
    "3 calendar events from 2026-10-22 onward are copied", "calendar subscription link moves",
    // 17 join code
    "new join code",
    // 18 recent donations
    WARNING_TEXT.season_recent_donations, "(1 donation)",
    // effective immediately
    "immediately",
  ];
  for (const s of expect) assert.ok(html.includes(s), `missing: ${s}`);
  assert.ok(/>2<\/span><span[^>]*>Seniors graduate/.test(html), "graduating count shown");
  assert.ok(/>8<\/span><span[^>]*>Athletes returning/.test(html));
  assert.ok(/>4<\/span><span[^>]*>Parent–athlete links/.test(html));
});

test("unknown and nonstandard grades are called out for review", () => {
  const html = report(lions());
  assert.ok(html.includes("3 athletes need a grade review"));
  assert.ok(html.includes(WARNING_TEXT.season_flagged_grades));
  const none = report(lions({ roster: { ...lions().roster, flagged: [] }, warnings: [] }));
  assert.ok(!none.includes("need a grade review"));
});

test("pending requests and invitations are shown as blockers with counts", () => {
  const html = report(lions({
    blockers: ["season_pending_athlete_requests", "season_pending_parent_requests", "season_pending_staff_invitations"],
    open_items: { ...lions().open_items, pending_athlete_requests: 1, pending_parent_requests: 2, pending_staff_invitations: 1 },
  }));
  assert.ok(html.includes("Resolve before completing"));
  for (const b of ["season_pending_athlete_requests", "season_pending_parent_requests", "season_pending_staff_invitations"]) {
    assert.ok(html.includes(BLOCKER_TEXT[b]), b);
  }
  assert.ok(html.includes("1 athlete request, 2 parent requests, 1 staff invitation"));
  assert.ok(!report(lions()).includes("Resolve before completing"), "no blocker section when there are none");
});

test("every blocker and warning the database can return has plain-language text", () => {
  const sql = read("supabase/migrations/phase_s1_complete_season.sql");
  const blockers = new Set([...sql.matchAll(/v_blockers := array_append\(v_blockers, '([a-z_]+)'\)/g)].map(m => m[1]));
  const warnings = new Set([...sql.matchAll(/v_warnings := array_append\(v_warnings, '([a-z_]+)'\)/g)].map(m => m[1]));
  assert.ok(blockers.size >= 10 && warnings.size >= 6);
  for (const b of blockers) assert.ok(BLOCKER_TEXT[b], `blocker ${b}`);
  for (const w of warnings) assert.ok(WARNING_TEXT[w], `warning ${w}`);
});

test("open Stripe checkouts: counted, 'at least' when more, and an honest 'couldn't check'", () => {
  assert.ok(report(lions(), { state: "checked", count: 2, more: false }).includes("2 donation checkouts started in the last 24 hours are still open"));
  assert.ok(report(lions(), { state: "checked", count: 1, more: true }).includes("At least 1 donation checkout started in the last 24 hours is still open"));
  assert.ok(report(lions(), { state: "unknown" }).includes("Open donation checkouts couldn't be checked right now, so the season can't be completed yet"));
  assert.ok(!report(lions(), { state: "checked", count: 0, more: false }).includes("still open"));
});

// Phase 5A: completion lives only in CompleteSeasonPanel.tsx, rendered when
// the server page passes completionEnabled (COMPLETE_SEASON_EXECUTE) — see
// seasonCompleteUi.test.ts. By default (flag off) this still holds.
test("completion off (default): the report has no buttons or forms; the screen's only action refreshes the preview", () => {
  const html = report(lions());
  assert.ok(!html.includes("<button") && !html.includes("<form"));
  assert.ok(html.includes("Preview only.") && html.includes("isn't available yet"));
  const screen = renderToStaticMarkup(createElement(SeasonPreviewScreen as never, { slug: "lions-track-2027" } as never));
  const buttons = [...screen.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1]);
  assert.deepEqual(buttons, ["Update preview"]);
  assert.ok(!/complete season<\/button>|confirm/i.test(screen));
  const src = ["SeasonPreviewScreen.tsx", "SeasonPreviewReport.tsx", "CompleteSeasonEntry.tsx"].map(f => read(`src/app/team/[slug]/team/complete-season/${f}`)).join("\n");
  assert.doesNotMatch(src, /method:\s*"(POST|PUT|PATCH|DELETE)"/);
  assert.equal(previewUrl("lions-track-2027", "", ""), "/api/team/lions-track-2027/season/preview");
  assert.equal(previewUrl("lions", " l-2028 ", "Fall 2028"), "/api/team/lions/season/preview?next_slug=l-2028&next_label=Fall+2028");
});

test("the screen starts in a loading state (the preview always comes from the database)", () => {
  const screen = renderToStaticMarkup(createElement(SeasonPreviewScreen as never, { slug: "x" } as never));
  assert.ok(screen.includes("Loading the preview"));
  const src = read("src/app/team/[slug]/team/complete-season/SeasonPreviewScreen.tsx");
  assert.match(src, /res\.status === 503/);
  assert.match(src, /Not available yet\./);
});

test("mobile: one column by default, no fixed widths, everything wraps; wider screens get more columns", () => {
  const css = read("src/app/team/[slug]/team/complete-season/SeasonPreview.module.css");
  const base = css.slice(0, css.indexOf("@media"));
  assert.match(base, /\.seasonPair \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(base, /\.overrides \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(base, /\.stats \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.doesNotMatch(css, /(^|[^-])width:\s*\d{3,}px/m, "no fixed pixel widths");
  for (const cls of ["seasonName", "slug", "name", "statLabel"]) assert.match(css, new RegExp(`\\.${cls} \\{[^}]*overflow-wrap: anywhere;`), cls);
  assert.match(css, /@media \(min-width: 560px\) \{[^@]*\.stats \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.field input \{[^}]*font-size: 1rem;/, "16px inputs: no iOS zoom");
  assert.match(css, /\.btn \{[^}]*min-height: 40px;/, "touch-sized");
});

test("entry card under the To-Do List explains the effect and links to the preview", () => {
  const html = decode(renderToStaticMarkup(createElement(CompleteSeasonEntry as never, { slug: "lions-track-2027" } as never)));
  assert.ok(html.includes("Complete Season"));
  assert.ok(html.includes("archives the current season") && html.includes("immediately activates the next one"));
  assert.ok(html.includes('href="/team/lions-track-2027/team/complete-season"'));
  const page = read("src/app/team/[slug]/team/page.tsx");
  const todo = page.indexOf("<TodoListView slug={slug} />");
  const entry = page.indexOf("isSeasonPreviewEnabled() && canPreviewSeason(actor) && (");
  assert.ok(todo > 0 && entry > todo, "rendered beneath the To-Do List, behind the flag and the role check");
  // Phase 4: and only while the season is active (hidden once completed).
  assert.ok(page.indexOf("<ActiveSeasonOnly><CompleteSeasonEntry slug={slug} /></ActiveSeasonOnly>") > entry);
});

test("the preview page is flag- and role-gated (404, not revealed) before anything loads", () => {
  const page = read("src/app/team/[slug]/team/complete-season/page.tsx");
  assert.match(page, /if \(!isSeasonPreviewEnabled\(\)\) notFound\(\);/);
  assert.match(page, /if \(!canPreviewSeason\(actor\)\) notFound\(\);/);
  assert.ok(page.indexOf("if (!isSeasonPreviewEnabled())") < page.indexOf("await requireTeamMembership"));
});

test("loading the preview: ready, not-available (503) and error states come only from the server's answer", async () => {
  const { fetchPreviewState } = await import("./SeasonPreviewScreen.tsx");
  const real = globalThis.fetch;
  const answer = (status: number, body: unknown) => { globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch; };
  try {
    answer(200, { preview: lions(), openCheckouts: { state: "checked", count: 0, more: false } });
    const ready = await fetchPreviewState("/x");
    assert.equal(ready.kind, "ready");
    answer(503, { error: "Season completion isn't set up in this environment yet.", code: "preview_unavailable" });
    assert.deepEqual(await fetchPreviewState("/x"), { kind: "unavailable", message: "Season completion isn't set up in this environment yet." });
    answer(403, { error: "Only this team's Head Coach can preview completing the season.", code: "forbidden" });
    assert.deepEqual(await fetchPreviewState("/x"), { kind: "error", message: "Only this team's Head Coach can preview completing the season." });
    answer(200, { nothing: true });
    assert.equal((await fetchPreviewState("/x")).kind, "error", "no preview in the answer -> error, never an empty report");
    globalThis.fetch = (async () => { throw new Error("offline"); }) as typeof fetch;
    assert.equal((await fetchPreviewState("/x")).kind, "error");
  } finally {
    globalThis.fetch = real;
  }
});
