// ELF Community Partners — the 20 visible advertising positions, as
// rendered (server markup via react-dom/server, through the same TSX test
// loader the attendance screen tests use). Covers all three surfaces that
// show the Community Partners inventory: the Team App Home grid (mobile
// Home + desktop Coach Dashboard share CommunityPartnerGrid), the Team App
// Partners tab, and the public campaign page. The slot rules themselves
// are unit-tested in lib/platform/communityPartnerSlots.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: CommunityPartnerGrid } = await import("../home/CommunityPartnerGrid.tsx");
const { default: CommunityPartnersListView } = await import("./CommunityPartnersListView.tsx");
const { default: PublicCampaignPage } = await import("../../../campaign/_shared/PublicCampaignPage.tsx");

type Partner = {
  id: string; business_name: string; short_description: string | null;
  website_url: string | null; logo_url: string | null;
};

function partner(n: number, overrides: Partial<Partner> = {}): Partner {
  return {
    id: `cp-${n}`, business_name: `Partner Business ${n}`, short_description: `Description ${n}`,
    website_url: `https://partner${n}.example.com`, logo_url: null, ...overrides,
  };
}
const many = (n: number) => Array.from({ length: n }, (_, i) => partner(i + 1));

function count(html: string, needle: RegExp): number {
  return (html.match(needle) ?? []).length;
}
const PLACEHOLDER = /Your Business Here/g;
const SLOT_ITEM = /<li[^>]*data-slot="(partner|available)"/g;
const REAL_SLOT = /data-slot="partner"/g;
const OPEN_SLOT = /data-slot="available"/g;

/** The markup of the "available" <li>s only. */
function availableMarkup(html: string): string {
  return (html.match(/<li[^>]*data-slot="available"[\s\S]*?<\/li>/g) ?? []).join("\n");
}

function assertSlots(html: string, realCount: number, openCount: number) {
  assert.equal(count(html, SLOT_ITEM), realCount + openCount, "total positions");
  assert.equal(count(html, REAL_SLOT), realCount, "real advertisements");
  assert.equal(count(html, OPEN_SLOT), openCount, "placeholders");
  assert.equal(count(html, PLACEHOLDER), openCount, "one 'Your Business Here' per placeholder");
  const open = availableMarkup(html);
  assert.ok(!/<a[\s>]/.test(open), "a placeholder is never a link");
  assert.ok(!/href=/.test(open), "a placeholder has no href");
  assert.ok(!/<img/.test(open), "a placeholder has no logo image");
  assert.ok(!/Partner Business/.test(open), "a placeholder never shows a partner's name");
}

// ── Team App Home grid (mobile Home + desktop Coach Dashboard) ──────────────

function gridSlots(partners: Partner[]) {
  return partners.map((p, i) => ({ position: i + 1, partner: { ...p, locked_position: null } }));
}
const renderGrid = (partners: Partner[]) => renderToStaticMarkup(createElement(CommunityPartnerGrid, { slots: gridSlots(partners) }));

for (const [n, open] of [[0, 20], [1, 19], [5, 15], [20, 0]] as const) {
  test(`Home grid: ${n} partner(s) -> ${n} advertisement(s) + ${open} placeholder(s)`, () => {
    assertSlots(renderGrid(many(n)), n, open);
  });
}

test("Home grid: partners keep resolveGridSlots' order and their own links (new tab, noopener)", () => {
  const html = renderGrid([partner(3), partner(1), partner(2)]);
  const names = [...html.matchAll(/Partner Business (\d)/g)].map(m => m[1]);
  assert.deepEqual(names, ["3", "1", "2"]); // no logos: one name label per card
  for (const n of [1, 2, 3]) {
    assert.ok(html.includes(`href="https://partner${n}.example.com" target="_blank" rel="noopener noreferrer"`), `partner ${n} link`);
  }
  assert.ok(html.indexOf("Partner Business 2") < html.indexOf("Your Business Here"), "real partners come first");
});

test("Home grid: a partner without a website, or with a malformed one, is shown unlinked; a logo renders as an image", () => {
  const html = renderGrid([
    partner(1, { website_url: null }),
    partner(2, { website_url: "javascript:alert(1)" }),
    partner(3, { logo_url: "https://cdn.example.com/logo3.png" }),
  ]);
  assert.equal(count(html, /<a /g), 1, "only the valid https partner is a link");
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes('src="https://cdn.example.com/logo3.png" alt="Partner Business 3"'));
  assertSlots(html, 3, 17);
});

test("Home grid: an accessible list, responsive auto-fill columns with no horizontal overflow", () => {
  const html = renderGrid(many(1));
  assert.ok(/<ul aria-label="ELF Community Partners"/.test(html));
  assert.ok(html.includes("grid-template-columns:repeat(auto-fill, minmax(96px, 1fr))"));
  assert.ok(/min-width:0/.test(html), "cells may shrink rather than overflow");
  assert.ok(/aria-hidden="true"/.test(availableMarkup(html)), "the decorative plus icon is hidden from screen readers");
});

test("Home: mobile HomeView and desktop CoachDashboard show the section whenever advertising is on, even with no partner", () => {
  for (const file of ["src/app/team/[slug]/home/HomeView.tsx", "src/app/team/[slug]/home/CoachDashboard.tsx"]) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    assert.ok(/\{communityPartnerGridSlots && \(/.test(src), `${file}: gate on advertising on (non-null), not on a partner count`);
    assert.ok(!/communityPartnerGridSlots\.length > 0/.test(src), `${file}: no longer hidden when empty`);
  }
  const page = readFileSync(join(process.cwd(), "src/app/team/[slug]/home/page.tsx"), "utf8");
  assert.ok(/let communityPartnerGridSlots: GridSlot\[\] \| null = null;/.test(page), "page.tsx: null (no section) unless advertising is on");
});

// ── Team App Partners tab ───────────────────────────────────────────────────

const renderList = (partners: Partner[]) =>
  renderToStaticMarkup(createElement(CommunityPartnersListView, { partners: partners.map(p => ({ ...p, is_featured: false })) }));

for (const [n, open] of [[0, 20], [1, 19], [5, 15], [20, 0]] as const) {
  test(`Partners tab: ${n} partner(s) -> ${n} advertisement(s) + ${open} placeholder(s)`, () => {
    assertSlots(renderList(many(n)), n, open);
  });
}

test("Partners tab: more than 20 active partners are all shown (display_order kept), no placeholders", () => {
  const html = renderList(many(23));
  assertSlots(html, 23, 0);
  assert.ok(html.indexOf("Partner Business 22") < html.indexOf("Partner Business 23"));
  assert.ok(html.includes("23 partners"));
});

test("Partners tab: real partners keep their card (name, description, link, featured badge)", () => {
  const html = renderToStaticMarkup(createElement(CommunityPartnersListView, {
    partners: [{ ...partner(1), is_featured: true }, { ...partner(2, { website_url: null }), is_featured: false }],
  }));
  assert.ok(html.includes('href="https://partner1.example.com" target="_blank" rel="noopener noreferrer"'));
  assert.ok(html.includes("Description 1"));
  assert.ok(html.includes("Featured"));
  assert.equal(count(html, /<a /g), 1, "a partner with no website is not a link");
  assert.ok(html.includes("2 partners"));
  assertSlots(html, 2, 18);
});

test("Partners tab: with no partners yet, the explanatory line stays and no partner count is shown", () => {
  const html = renderList([]);
  assert.ok(html.includes("Our community partners help keep ELF Team free"));
  assert.ok(!/\d+ partners?</.test(html));
  assert.ok(!html.includes("No partners yet"));
  assert.ok(html.includes("minmax(min(100%, 300px), 1fr)"), "one column on phones, two on wider screens");
});

// ── Public campaign page ────────────────────────────────────────────────────

const noop = () => {};
function campaignProps(communityPartners: Partner[] | null) {
  return {
    slug: "wolves", schoolName: "Wolves HS", sportName: "Track", mascot: "Wolves", themePrimaryColor: "#0b1e3d",
    location: "Phoenix, AZ", season: "Spring 2027", logoUrl: "", description: "Help fund our season.",
    raised: 1250, donors: 7, goal: 5000, daysLeft: 12, percent: 25,
    athletes: [], filteredAthletes: [], filters: ["All"], activeFilter: "All", setActiveFilter: noop,
    coaches: [], allowCoachFundraising: false, selectedCoachId: "",
    selectAthleteParticipant: noop, selectCoachParticipant: noop,
    participantFilter: "All" as const, setParticipantFilter: noop,
    recentDonations: [{ name: "Pat Donor", amount: 25, message: "", time: "2h" }],
    communityPartners,
    missionItems: [], showLeaderboard: true, showFundUses: false, showRecentDonations: true, showDonationCard: true,
    selectedAmount: "50", setSelectedAmount: noop, customAmount: "", setCustomAmount: noop,
    donorName: "", setDonorName: noop, selectedAthleteId: "", donationMessage: "", setDonationMessage: noop,
    donating: false, donateError: "", donateLabel: "Donate $50", handleDonate: noop,
    searchQuery: "", setSearchQuery: noop, leaderboardExpanded: false, setLeaderboardExpanded: noop,
    donationsExpanded: false, setDonationsExpanded: noop, hasMoreDonations: false,
  };
}
const renderCampaign = (partners: Partner[] | null) => renderToStaticMarkup(createElement(PublicCampaignPage, campaignProps(partners)));

for (const [n, open] of [[0, 20], [1, 19], [5, 15], [20, 0]] as const) {
  test(`Public campaign: ${n} partner(s) -> ${n} advertisement(s) + ${open} placeholder(s)`, () => {
    assertSlots(renderCampaign(many(n)), n, open);
  });
}

test("Public campaign: real partners keep their existing links and order; placeholders use the shared card styling", () => {
  const html = renderCampaign([partner(2), partner(1, { website_url: null })]);
  assert.ok(html.includes('href="https://partner2.example.com" target="_blank" rel="noopener noreferrer" class="pc-sponsor-card"'));
  assert.ok(html.indexOf("Partner Business 2") < html.indexOf("Partner Business 1"));
  assert.ok(availableMarkup(html).includes('class="pc-sponsor-card pc-sponsor-card--available"'));
  assertSlots(html, 2, 18);
});

test("Public campaign: advertising off (null) -> no partner section and no Community Partners nav links", () => {
  const html = renderCampaign(null);
  assert.equal(count(html, SLOT_ITEM), 0);
  assert.ok(!html.includes('id="pc-partners"'));
  assert.ok(!html.includes('href="#pc-partners"'));
});

test("Public campaign: advertising on with no partner -> section and nav links shown with 20 open positions", () => {
  const html = renderCampaign([]);
  assert.ok(html.includes('id="pc-partners"'));
  assert.ok(html.includes('href="#pc-partners"'));
  assertSlots(html, 0, 20);
});

test("Public campaign: donation form, progress, recent support and footer are unaffected by the partner section", () => {
  for (const partners of [null, [], many(20)]) {
    const html = renderCampaign(partners);
    assert.ok(html.includes('id="pc-donate"'), "donation section");
    assert.ok(html.includes("Donate $50"), "donate button label");
    assert.ok(html.includes("Pat Donor"), "recent support");
    assert.ok(html.includes("pc-footer"), "footer");
  }
});

test("Public campaign CSS: auto-fill columns that fit a 320px phone, equal-height cards, dashed placeholder", () => {
  const css = readFileSync(join(process.cwd(), "src/app/campaign/_shared/campaign.css"), "utf8").replace(/\r\n/g, "\n");
  const grid = css.match(/\.pc-sponsor-grid \{[^}]*\}/)?.[0] ?? "";
  assert.ok(grid.includes("repeat(auto-fill, minmax(min(100%, 140px), 1fr))"), "min(100%, …) can never force a column wider than the container");
  assert.ok(/\.pc-sponsor-grid > li \{ min-width: 0; display: flex; \}/.test(css));
  assert.ok(/\.pc-sponsor-card--available \{[^}]*border-style: dashed;/.test(css));
  assert.ok(/\.pc-sponsor-name \{[^}]*overflow-wrap: anywhere;/.test(css), "long business names wrap instead of overflowing");
});

// ── Unchanged neighbours ───────────────────────────────────────────────────

test("Team Sponsors and the Featured Partner banner are untouched by the 20-slot treatment", () => {
  for (const file of ["src/app/team/[slug]/sponsors/SponsorsView.tsx", "src/app/team/[slug]/home/FeaturedPartnerBanner.tsx"]) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    assert.ok(!src.includes("communityPartnerSlots"), `${file} must not use the 20-slot helper`);
    assert.ok(!src.includes("Your Business Here"), `${file} must not show placeholders`);
  }
});
