// ELF Community Partners — the 21 advertising positions and their cards,
// as rendered (server markup via react-dom/server, through the same TSX
// test loader the attendance screen tests use; CSS-module class names
// render as their keys, e.g. class="card partner link"). Covers the shared
// card component and all three surfaces that show it: the Team App Home
// grid (mobile Home + desktop Coach Dashboard share CommunityPartnerGrid),
// the Partners tab, and the public campaign page. The slot rules are
// unit-tested in lib/platform/communityPartnerSlots.test.ts, the rotation
// in communityPartnerRotation.test.ts.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: CommunityPartnerSlots } = await import("../../../../components/communityPartners/CommunityPartnerSlots.tsx");
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
    website_url: `https://partner${n}.example.com`, logo_url: `https://cdn.example.com/logo${n}.png`, ...overrides,
  };
}
const many = (n: number) => Array.from({ length: n }, (_, i) => partner(i + 1));

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const CSS = read("src/components/communityPartners/CommunityPartnerSlots.module.css");
/** One CSS rule's body (first match). */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return CSS.match(new RegExp(`${escaped} \\{([^}]*)\\}`))?.[1] ?? "";
}

function count(html: string, needle: RegExp): number {
  return (html.match(needle) ?? []).length;
}
const SLOT_ITEM = /<li[^>]*data-slot="(partner|available)"/g;
const REAL_SLOT = /data-slot="partner"/g;
const OPEN_SLOT = /data-slot="available"/g;
const A11Y_LABEL = "Open advertising position";

function items(html: string, kind: "partner" | "available"): string[] {
  return html.match(new RegExp(`<li[^>]*data-slot="${kind}"[\\s\\S]*?</li>`, "g")) ?? [];
}

function assertSlots(html: string, realCount: number, blankCount: number) {
  assert.equal(count(html, SLOT_ITEM), realCount + blankCount, "total positions");
  assert.equal(count(html, REAL_SLOT), realCount, "real advertisements");
  assert.equal(count(html, OPEN_SLOT), blankCount, "blank positions");
  for (const blank of items(html, "available")) {
    assert.ok(blank.includes('class="card empty"'), "a blank position is the shared card box");
    assert.ok(blank.includes(`<span class="visuallyHidden">${A11Y_LABEL}</span>`), "a blank position keeps its screen-reader label");
    const visible = blank.replace(`<span class="visuallyHidden">${A11Y_LABEL}</span>`, "");
    assert.ok(!/<a[\s>]|href=|<button/.test(visible), "a blank position is never a link or button");
    assert.ok(!/<svg|<img/.test(visible), "a blank position has no icon, logo or image");
    assert.equal(visible.replace(/<[^>]*>/g, "").trim(), "", "a blank position shows no text");
  }
  assert.ok(!html.includes("Your Business Here"));
}

// ── The shared card ────────────────────────────────────────────────────────

const renderSlots = (partners: (Partner & { is_featured?: boolean })[], variant: "app" | "public" = "app") =>
  renderToStaticMarkup(createElement(CommunityPartnerSlots, { partners, variant }));

test("occupied card with a website: the whole card is a safe external link — real logo, name, then a gray 'Visit ↗' cue", () => {
  const html = renderSlots([partner(1)]);
  const [card] = items(html, "partner");
  assert.ok(card.includes('<a href="https://partner1.example.com" target="_blank" rel="noopener noreferrer" aria-label="Visit Partner Business 1 (opens in a new tab)" class="card partner link">'));
  assert.ok(card.includes('<img src="https://cdn.example.com/logo1.png" alt="" class="logo"/>'), "the partner's own uploaded logo, decorative next to the printed name");
  assert.ok(card.includes('<span class="name">Partner Business 1</span>'));
  assert.ok(/<span class="visit" aria-hidden="true">Visit <svg[^>]*lucide-arrow-up-right/.test(card), "Visit text with the up-right arrow");
  const [logo, name, visit] = ["logoBox", '"name"', '"visit"'].map(k => card.indexOf(k));
  assert.ok(logo < name && name < visit, "logo, then name, then Visit");
});

test("occupied card without a (valid) website: logo and name, no Visit cue, no link", () => {
  for (const website_url of [null, "http://insecure.example.com", "javascript:alert(1)"]) {
    const [card] = items(renderSlots([partner(1, { website_url })]), "partner");
    assert.ok(card.includes('<div class="card partner">'), String(website_url));
    assert.ok(!/<a[\s>]|href=/.test(card), `${website_url}: not a link`);
    assert.ok(!card.includes("Visit"), `${website_url}: no Visit cue`);
    assert.ok(card.includes("logo1.png") && card.includes("Partner Business 1"));
  }
});

test("no logo uploaded: the business initial stands in, the name still shows", () => {
  const [card] = items(renderSlots([partner(1, { logo_url: null, business_name: "  acme Hardware " })]), "partner");
  assert.ok(card.includes('<span class="initial" aria-hidden="true">A</span>'));
  assert.ok(card.includes('<span class="name">acme Hardware</span>'));
  assert.ok(!card.includes("<img"));
});

test("wide, square and tall logos all use the same contained box (never cropped or stretched)", () => {
  const html = renderSlots([
    partner(1, { logo_url: "https://cdn.example.com/wide-600x150.png" }),
    partner(2, { logo_url: "https://cdn.example.com/square-300x300.png" }),
    partner(3, { logo_url: "https://cdn.example.com/tall-150x400.png" }),
  ]);
  for (const src of ["wide-600x150", "square-300x300", "tall-150x400"]) {
    assert.ok(html.includes(`<span class="logoBox"><img src="https://cdn.example.com/${src}.png" alt="" class="logo"/></span>`), src);
  }
  assert.ok(/object-fit: contain;/.test(rule(".logo")), "object-fit: contain");
  assert.ok(/max-width: 100%;/.test(rule(".logo")) && /max-height: 100%;/.test(rule(".logo")), "never larger than its box");
  assert.ok(/width: 66%;/.test(rule(".logoBox")), "the logo box is ~66% of the card's width");
  assert.ok(/flex: 1 1 0;/.test(rule(".logoBox")) && /min-height: 0;/.test(rule(".logoBox")), "the logo takes the height the name and Visit cue leave");
});

test("design: white card with a thin gold outline; blank = light neutral fill with a thin light-gray border; identical boxes", () => {
  const card = rule(".card");
  assert.ok(/aspect-ratio: 1 \/ 1;/.test(card), "every position is the same square box");
  assert.ok(/box-sizing: border-box;/.test(card), "border width never changes the outer size");
  assert.ok(/border-radius: 14px;/.test(card));
  assert.ok(/overflow: hidden;/.test(card), "nothing (long names, the Visit cue) can spill out of a card");
  assert.ok(/background: #fff;/.test(rule(".partner")) && /border: 1\.5px solid #D9A441;/.test(rule(".partner")));
  assert.ok(/background: #FAF9F6;/.test(rule(".empty")) && /border: 1px solid #E5E7EB;/.test(rule(".empty")));
  for (const sel of [".card", ".partner", ".empty"]) {
    assert.ok(!/box-shadow|gradient/.test(rule(sel)), `${sel}: no shadow or gradient at rest`);
  }
  assert.ok(/-webkit-line-clamp: 2;/.test(rule(".name")) && /overflow-wrap: anywhere;/.test(rule(".name")), "long names wrap, then truncate at two lines");
  assert.ok(/font-weight: 500;/.test(rule(".name")), "medium-weight name, not bold");
  assert.ok(/color: #6B7280;/.test(rule(".visit")), "subtle gray Visit cue");
});

test("interaction: gentle hover only on hover-capable devices, and a visible keyboard focus ring", () => {
  assert.ok(/@media \(hover: hover\) \{\s*\.link:hover \{[^}]*box-shadow: 0 2px 10px/.test(CSS));
  assert.ok(/\.link:focus-visible \{[^}]*outline: 2px solid #B7791F;/.test(CSS));
});

test("layout: three columns on phones (21 = seven full rows) with no horizontal overflow; app goes auto-fill from 640px (unchanged)", () => {
  assert.ok(/grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/.test(rule(".grid")));
  assert.ok(/min-width: 0;/.test(rule(".cell")) && /min-width: 0;/.test(rule(".card")));
  assert.ok(/@media \(min-width: 640px\) \{\s*\.gridApp \{\s*grid-template-columns: repeat\(auto-fill, minmax\(124px, 1fr\)\);/.test(CSS));
  assert.equal(21 % 3, 0);
  const app = renderSlots([], "app");
  assert.ok(app.startsWith('<ul aria-label="ELF Community Partners" class="grid gridApp">'), "the Team App grid has no extra wrapper");
  assert.ok(!app.includes("publicFrame"));
  for (const block of CSS.split("@container").slice(1)) {
    assert.ok(!block.slice(0, block.indexOf("\n}")).includes(".gridApp"), "no container query touches the Team App grid");
  }
  assert.ok(/@media \(min-width: 640px\) \{\s*\.gridApp \.card \{ gap: \.3rem; padding: \.65rem \.5rem \.55rem; \}\s*\.gridApp \.name \{ font-size: \.74rem; \}\s*\.gridApp \.visit \{ font-size: \.7rem; \}/.test(CSS), "Team App card text sizes unchanged");
});

test("public layout: columns follow the campaign column's width — three on phones, four on tablets, five on desktop", () => {
  const html = renderSlots([], "public");
  assert.ok(html.startsWith('<div class="publicFrame"><ul aria-label="ELF Community Partners" class="grid gridPublic">'));
  assert.ok(/container-type: inline-size;/.test(rule(".publicFrame")), "the wrapper is the size container");
  // Phones (column under 420px): no query matches -> the shared three columns.
  assert.ok(/@container \(min-width: 420px\) \{\s*\.gridPublic \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);\s*gap: \.7rem;/.test(CSS), "tablet: four columns");
  assert.ok(/@container \(min-width: 520px\) \{\s*\.gridPublic \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); \}/.test(CSS), "desktop: five columns");
  // Later rules win: 3 (default) -> 4 -> 5.
  assert.ok(CSS.indexOf("repeat(3, minmax(0, 1fr))") < CSS.indexOf("repeat(4, minmax(0, 1fr))"));
  assert.ok(CSS.indexOf("repeat(4, minmax(0, 1fr))") < CSS.indexOf("repeat(5, minmax(0, 1fr))"));
  // 21 positions five across = four full rows + one card.
  assert.equal((html.match(/<li /g) ?? []).length, 21);
  assert.deepEqual([Math.floor(21 / 5), 21 % 5], [4, 1]);
  // Equal cards: equal minmax(0, 1fr) columns, no card spans or is placed on its own.
  assert.ok(!/grid-column|grid-row|span \d/.test(CSS));
  // A ~540px desktop column holds five ~100px cards, so the larger text waits for ~140px cards.
  assert.ok(/@container \(min-width: 720px\) \{\s*\.gridPublic \.card \{/.test(CSS));
});

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

test("Home grid: the shared cards, each partner exactly once, in resolveGridSlots' order", () => {
  const html = renderGrid([partner(3), partner(1), partner(2)]);
  assert.ok(html.includes('class="grid gridApp"'));
  assert.deepEqual([...html.matchAll(/<span class="name">Partner Business (\d)<\/span>/g)].map(m => m[1]), ["3", "1", "2"]);
  assert.ok(html.indexOf("Partner Business 2") < html.indexOf(A11Y_LABEL), "real partners come first");
});

test("Home: mobile HomeView and desktop CoachDashboard show the section whenever advertising is on, even with no partner", () => {
  for (const file of ["src/app/team/[slug]/home/HomeView.tsx", "src/app/team/[slug]/home/CoachDashboard.tsx"]) {
    const src = read(file);
    assert.ok(/\{communityPartnerGridSlots && \(/.test(src), `${file}: gate on advertising on (non-null), not on a partner count`);
  }
  const page = read("src/app/team/[slug]/home/page.tsx");
  assert.ok(/let communityPartnerGridSlots: GridSlot\[\] \| null = null;/.test(page));
  assert.ok(/if \(showCommunityPartners\) \{/.test(page), "still gated on the school's app advertising toggle");
});

// ── Team App Partners tab ───────────────────────────────────────────────────

const renderList = (partners: Partner[], featured: string[] = []) =>
  renderToStaticMarkup(createElement(CommunityPartnersListView, { partners: partners.map(p => ({ ...p, is_featured: featured.includes(p.id) })) }));

for (const [n, open] of [[0, 21], [1, 20], [5, 16], [20, 1], [21, 0]] as const) {
  test(`Partners tab: ${n} partner(s) -> ${n} advertisement(s) + ${open} blank position(s)`, () => {
    assertSlots(renderList(many(n)), n, open);
  });
}

test("Partners tab: the same shared cards and grid as Home; featured partners keep their Featured marker", () => {
  const html = renderList([partner(1), partner(2, { website_url: null })], ["cp-1"]);
  assert.ok(html.includes('class="grid gridApp"'));
  assert.ok(html.includes('<span class="featured">Featured</span>'));
  assert.equal(count(html, /<span class="featured">/g), 1, "only the featured partner");
  assert.equal(count(html, /<a /g), 1, "no website = no link");
  assert.ok(html.includes("2 partners"), "existing partner count unchanged");
  assertSlots(html, 2, 19);
});

test("Partners tab: more than 21 active partners are all shown (display_order kept), no blanks", () => {
  const html = renderList(many(23));
  assertSlots(html, 23, 0);
  assert.ok(html.indexOf("Partner Business 22") < html.indexOf("Partner Business 23"));
  assert.ok(html.includes("23 partners"));
});

test("Partners tab: heading and explanatory line unchanged; no new availability counter", () => {
  const empty = renderList([]);
  assert.ok(empty.includes("ELF Community Partners</h2>"));
  assert.ok(empty.includes("Our community partners help keep ELF Team free"));
  for (const html of [empty, renderList(many(1))]) {
    assert.ok(!/Positions? Available|positions? available/.test(html), "no availability counter");
  }
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

test("Public campaign: the same shared cards in the responsive public grid, real links and API order kept", () => {
  const html = renderCampaign([partner(2), partner(1, { website_url: null })]);
  assert.ok(html.includes('<div class="publicFrame"><ul aria-label="ELF Community Partners" class="grid gridPublic">'));
  assert.ok(html.includes('<a href="https://partner2.example.com" target="_blank" rel="noopener noreferrer" aria-label="Visit Partner Business 2 (opens in a new tab)" class="card partner link">'));
  assert.ok(html.indexOf("Partner Business 2") < html.indexOf("Partner Business 1"));
  assertSlots(html, 2, 19);
});

test("Public campaign: advertising off (null) -> no partner section and no Community Partners nav links", () => {
  const html = renderCampaign(null);
  assert.equal(count(html, SLOT_ITEM), 0);
  assert.ok(!html.includes('id="pc-partners"'));
  assert.ok(!html.includes('href="#pc-partners"'));
});

test("Public campaign: advertising on with no partner -> section, heading, subcopy and nav links with 21 blank positions", () => {
  const html = renderCampaign([]);
  assert.ok(html.includes('id="pc-partners"') && html.includes('href="#pc-partners"'));
  assert.ok(html.includes("ELF Community Partners</h2>"));
  assert.ok(html.includes("Local businesses supporting Wolves HS Track."));
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

// ── Unchanged neighbours ───────────────────────────────────────────────────

test("Team Sponsors and the Featured Partner banner do not use the shared advertising cards", () => {
  for (const file of ["src/app/team/[slug]/sponsors/SponsorsView.tsx", "src/app/team/[slug]/home/FeaturedPartnerBanner.tsx"]) {
    const src = read(file);
    assert.ok(!src.includes("CommunityPartnerSlots"), `${file} must not use the shared cards`);
    assert.ok(!src.includes("communityPartnerSlots"), `${file} must not use the slot helper`);
  }
});
