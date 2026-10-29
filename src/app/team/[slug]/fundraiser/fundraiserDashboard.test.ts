// Fundraiser Dashboard Redesign — compact dashboards, top-five lists,
// full-list views, collapsible sections, goal display and role limits.
// Rendered as server markup through the same TSX test loader the
// attendance/partners UI tests use (CSS-module class names render as their
// keys). page.tsx itself fetches from Supabase, so its role routing is
// covered by source guards at the bottom, the same approach as
// leaderboardProgressBar.test.ts / settingsAccess.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const data = await import("./fundraiserData.ts");
const { getDisplayGoalCents } = await import("../../../../lib/platform/donations.ts");
const { CoachDashboard, TeamDashboard } = await import("./TeamDashboards.tsx");
const { default: CampaignOverviewCard } = await import("./CampaignOverviewCard.tsx");
const { FullListView, AthleteRows, DonationRows, DonorRows } = await import("./DashboardParts.tsx");
const { default: FundraiserView } = await import("./FundraiserView.tsx");

const {
  DASHBOARD_PREVIEW_COUNT, MEMBER_TEAM_FEED_LIMIT, parseFundraiserListView, fundraiserHref,
  buildLeaderboard, buildTeamFeed, buildTeamStats, buildPace, buildAthleteProgress, buildTopDonors,
  summarizeCampaignGoal,
} = data;

const SLUG = "lions-track";
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const DIR = "src/app/team/[slug]/fundraiser";

// ── Fixtures ──────────────────────────────────────────────────────────────────

type Athlete = Parameters<typeof buildLeaderboard>[0][number];
type Donation = Parameters<typeof buildLeaderboard>[1][number];

function athlete(i: number, over: Partial<Athlete> = {}): Athlete {
  return {
    id: `a${String(i).padStart(3, "0")}`, name: `Athlete ${i}`, event: "Sprints", class_year: "Junior",
    profile_photo: null, goal_cents: null, contact_phone: null, contact_email: null,
    ...over,
  } as unknown as Athlete;
}

let seq = 0;
function donation(over: Partial<Donation> & { amount_cents: number }): Donation {
  seq++;
  return {
    id: `d${seq}`, stripe_session_id: `cs_${seq}`, donor_name: `Donor ${seq}`, athlete_name: null,
    athlete_id: null, donation_message: null, campaign_slug: SLUG,
    created_at: new Date(Date.UTC(2026, 9, 1) + seq * 3_600_000).toISOString(),
    ...over,
  } as Donation;
}
/** getDonations() order: newest first. */
const newestFirst = (ds: Donation[]) => [...ds].sort((a, b) => b.created_at.localeCompare(a.created_at));

function settings(over: Record<string, unknown> = {}) {
  return {
    campaign_slug: SLUG, school_name: "Monroe Valley", mascot: "Lions", sport_name: "Track & Field",
    season: "Spring 2027", goal_cents: 1_000_000, deadline: new Date(Date.now() + 40 * 86_400_000).toISOString(),
    primary_color: "#0b2044", secondary_color: "#f5b301", default_athlete_goal_cents: 50_000,
    ...over,
  } as never;
}

const html = (el: unknown) => renderToStaticMarkup(el as never);
const count = (s: string, needle: string) => s.split(needle).length - 1;
const rowsIn = (s: string) => count(s, '<li class="row');

// 56 athletes, 20 donations from 12 named donors + 1 anonymous.
const ROSTER = Array.from({ length: 56 }, (_, i) => athlete(i + 1));
const DONATIONS = newestFirst(Array.from({ length: 20 }, (_, i) => donation({
  amount_cents: 1_000 * (i + 1),
  athlete_id: ROSTER[i % 8].id,
  donor_name: i === 3 ? null : `Donor ${i % 12}`,
  donation_message: i === 0 ? "Go Lions!" : null,
})));

// ── List views and URLs ───────────────────────────────────────────────────────

test("full-list view parsing: athletes/donations for every role, donors only for coach analytics", () => {
  assert.equal(parseFundraiserListView("athletes", false), "athletes");
  assert.equal(parseFundraiserListView("donations", false), "donations");
  assert.equal(parseFundraiserListView("donors", false), null, "boosters/athletes/parents never open Top Donors");
  assert.equal(parseFundraiserListView("donors", true), "donors");
  assert.equal(parseFundraiserListView("everything", true), null);
  assert.equal(parseFundraiserListView(undefined, true), null);
  assert.equal(parseFundraiserListView(["athletes", "donors"], false), "athletes");
});

test("full-list URLs carry only the view name and the already-selected athlete id", () => {
  assert.equal(fundraiserHref(SLUG), `/team/${SLUG}/fundraiser`);
  assert.equal(fundraiserHref(SLUG, "athletes"), `/team/${SLUG}/fundraiser?view=athletes`);
  assert.equal(fundraiserHref(SLUG, "donations", "a002"), `/team/${SLUG}/fundraiser?view=donations&athlete=a002`);
  assert.equal(fundraiserHref(SLUG, undefined, "a002"), `/team/${SLUG}/fundraiser?athlete=a002`);
});

// ── Ranking and ties (unchanged builders) ─────────────────────────────────────

test("leaderboard ranks by amount raised, ties keep roster order, every athlete zero-seeded", () => {
  const roster = [athlete(1), athlete(2), athlete(3), athlete(4)];
  const ds = newestFirst([
    donation({ amount_cents: 500, athlete_id: "a003" }),
    donation({ amount_cents: 500, athlete_id: "a002" }),
    donation({ amount_cents: 900, athlete_id: "a004" }),
    donation({ amount_cents: 300, athlete_name: "Athlete 1" }), // legacy name-only attribution
  ]);
  const lb = buildLeaderboard(roster, ds);
  assert.deepEqual(lb.map(e => [e.id, e.raisedCents, e.rank]), [
    ["a004", 900, 1], ["a002", 500, 2], ["a003", 500, 3], ["a001", 300, 4],
  ]);
  assert.deepEqual(buildAthleteProgress(roster, ds).map(e => [e.id, e.rank]), lb.map(e => [e.id, e.rank]),
    "coach Athlete Progress uses the same order and ranks as the leaderboard");
  assert.equal(buildLeaderboard([athlete(1), athlete(2)], []).every(e => e.raisedCents === 0), true);
});

test("top five on the dashboard is exactly the first five of the full ranked list", () => {
  const lb = buildLeaderboard(ROSTER, DONATIONS);
  const markup = html(createElement(AthleteRows, { entries: lb.slice(0, DASHBOARD_PREVIEW_COUNT) }));
  assert.equal(rowsIn(markup), 5);
  for (const e of lb.slice(0, 5)) assert.ok(markup.includes(e.name));
  assert.ok(!markup.includes(lb[5].name));
});

// ── Donation visibility (Decision 2) and anonymity ────────────────────────────

test("team feed: members/boosters capped at the existing 15; coaches get the full history", () => {
  assert.equal(MEMBER_TEAM_FEED_LIMIT, 15);
  assert.equal(buildTeamFeed(ROSTER, DONATIONS).length, 15);
  assert.equal(buildTeamFeed(ROSTER, DONATIONS, DONATIONS.length).length, 20);
  assert.equal(buildTeamFeed(ROSTER, DONATIONS)[0].created_at, DONATIONS[0].created_at, "newest first, unchanged");
});

test("anonymous donations stay anonymous and messages are preserved", () => {
  const feed = buildTeamFeed(ROSTER, DONATIONS, DONATIONS.length);
  const anon = feed.find(d => d.donor_name === null)!;
  assert.ok(anon, "anonymous donation keeps a null donor name");
  const markup = html(createElement(DonationRows, { donations: feed }));
  assert.ok(markup.includes("Anonymous"));
  assert.ok(markup.includes("&quot;Go Lions!&quot;") || markup.includes("Go Lions!"));
});

test("top donors: complete list sorted by total, anonymous grouped; old top-10 is its first ten", () => {
  const donors = buildTopDonors(ROSTER, DONATIONS);
  assert.equal(donors.length, 13);
  for (let i = 1; i < donors.length; i++) assert.ok(donors[i - 1].totalCents >= donors[i].totalCents);
  assert.equal(donors.filter(d => d.name === "Anonymous").length, 1);
  assert.equal(donors.reduce((s, d) => s + d.donationCount, 0), DONATIONS.length);
});

// ── Goal semantics (Decision 1) ───────────────────────────────────────────────

test("Monroe Valley: $12,000 displayed goal headline, $10,000 base goal, $665 needed for base goal", () => {
  const raised = 933_500;
  const display = getDisplayGoalCents(1_000_000, raised);
  assert.equal(display, 1_200_000, "getDisplayGoalCents is unchanged");
  const g = summarizeCampaignGoal(1_000_000, display, raised);
  assert.deepEqual(g, {
    displayGoalCents: 1_200_000, displayPct: 78, baseGoalCents: 1_000_000, basePct: 93,
    neededForBaseCents: 66_500, goalStepped: true,
  });
  assert.equal(summarizeCampaignGoal(1_000_000, 1_000_000, 100_000).goalStepped, false);
});

test("team stats and pace still use the stored base goal", () => {
  const ds = newestFirst(Array.from({ length: 9 }, () => donation({ amount_cents: 103_722 })));
  const raised = ds.reduce((s, d) => s + d.amount_cents, 0);
  const stats = buildTeamStats(settings(), ds, raised);
  assert.equal(stats.teamGoalCents, 1_000_000);
  assert.equal(stats.donorCount, 9, "the donation-count metric is unchanged (now labelled Donations)");
  assert.equal(stats.avgDonation, Math.round(raised / 9));
  assert.equal(stats.pct, Math.min(100, Math.round(raised / 1_000_000 * 100)));
  const pace = buildPace(settings(), ds, stats)!;
  assert.equal(pace.neededPerDay, Math.round(Math.max(0, (1_000_000 - raised) / pace.daysRemaining)));
  assert.equal(buildPace(settings({ deadline: null }), ds, buildTeamStats(settings({ deadline: null }), ds, raised)), null);
  assert.equal(buildTeamStats(settings({ season_completed_at: new Date().toISOString() }), ds, raised).daysRemaining, null);
});

function coachMarkup(over: Record<string, unknown> = {}) {
  const raised = DONATIONS.reduce((s, d) => s + d.amount_cents, 0);
  const s = settings({ goal_cents: 200_000, ...over });
  const stats = buildTeamStats(s, DONATIONS, raised);
  return html(createElement(CoachDashboard, {
    slug: SLUG, settings: s, raisedCents: raised, donationCount: DONATIONS.length,
    displayGoalCents: getDisplayGoalCents((s as { goal_cents: number }).goal_cents, raised),
    pace: buildPace(s, DONATIONS, stats),
    athleteProgress: buildAthleteProgress(ROSTER, DONATIONS),
    topDonors: buildTopDonors(ROSTER, DONATIONS),
    recentDonations: buildTeamFeed(ROSTER, DONATIONS, DONATIONS.length),
  }));
}

test("coach overview card: displayed goal headline with the base goal and its remainder labelled", () => {
  const raised = 933_500;
  const markup = html(createElement(CampaignOverviewCard, {
    settings: settings(), raisedCents: raised, donationCount: 9,
    displayGoalCents: getDisplayGoalCents(1_000_000, raised), variant: "coach",
  }));
  assert.ok(markup.includes("of $12,000 goal"));
  assert.ok(markup.includes("78% funded"));
  assert.ok(markup.includes("Base goal $10,000"));
  assert.ok(markup.includes("93% reached"));
  assert.match(markup, /\$665<\/div><div class="statLabel">Needed for Base Goal/);
  assert.ok(markup.includes(">Donations<"), "Decision 3 label");
  assert.ok(!markup.includes("Total Donors"));
  assert.ok(markup.includes("Monroe Valley") && markup.includes("Spring 2027"));
  assert.ok(markup.includes("Days Remaining") && markup.includes("Avg Donation"));
});

test("coach overview card before the goal steps up: one goal, plain Still Needed, no base-goal note", () => {
  const markup = html(createElement(CampaignOverviewCard, {
    settings: settings(), raisedCents: 400_000, donationCount: 4, displayGoalCents: 1_000_000, variant: "coach",
  }));
  assert.ok(markup.includes("of $10,000 goal"));
  assert.ok(!markup.includes("base-goal-note"));
  assert.match(markup, /\$6,000<\/div><div class="statLabel">Still Needed/);
});

test("completed season: no countdown, Season completed shown, totals kept", () => {
  const markup = html(createElement(CampaignOverviewCard, {
    settings: settings({ season_completed_at: "2026-10-20T00:00:00Z" }), raisedCents: 400_000, donationCount: 4,
    displayGoalCents: 1_000_000, variant: "coach",
  }));
  assert.ok(markup.includes("Season completed"));
  assert.ok(!markup.includes("Days Remaining"));
  assert.ok(markup.includes("$4,000"));
});

// ── Coach dashboard (head + assistant coach + platform admin share it) ───────

test("coach dashboard: one overview card, top five athletes/donors/donations with View All links", () => {
  const markup = coachMarkup();
  assert.equal(count(markup, 'data-testid="campaign-overview-'), 1, "no duplicate overview/progress card");
  for (const id of ["athlete-progress", "top-donors", "recent-donations"]) {
    const section = markup.split(`data-testid="${id}"`)[1].split("</section>")[0];
    assert.equal(rowsIn(section), 5, `${id} shows five rows`);
  }
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?view=athletes"`));
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?view=donors"`));
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?view=donations"`));
  assert.ok(markup.includes("View All Athletes (56)"));
  assert.ok(markup.includes("View All Donors (13)"));
  assert.ok(markup.includes("View All Donations (20)"));
});

test("coach dashboard: Pace and Export are collapsed sections; Share Campaign present", () => {
  const markup = coachMarkup();
  assert.match(markup, /<details class="collapsible" data-testid="pace-section">/, "Pace collapsed by default (no open attribute)");
  assert.match(markup, /<details class="collapsible" data-testid="export-section">/, "Export collapsed by default");
  assert.ok(!/<details[^>]*\bopen\b/.test(markup));
  assert.ok(/On track|Behind pace/.test(markup), "pace status indicator stays visible in the header");
  for (const label of ["Daily pace needed", "Current pace", "Projected finish", "Days remaining"]) assert.ok(markup.includes(label));
  for (const label of ["Download Donations CSV", "Download Athlete Report CSV", "View Athlete Report"]) assert.ok(markup.includes(label));
  assert.ok(markup.includes(`href="/campaign/${SLUG}"`), "Share Campaign donation-page link unchanged");
  assert.ok(markup.indexOf("share-campaign") < markup.indexOf("athlete-progress"), "Share sits near the top");
});

test("coach dashboard with no donations and three athletes: empty states, no View All links, no pace", () => {
  const roster = [athlete(1), athlete(2), athlete(3)];
  const s = settings();
  const markup = html(createElement(CoachDashboard, {
    slug: SLUG, settings: s, raisedCents: 0, donationCount: 0, displayGoalCents: 1_000_000,
    pace: buildPace(s, [], buildTeamStats(s, [], 0)),
    athleteProgress: buildAthleteProgress(roster, []), topDonors: [], recentDonations: [],
  }));
  assert.ok(!markup.includes("View All"));
  assert.ok(!markup.includes("pace-section"));
  assert.equal(rowsIn(markup.split('data-testid="athlete-progress"')[1].split("</section>")[0]), 3);
  assert.ok(markup.includes("No donors yet") && markup.includes("No fundraising activity yet"));
});

// ── Booster / public team dashboard ───────────────────────────────────────────

test("booster dashboard: leaderboard + at most 15 donations, no coach-only donor/pace/export tooling", () => {
  const raised = DONATIONS.reduce((s, d) => s + d.amount_cents, 0);
  const markup = html(createElement(TeamDashboard, {
    settings: settings(), raisedCents: raised, donationCount: DONATIONS.length, displayGoalCents: 1_000_000,
    leaderboard: buildLeaderboard(ROSTER, DONATIONS), teamFeed: buildTeamFeed(ROSTER, DONATIONS),
  }));
  assert.ok(!markup.includes("Top Donors") && !markup.includes("view=donors"));
  assert.ok(!markup.includes("pace-section") && !markup.includes("Export"));
  assert.ok(markup.includes("View All Donations (15)"), "booster full list stays at the existing 15");
  assert.ok(markup.includes("View All Athletes (56)"));
  assert.equal(rowsIn(markup.split('data-testid="team-leaderboard"')[1].split("</section>")[0]), 5);
  assert.equal(rowsIn(markup.split('data-testid="recent-donations"')[1].split("</section>")[0]), 5);
  assert.ok(markup.includes("Base goal") === false, "base goal is coach-only");
});

// ── Athlete / parent dashboard ────────────────────────────────────────────────

function athleteMarkup(over: Record<string, unknown> = {}) {
  const lb = buildLeaderboard(ROSTER, DONATIONS);
  const feed = buildTeamFeed(ROSTER, DONATIONS);
  const me = ROSTER[30];
  const raised = DONATIONS.reduce((s, d) => s + d.amount_cents, 0);
  return html(createElement(FundraiserView, {
    mode: "athlete", slug: SLUG, athlete: { ...me, grad_year: 2028, jersey_number: null }, settings: settings(),
    athleteRaisedCents: 0, goalCents: 50_000, rank: lb.find(e => e.id === me.id)!.rank, totalAthletes: ROSTER.length,
    donorCount: 0, recentDonations: [],
    leaderboard: lb.slice(0, 5), teamFeed: feed.slice(0, 5), teamFeedTotal: feed.length,
    teamRaisedCents: raised, teamDonationCount: DONATIONS.length, teamDisplayGoalCents: 1_000_000,
    ...over,
  } as never));
}

test("athlete dashboard: personal card, contacts, share, team campaign, top-five sections", () => {
  const markup = athleteMarkup();
  assert.ok(markup.includes("Your Fundraiser") && markup.includes("personal-stats"));
  assert.ok(markup.includes("$500") && markup.includes("goal"), "personal goal shown");
  assert.ok(markup.includes("0 donations"), "Decision 3 wording on the personal stats");
  assert.ok(markup.includes("Share My Fundraiser") && markup.includes("Copy Link") && markup.includes("QR Code"));
  assert.ok(markup.includes("People to Contact"), "contact count + Manage/Add Contacts card kept");
  assert.ok(markup.includes('data-testid="campaign-overview-compact"'));
  assert.ok(markup.includes("$2,100") && markup.includes("of $10,000 goal"), "team total, displayed goal and progress");
  assert.ok(!markup.includes("Base goal"), "athletes never see the coach base-goal detail");
  assert.equal(rowsIn(markup.split('data-testid="team-leaderboard"')[1].split("</section>")[0]), 5);
  assert.equal(rowsIn(markup.split('data-testid="team-donations"')[1].split("</section>")[0]), 5);
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?view=athletes"`));
  assert.ok(markup.includes("View All Donations (15)"));
  assert.ok(!markup.includes("view=donors") && !markup.includes("Top Donors"));
});

test("parent with several linked athletes: selector kept, full-list links keep the selected athlete", () => {
  const markup = athleteMarkup({
    linkedAthletes: [{ id: "a031", name: "Athlete 31" }, { id: "a032", name: "Athlete 32" }],
    selectedAthleteParam: "a031",
  });
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?athlete=a032"`), "child selector unchanged");
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?view=athletes&amp;athlete=a031"`));
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?view=donations&amp;athlete=a031"`));
});

test("athlete on a small team: fewer than five athletes, no View All links", () => {
  const roster = [athlete(1), athlete(2)];
  const markup = athleteMarkup({
    athlete: { ...roster[0], grad_year: null, jersey_number: null },
    leaderboard: buildLeaderboard(roster, []), teamFeed: [], teamFeedTotal: 0, totalAthletes: 2, rank: 1,
    teamRaisedCents: 0, teamDonationCount: 0,
  });
  assert.ok(!markup.includes("View All"));
  assert.ok(markup.includes("Athlete 1 (you)"), "current athlete highlighted");
  assert.ok(markup.includes("No fundraising activity yet"));
});

// ── Full-list views ───────────────────────────────────────────────────────────

test("full-list view: Back to the dashboard, team/season context, every record", () => {
  const lb = buildLeaderboard(ROSTER, DONATIONS);
  const markup = html(createElement(FullListView, {
    backHref: fundraiserHref(SLUG, undefined, "a031"), eyebrow: "Monroe Valley · Spring 2027", title: "Team Leaderboard (56)",
    children: createElement(AthleteRows, { entries: lb, currentAthleteId: "a031" }),
  }));
  assert.ok(markup.includes(`href="/team/${SLUG}/fundraiser?athlete=a031"`) && markup.includes("Back to Fundraiser"));
  assert.ok(markup.includes("Monroe Valley · Spring 2027"));
  assert.equal(rowsIn(markup), 56);
  assert.ok(markup.indexOf(lb[0].name) < markup.indexOf(lb[55].name), "ranking order preserved");
  assert.ok(markup.includes("aria-current=\"true\""));
});

test("donor full list renders every donor in rank order", () => {
  const donors = buildTopDonors(ROSTER, DONATIONS);
  const markup = html(createElement(DonorRows, { donors }));
  assert.equal(rowsIn(markup), donors.length);
  assert.ok(markup.includes("#13"));
});

// ── page.tsx role routing (source guards) ─────────────────────────────────────

test("page.tsx: only the coach/platform-admin branch may open Top Donors or the full donation history", () => {
  const page = read(`${DIR}/page.tsx`);
  assert.equal(count(page, "parseFundraiserListView(requestedView, true)"), 1);
  assert.equal(count(page, "parseFundraiserListView(requestedView, false)"), 3, "public, booster, athlete/parent");
  const coachBranch = page.split('if (actor.kind === "coach" || actor.kind === "platform_admin") {')[1].split("// ── Booster")[0];
  assert.ok(coachBranch.includes("buildTeamFeed(athletes, donations, donations.length)"));
  assert.ok(coachBranch.includes("<DonorRows donors={topDonors} />"));
  const boosterAndMember = page.split("// ── Booster")[1];
  assert.ok(!boosterAndMember.includes("buildTeamFeed(athletes, donations, donations.length)"));
  assert.ok(!boosterAndMember.includes("buildTopDonors") && !boosterAndMember.includes("CoachDashboard"));
  assert.equal(count(page, "buildTeamFeed(athletes, donations, donations.length)"), 1);
  assert.match(page, /<DonationRows donations=\{teamFeed\.slice\(0, MEMBER_TEAM_FEED_LIMIT\)\} \/>/);
});

test("page.tsx: athlete/parent branch keeps the linked-athlete check and sends only the top five to the client", () => {
  const page = read(`${DIR}/page.tsx`);
  assert.match(page, /const athleteId = requestedAthleteId && linkedAthleteIds\.includes\(requestedAthleteId\)/);
  assert.match(page, /leaderboard=\{leaderboard\.slice\(0, DASHBOARD_PREVIEW_COUNT\)\}/);
  assert.match(page, /teamFeed=\{teamFeed\.slice\(0, DASHBOARD_PREVIEW_COUNT\)\}/);
  assert.match(page, /\.slice\(0, 5\)\n\s+\.map\(d => \(\{\n\s+donor_name:/, "own athlete's recent donations unchanged");
  assert.ok(page.includes("if (routeView !== \"dashboard\") notFound();"));
});

test("goal algorithm, attribution and checkout are untouched by the redesign", () => {
  const donationsLib = read("src/lib/platform/donations.ts");
  assert.ok(donationsLib.includes("const step    = Math.max(1, Math.round(baseGoalCents * 0.20));"));
  assert.ok(donationsLib.includes("const buffer = Math.round(baseGoalCents * 0.10);"));
  for (const f of [`${DIR}/page.tsx`, `${DIR}/fundraiserData.ts`, `${DIR}/TeamDashboards.tsx`, `${DIR}/DashboardParts.tsx`, `${DIR}/CampaignOverviewCard.tsx`]) {
    const src = read(f);
    assert.ok(!/stripe|\/api\/checkout|insertDonation/i.test(src), `${f} must not touch Stripe/checkout/donation writes`);
  }
});

test("section cards reset the marketing `section { padding }` from globals.css", () => {
  const css = read(`${DIR}/Fundraiser.module.css`);
  const card = css.split(".card {")[1].split("\n}")[0];
  assert.match(card, /\n  padding: 0;/);
});

test("View All and Back are full navigations so the full list always opens at the top", () => {
  const parts = read(`${DIR}/DashboardParts.tsx`);
  assert.ok(!parts.includes('from "next/link"'));
  assert.match(parts, /<a href=\{href\} className=\{styles\.viewAll\}/);
  assert.match(parts, /<a href=\{backHref\} className=\{styles\.backLink\}>/);
});

test("stats grid fits the card's own width: auto-fit 130px columns, no viewport 4-column rule", () => {
  const css = read(`${DIR}/Fundraiser.module.css`);
  const grid = css.split(".statsGrid {")[1].split("\n}")[0];
  assert.match(grid, /grid-template-columns: repeat\(auto-fit, minmax\(130px, 1fr\)\);/);
  assert.ok(!/min-width: 640px/.test(css), "the 640px breakpoint squeezed labels in the narrow 640–1023px app column");
  assert.ok(!/\.statsGrid \{[^}]*repeat\(4,/.test(css));
});

test("personal progress bar is a labelled progressbar, like the team campaign bar", () => {
  const markup = athleteMarkup({ athleteRaisedCents: 10_000, goalCents: 50_000 });
  assert.match(markup, /role="progressbar" aria-label="Personal fundraising progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20"/);
  assert.match(markup, /role="progressbar" aria-label="Team fundraising progress"/);
  assert.ok(markup.includes("20% complete"), "visible percentage unchanged");
  const over = athleteMarkup({ athleteRaisedCents: 80_000, goalCents: 50_000 });
  assert.match(over, /aria-label="Personal fundraising progress"[^>]*aria-valuenow="100"/, "clamped like the bar width");
});
