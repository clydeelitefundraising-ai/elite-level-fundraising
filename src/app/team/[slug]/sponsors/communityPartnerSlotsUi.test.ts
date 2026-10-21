// ELF Community Partners — the 21 visible advertising positions, as
// rendered (server markup via react-dom/server, through the same TSX test
// loader the attendance screen tests use). Covers all three surfaces that
// show the Community Partners inventory: the Team App Home grid (mobile
// Home + desktop Coach Dashboard share CommunityPartnerGrid), the Team App
// Partners tab (same tile grid), and the public campaign page. The slot
// rules themselves are unit-tested in lib/platform/communityPartnerSlots.test.ts.
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
const SLOT_ITEM = /<li[^>]*data-slot="(partner|available)"/g;
const REAL_SLOT = /data-slot="partner"/g;
const OPEN_SLOT = /data-slot="available"/g;
const A11Y_LABEL = "Open advertising position";

/** Each blank <li>'s markup. */
function blanks(html: string): string[] {
  return html.match(/<li[^>]*data-slot="available"[\s\S]*?<\/li>/g) ?? [];
}

/** What a sighted user sees in a blank: its markup minus the one
 *  visually-hidden screen-reader label. */
function visibleContent(blank: string): string {
  return blank.replace(/<span (?:class="pc-visually-hidden"|style="position:absolute[^"]*")>Open advertising position<\/span>/, "");
}

function assertSlots(html: string, realCount: number, blankCount: number) {
  assert.equal(count(html, SLOT_ITEM), realCount + blankCount, "total positions");
  assert.equal(count(html, REAL_SLOT), realCount, "real advertisements");
  assert.equal(count(html, OPEN_SLOT), blankCount, "blank positions");
  for (const blank of blanks(html)) {
    assert.ok(blank.includes(A11Y_LABEL), "a blank position keeps a screen-reader label");
    const visible = visibleContent(blank);
    assert.ok(!/<a[\s>]/.test(visible) && !/href=/.test(visible), "a blank position is never a link");
    assert.ok(!/<svg|<img/.test(visible), "a blank position has no icon or image");
    assert.equal(visible.replace(/<[^>]*>/g, "").trim(), "", "a blank position shows no text");
  }
  assert.ok(!html.includes("Your Business Here"), "the old placeholder copy is gone");
}

// ── Team App Home grid (mobile Home + desktop Coach Dashboard) ──────────────

function gridSlots(partners: Partner[]) {
  return partners.map((p, i) => ({ position: i + 1, partner: { ...p, locked_position: null } }));
}
const renderGrid = (partners: Partner[]) => renderToStaticMarkup(createElement(CommunityPartnerGrid, { slots: gridSlots(partners) }));

for (const [n, open] of [[0, 21], [1, 20], [5, 16], [20, 1], [21, 0]] as const) {
  test(`Home grid: ${n} partner(s) -> ${n} advertisement(s) + ${open} blank position(s)`, () => {
    assertSlots(renderGrid(many(n)), n, open);
  });
}

test("Home grid: each partner appears exactly once, in resolveGridSlots' order, with its own link (new tab, noopener)", () => {
  const html = renderGrid([partner(3), partner(1), partner(2)]);
  const names = [...html.matchAll(/Partner Business (\d)/g)].map(m => m[1]);
  assert.deepEqual(names, ["3", "1", "2"]); // no logos: one name label per card
  for (const n of [1, 2, 3]) {
    assert.ok(html.includes(`href="https://partner${n}.example.com" target="_blank" rel="noopener noreferrer"`), `partner ${n} link`);
  }
  assert.ok(html.indexOf("Partner Business 2") < html.indexOf(A11Y_LABEL), "real partners come first");
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
  assertSlots(html, 3, 18);
});

test("Home grid (mobile): 96px auto-fill columns — three per row on a phone, 21 = seven full rows; blank tiles keep the partner tile's size", () => {
  const html = renderGrid(many(1));
  assert.ok(/<ul aria-label="ELF Community Partners"/.test(html));
  assert.ok(html.includes("grid-template-columns:repeat(auto-fill, minmax(96px, 1fr))"));
  assert.ok(/min-width:0/.test(html), "cells may shrink rather than overflow");
  assert.equal(21 % 3, 0, "21 positions fill complete rows of three");
  const realTile = html.match(/<li[^>]*data-slot="partner"[\s\S]*?<div style="([^"]*)"/)?.[1] ?? "";
  const blankTile = blanks(html)[0].match(/<div style="([^"]*)"/)?.[1] ?? "";
  for (const prop of ["min-height:96px", "border-radius:12px", "padding:.6rem .4rem .5rem", "border:1px solid var(--border-app)"]) {
    assert.ok(realTile.includes(prop), `partner tile: ${prop}`);
    assert.ok(blankTile.includes(prop), `blank tile: ${prop}`);
  }
});

test("Home: mobile HomeView and desktop CoachDashboard show the section whenever advertising is on, even with no partner", () => {
  for (const file of ["src/app/team/[slug]/home/HomeView.tsx", "src/app/team/[slug]/home/CoachDashboard.tsx"]) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    assert.ok(/\{communityPartnerGridSlots && \(/.test(src), `${file}: gate on advertising on (non-null), not on a partner count`);
    assert.ok(!/communityPartnerGridSlots\.length > 0/.test(src), `${file}: no longer hidden when empty`);
  }
  const page = readFileSync(join(process.cwd(), "src/app/team/[slug]/home/page.tsx"), "utf8");
  assert.ok(/let communityPartnerGridSlots: GridSlot\[\] \| null = null;/.test(page), "page.tsx: null (no section) unless advertising is on");
  assert.ok(/if \(showCommunityPartners\) \{/.test(page), "page.tsx: still gated on the school's app advertising toggle");
});

// ── Team App Partners tab ───────────────────────────────────────────────────

const renderList = (partners: Partner[], featured: string[] = []) =>
  renderToStaticMarkup(createElement(CommunityPartnersListView, { partners: partners.map(p => ({ ...p, is_featured: featured.includes(p.id) })) }));

for (const [n, open] of [[0, 21], [1, 20], [5, 16], [20, 1], [21, 0]] as const) {
  test(`Partners tab: ${n} partner(s) -> ${n} advertisement(s) + ${open} blank position(s)`, () => {
    assertSlots(renderList(many(n)), n, open);
  });
}

test("Partners tab: the same compact three-per-row tile grid as Home, not full-width stacked cards", () => {
  const html = renderList(many(2));
  assert.ok(html.includes("grid-template-columns:repeat(auto-fill, minmax(96px, 1fr))"));
  assert.ok(!html.includes("minmax(min(100%, 300px)"), "no full-width single-column list on phones");
});

test("Partners tab: more than 21 active partners are all shown (display_order kept), no blanks", () => {
  const html = renderList(many(23));
  assertSlots(html, 23, 0);
  assert.ok(html.indexOf("Partner Business 22") < html.indexOf("Partner Business 23"));
  assert.ok(html.includes("23 partners"));
});

test("Partners tab: real partners keep their link and featured marking; no website = no link", () => {
  const html = renderList([partner(1), partner(2, { website_url: null })], ["cp-1"]);
  assert.ok(html.includes('href="https://partner1.example.com" target="_blank" rel="noopener noreferrer"'));
  assert.ok(html.includes("Featured"));
  assert.equal(count(html, /<a /g), 1);
  assert.ok(html.includes("2 partners"));
  assertSlots(html, 2, 19);
});

test("Partners tab: with no partners yet, the explanatory line stays and no partner count is shown", () => {
  const html = renderList([]);
  assert.ok(html.includes("Our community partners help keep ELF Team free"));
  assert.ok(!/\d+ partners?</.test(html));
  assert.ok(!html.includes("No partners yet"));
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

for (const [n, open] of [[0, 21], [1, 20], [5, 16], [20, 1], [21, 0]] as const) {
  test(`Public campaign: ${n} partner(s) -> ${n} advertisement(s) + ${open} blank position(s)`, () => {
    assertSlots(renderCampaign(many(n)), n, open);
  });
}

test("Public campaign: real partners keep their existing links and order; blanks use the shared card box", () => {
  const html = renderCampaign([partner(2), partner(1, { website_url: null })]);
  assert.ok(html.includes('href="https://partner2.example.com" target="_blank" rel="noopener noreferrer" class="pc-sponsor-card"'));
  assert.ok(html.indexOf("Partner Business 2") < html.indexOf("Partner Business 1"));
  assert.ok(blanks(html)[0].includes('class="pc-sponsor-card pc-sponsor-card--available"'));
  assertSlots(html, 2, 19);
});

test("Public campaign: advertising off (null) -> no partner section and no Community Partners nav links", () => {
  const html = renderCampaign(null);
  assert.equal(count(html, SLOT_ITEM), 0);
  assert.ok(!html.includes('id="pc-partners"'));
  assert.ok(!html.includes('href="#pc-partners"'));
});

test("Public campaign: advertising on with no partner -> section and nav links shown with 21 blank positions", () => {
  const html = renderCampaign([]);
  assert.ok(html.includes('id="pc-partners"'));
  assert.ok(html.includes('href="#pc-partners"'));
  assertSlots(html, 0, 21);
});

test("Public campaign: donation form, progress, recent support and footer are unaffected by the partner section", () => {
  for (const partners of [null, [], many(21)]) {
    const html = renderCampaign(partners);
    assert.ok(html.includes('id="pc-donate"'), "donation section");
    assert.ok(html.includes("Donate $50"), "donate button label");
    assert.ok(html.includes("Pat Donor"), "recent support");
    assert.ok(html.includes("pc-footer"), "footer");
  }
});

test("Public campaign CSS: three columns on phones, auto-fill wider up, blank card = same box with a hidden label", () => {
  const css = readFileSync(join(process.cwd(), "src/app/campaign/_shared/campaign.css"), "utf8").replace(/\r\n/g, "\n");
  const grid = css.match(/\.pc-sponsor-grid \{[^}]*\}/)?.[0] ?? "";
  assert.ok(grid.includes("repeat(auto-fill, minmax(min(100%, 120px), 1fr))"), "min(100%, …) can never force a column wider than the container");
  assert.ok(/@media \(max-width: 480px\) \{[^@]*\.pc-sponsor-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/.test(css), "three columns on phones");
  assert.ok(/\.pc-sponsor-grid > li \{ min-width: 0; display: flex; \}/.test(css));
  assert.ok(/\.pc-sponsor-card \{[^}]*min-height: 7rem;/.test(css), "every card, blank or not, has the same minimum height");
  const blank = css.match(/\.pc-sponsor-card--available \{[^}]*\}/)?.[0] ?? "";
  assert.ok(!/border-style|dashed/.test(blank), "a blank card keeps the real card's subtle solid border");
  assert.ok(/\.pc-visually-hidden \{[^}]*clip: rect\(0, 0, 0, 0\);/.test(css));
  assert.ok(/\.pc-sponsor-name \{[^}]*overflow-wrap: anywhere;/.test(css), "long business names wrap instead of overflowing");
});

// ── Unchanged neighbours ───────────────────────────────────────────────────

test("Team Sponsors and the Featured Partner banner are untouched by the 21-slot treatment", () => {
  for (const file of ["src/app/team/[slug]/sponsors/SponsorsView.tsx", "src/app/team/[slug]/home/FeaturedPartnerBanner.tsx"]) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    assert.ok(!src.includes("communityPartnerSlots"), `${file} must not use the slot helper`);
    assert.ok(!src.includes("CommunityPartnerTiles"), `${file} must not use the tile grid`);
  }
});
