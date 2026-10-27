// Partners page UI — centred tab selector and the retired sponsorship
// levels. Structural checks on the two components (this repo has no
// component-rendering test framework; see partnersTabs.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const partnersView = read("./PartnersView.tsx");
const sponsorsView = read("./SponsorsView.tsx");

// ── Tab selector ──────────────────────────────────────────────────────────

const tablist = partnersView.slice(partnersView.indexOf('role="tablist"'), partnersView.indexOf("{tabs.map("));
const tabButton = partnersView.slice(partnersView.indexOf('role="tab"'), partnersView.indexOf("{label}"));

test("tab selector: a centred, full-width segmented control capped at 440px", () => {
  assert.match(tablist, /display: "flex", width: "100%", maxWidth: 440, boxSizing: "border-box"/);
  assert.match(tablist, /margin: "0 auto \.85rem"/);
  assert.ok(!tablist.includes("inline-flex"), "no longer a left-aligned inline-flex strip");
});

test("tab selector: tabs share the row, one line each, font steps down on narrow phones", () => {
  assert.match(tabButton, /flex: "1 1 auto",\s+minWidth: 0,/);
  assert.match(tabButton, /fontSize: "clamp\(\.7rem, 3\.5vw, \.875rem\)"/);
  assert.match(tabButton, /whiteSpace: "nowrap"/);
  assert.match(tabButton, /textAlign: "center"/);
});

test("tab selector: selected tab stays distinct; accessibility wiring unchanged", () => {
  assert.match(tabButton, /background: tab === key \? "#fff" : "transparent"/);
  assert.match(tabButton, /boxShadow: tab === key \? "0 1px 3px rgba\(0,0,0,\.1\)" : "none"/);
  assert.match(tabButton, /aria-selected=\{tab === key\}/);
  assert.match(tabButton, /aria-controls=\{`partners-panel-\$\{key\}`\}/);
});

test("tab selector: ELF Community Partners stays the default tab", () => {
  assert.match(partnersView, /resolveActivePartnersTab\(searchParams\.get\("tab"\), showCommunityPartners\)/);
});

// ── Retired sponsorship levels ────────────────────────────────────────────

test("Team Sponsors: no Gold / Silver / Bronze (or any level) labels, badges or colours", () => {
  for (const word of ['"Gold"', '"Silver"', '"Bronze"', "Title Sponsor", '"Platinum"', "TierBadge", "TIER_META", "TIER_ORDER"]) {
    assert.ok(!sponsorsView.includes(word), `SponsorsView must not contain ${word}`);
  }
  assert.ok(!/borderLeft: `3px solid/.test(sponsorsView), "no level-coloured card edge");
});

test("Team Sponsors: no level headings or grouping — one list in the coach's order", () => {
  assert.ok(!sponsorsView.includes("grouped"), "no grouping by level");
  assert.match(sponsorsView, /\{visibleSponsors\.map\(s => <PublicCard key=\{s\.id\} s=\{s\} \/>\)\}/);
});

test("Team Sponsors: the add/edit form has no level picker", () => {
  assert.ok(!/Tier \*/.test(sponsorsView));
  assert.ok(!/tier: t \}/.test(sponsorsView));
});

test("Team Sponsors: legacy tier values are kept, not cleared — edits send the stored value back", () => {
  assert.match(sponsorsView, /tier:\s+s\.tier,/, "fromRow keeps the stored tier");
  assert.match(sponsorsView, /tier:\s+f\.tier,/, "the request body still carries it");
  assert.match(sponsorsView, /const LEGACY_DEFAULT_TIER: Tier = "gold";/, "new sponsors: a valid value the API still requires");
});

test("Team Sponsors: management, amounts, contacts and visibility are unchanged", () => {
  assert.match(sponsorsView, /const canManage = isCoachOnly\(actor\) && !seasonReadOnly;/);
  assert.match(sponsorsView, /s\.sponsorship_amount_cents != null/);
  assert.match(sponsorsView, /\[s\.contact_name, s\.contact_email, s\.contact_phone\]/);
  assert.match(sponsorsView, /sponsors\.filter\(s => s\.visible\)/);
  assert.match(sponsorsView, /onMove=\{handleMove\}/);
});
