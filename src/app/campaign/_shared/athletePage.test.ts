// Personalized athlete fundraising page — the public campaign page rendered
// (react-dom/server) for an athlete link vs. a general team link, plus the
// wiring in CampaignPageClient that decides between them. Behaviour of the
// photo route: api/campaign-photo/[slug]/[athleteId]/route.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

register(new URL("../../team/[slug]/attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: PublicCampaignPage } = await import("./PublicCampaignPage.tsx");

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const noop = () => {};
const HANNAH = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

function props(over: Record<string, unknown> = {}) {
  return {
    slug: "falcons-track-2027", schoolName: "Monroe Valley High School", sportName: "Track and Field", mascot: "Falcons",
    themePrimaryColor: "#0b3d91", location: "Phoenix, AZ", season: "2027 Season", logoUrl: "https://cdn.example.test/logo.png",
    description: "Support the Monroe Valley High School Track and Field program.",
    raised: 9335, donors: 9, goal: 12000, daysLeft: 96, percent: 78,
    athletes: [
      { id: HANNAH, rank: 1, name: "Hannah Gray", event: "800m", class_year: "Junior", raised: 300 },
      { id: OTHER, rank: 2, name: "Sam Senior", event: null, class_year: "Other", raised: 0 },
    ],
    filteredAthletes: [], filters: ["Overall"], activeFilter: "Overall", setActiveFilter: noop,
    coaches: [], allowCoachFundraising: false, selectedCoachId: "",
    selectAthleteParticipant: noop, selectCoachParticipant: noop,
    participantFilter: "All" as const, setParticipantFilter: noop,
    recentDonations: [], communityPartners: null, missionItems: [],
    showLeaderboard: true, showFundUses: false, showRecentDonations: true, showDonationCard: true,
    selectedAmount: "$50", setSelectedAmount: noop, customAmount: "", setCustomAmount: noop,
    donorName: "", setDonorName: noop, selectedAthleteId: "", donationMessage: "", setDonationMessage: noop,
    donating: false, donateError: "", donateLabel: "Donate $50 to the Falcons →", handleDonate: noop,
    searchQuery: "", setSearchQuery: noop, leaderboardExpanded: false, setLeaderboardExpanded: noop,
    donationsExpanded: false, setDonationsExpanded: noop, hasMoreDonations: false,
    ...over,
  };
}
const render = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(PublicCampaignPage, props(over)));
const athletePage = (over: Record<string, unknown> = {}) => render({
  spotlight: { id: HANNAH, name: "Hannah Gray", classYear: "Junior" },
  selectedAthleteId: HANNAH, donateLabel: "Donate $50 for Hannah Gray →", ...over,
});
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

test("athlete link: spotlight + exactly ONE donation form, team card underneath without a form", () => {
  const html = athletePage();
  assert.equal(count(html, /class="pc-donate-card"/g), 1, "one donation form");
  assert.equal(count(html, /<select/g), 1, "one attribution dropdown");
  assert.equal(count(html, /class="pc-donate-btn"/g), 1);
  assert.equal(count(html, /id="pc-donate"/g), 1);
  const spotlight = html.indexOf('class="pc-ath"'), team = html.indexOf('class="pc-ath-team"'), form = html.indexOf('class="pc-donate-card"');
  assert.ok(spotlight >= 0 && spotlight < form && form < team, "spotlight → form → team card");
  assert.ok(!html.includes('class="pc-hero"'), "no general hero");
  const teamCard = html.slice(team, html.indexOf("</section>", team));
  assert.ok(!teamCard.includes("pc-donate") && !teamCard.includes("<select"), "no form in the team section");
});

test("athlete link: name, grade, sport, school, support message and personalized button", () => {
  const html = athletePage();
  assert.match(html, /<h1 class="pc-ath-name">Hannah Gray<\/h1>/);
  assert.ok(html.includes("Junior • Track and Field"));
  assert.ok(html.includes("<strong>Junior</strong><span>Grade Level</span>"));
  assert.ok(html.includes("<strong>Track and Field</strong><span>Sport</span>"));
  assert.ok(html.includes("<strong>Monroe Valley High School</strong><span>School</span>"));
  assert.ok(html.includes("Help Hannah and the Falcons reach their fundraising goals this season."));
  assert.match(html, /<h2>Support Hannah Gray<\/h2>/);
  assert.ok(html.includes("Donate $50 for Hannah Gray →"));
  assert.match(html, /<option value="athlete:00000000-0000-4000-8000-000000000001" selected="">Hannah Gray<\/option>/, "attributed to the athlete");
  assert.match(html, /<h2 class="pc-hero-title">Track and Field <em>Falcons<\/em><\/h2>/, "team title is h2 under the athlete's h1");
  assert.equal(count(html, /<h1/g), 1);
});

test("athlete link: team card keeps logo, school, season, description, raised, goal, progress, donations, days left", () => {
  const html = athletePage();
  const card = html.slice(html.indexOf('class="pc-ath-team-card"'));
  for (const s of ['src="https://cdn.example.test/logo.png"', "Monroe Valley High School", "2027 Season Fundraiser",
    "Support the Monroe Valley High School Track and Field program.", "$9,335", "of $12,000 goal", "width:78%", "78%",
    "<strong>9</strong><span>Donations</span>", "<strong>96</strong><span>Days Left</span>"]) {
    assert.ok(card.includes(s), s);
  }
  for (const id of ['id="pc-team"', 'id="pc-updates"', 'id="pc-contact"']) assert.ok(html.includes(id), `rest of the page kept: ${id}`);
});

test("athlete photo comes from the public photo route; storage URLs never appear", () => {
  const html = athletePage();
  assert.ok(html.includes(`src="/api/campaign-photo/falcons-track-2027/${HANNAH}" alt="Hannah Gray" class="pc-ath-photo"`));
  assert.ok(!html.includes("storage/v1") && !html.includes("profile-photos") && !html.includes("athlete-photos"));
  const imgs = html.match(/<img [^>]*>/g) ?? [];
  for (const img of imgs) {
    assert.ok(/\/marketing\/brand\/elf-logo-[a-z-]+\.png|\/api\/campaign-photo\/|cdn\.example\.test\/logo\.png/.test(img), `only athlete photo / team logo / ELF brand mark: ${img}`);
  }
});

test("missing or non-standard grade → grade omitted everywhere, nothing invented", () => {
  for (const classYear of [null, "Other", "RS Sophomore"]) {
    const html = athletePage({ spotlight: { id: HANNAH, name: "Hannah Gray", classYear } });
    assert.ok(!html.includes("Grade Level"), String(classYear));
    assert.ok(html.includes('<p class="pc-ath-sub">Track and Field</p>'), String(classYear));
    assert.equal(count(html, /<li>/g), 2, "sport + school only");
  }
});

test("general team link: unchanged team hero with its one form, no spotlight", () => {
  const html = render();
  assert.ok(html.includes('class="pc-hero"') && !html.includes("pc-ath"), "no athlete spotlight");
  assert.equal(count(html, /class="pc-donate-card"/g), 1);
  assert.equal(count(html, /<select/g), 1);
  assert.match(html, /<h2>Support the Falcons<\/h2>/);
  assert.match(html, /<h1 class="pc-hero-title">Track and Field <em>Falcons<\/em><\/h1>/);
  assert.match(html, /<option value="" selected="">— Team General Fund —<\/option>/);
  assert.ok(!html.includes("/api/campaign-photo/"));
});

test("athlete link while the roster is loading: reserved spotlight layout, still one form", () => {
  const html = render({ spotlightPending: true });
  assert.ok(html.includes('class="pc-ath-skeleton"') && html.includes('aria-busy="true"'));
  assert.equal(count(html, /class="pc-donate-card"/g), 1);
  assert.ok(!html.includes('class="pc-hero"'));
});

test("campaign with the donation card hidden: spotlight alone, no form anywhere", () => {
  const html = athletePage({ showDonationCard: false });
  assert.equal(count(html, /pc-donate-card/g), 0);
  assert.ok(html.includes("pc-ath-grid pc-ath-grid--solo"));
});

test("CampaignPageClient: spotlight only for an exact roster match; checkout payload unchanged", () => {
  const src = read("./CampaignPageClient.tsx");
  assert.match(src, /const spotlightMatch = resolveSpotlightAthlete\(athleteParam, athletes\);/);
  assert.match(src, /const spotlightPending = !statsLoaded && isAthleteId\(athleteParam\);/);
  assert.match(src, /\.finally\(\(\) => setStatsLoaded\(true\)\)/);
  // attribution still flows through the existing id-validated preselect + /api/checkout body
  assert.match(src, /if \(athleteParam && athletes\.some\(\(a\) => a\.id === athleteParam\)\) \{/);
  assert.match(src, /athleteId:\s+selectedAthleteId\s+\|\| null,/);
  assert.match(src, /fetch\("\/api\/checkout", \{/);
  // archived / fundraising-off states still win over any athlete link
  assert.ok(src.indexOf("if (archived)") < src.indexOf("<PublicCampaignPage"));
  assert.ok(src.indexOf("if (!fundraisingEnabled)") < src.indexOf("<PublicCampaignPage"));
});

test("responsive CSS: two columns on desktop, stacked under 900px, compact phone layout, no overflow", () => {
  const css = read("./campaign.css");
  assert.match(css, /\.pc-ath-grid \{\n  display: grid;\n  grid-template-columns: minmax\(0, 1fr\) minmax\(320px, 400px\);/);
  assert.match(css, /@media \(max-width: 900px\) \{\n  \.pc-ath-grid \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*\.pc-ath-top \{ grid-template-columns: 112px minmax\(0, 1fr\);/);
  assert.match(css, /\.pc-ath-photo \{[^}]*aspect-ratio: 4 \/ 5;[^}]*object-fit: cover;/, "portrait, proportions kept");
  assert.match(css, /\.pc-ath-name \{[^}]*overflow-wrap: anywhere;/, "long names wrap");
  assert.ok(!/url\(/.test(css.slice(css.indexOf("PERSONALIZED ATHLETE PAGE"))), "no background imagery");
});

test("spotlight adapts to its own width (container query), so it never cramps beside the form", () => {
  const css = read("./campaign.css");
  assert.match(css, /\.pc-ath-spotlight \{[^}]*container: pc-ath \/ inline-size;/);
  assert.match(css, /@container pc-ath \(max-width: 560px\) \{[^@]*\.pc-ath-msg--wide \{ display: none; \}[^@]*\.pc-ath-msg--narrow \{ display: block; \}/);
  // phone rules come after the container rule so they win on phones
  assert.ok(css.indexOf("@container pc-ath") < css.indexOf("@media (max-width: 600px) {\n  .pc-ath {"));
});
