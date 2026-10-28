import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ABOUT_CHARS, aboutParagraphs, bannerPathPrefix, initials, isAllowedBannerMimeType, mapsHref,
  normalizeAbout, ownedBannerPath, resolveDisplayLocation, seasonLabel, validateLocation, withoutOverviewFields,
} from "./teamOverview.ts";

const SB = "https://abc.supabase.co";
const pub = (p: string) => `${SB}/storage/v1/object/public/team-branding-logos/${p}`;

// ── Banner ───────────────────────────────────────────────────────────────

test("banner: PNG/JPG/WebP only — SVG, GIF and HEIC are rejected", () => {
  for (const t of ["image/png", "image/jpeg", "image/webp"]) assert.ok(isAllowedBannerMimeType(t), t);
  for (const t of ["image/svg+xml", "image/gif", "image/heic", "text/html", ""]) assert.ok(!isAllowedBannerMimeType(t), t);
});

test("banner: a replace/remove only ever deletes this team's own banner objects", () => {
  assert.equal(bannerPathPrefix("lions-track-2027"), "lions-track-2027/banner/");
  assert.equal(ownedBannerPath(pub("lions-track-2027/banner/1-abc.webp"), SB, "lions-track-2027"), "lions-track-2027/banner/1-abc.webp");
  // another team's banner, this team's logo, another bucket, an external URL, traversal
  assert.equal(ownedBannerPath(pub("hawks-track-2027/banner/1-abc.webp"), SB, "lions-track-2027"), null);
  assert.equal(ownedBannerPath(pub("lions-track-2027/1-logo.png"), SB, "lions-track-2027"), null);
  assert.equal(ownedBannerPath(`${SB}/storage/v1/object/public/sponsor-logos/lions-track-2027/banner/x.webp`, SB, "lions-track-2027"), null);
  assert.equal(ownedBannerPath("https://evil.example/lions-track-2027/banner/x.webp", SB, "lions-track-2027"), null);
  assert.equal(ownedBannerPath(pub("lions-track-2027/banner/../logo.png"), SB, "lions-track-2027"), null);
  assert.equal(ownedBannerPath(pub("lions-track-2027/banner/sub/x.webp"), SB, "lions-track-2027"), null);
  assert.equal(ownedBannerPath(null, SB, "lions-track-2027"), null);
});

// ── About ────────────────────────────────────────────────────────────────

test("about: keeps paragraphs and line breaks, normalizes CRLF and trailing spaces", () => {
  const r = normalizeAbout("  First line\r\nsecond line   \r\n\r\n\r\n\r\nNew paragraph.  \n");
  assert.deepEqual(r, { ok: true, value: "First line\nsecond line\n\nNew paragraph." });
});

test("about: blank -> null (empty state); null clears", () => {
  assert.deepEqual(normalizeAbout("   \n\n "), { ok: true, value: null });
  assert.deepEqual(normalizeAbout(null), { ok: true, value: null });
});

test("about: limit is enforced; non-text rejected", () => {
  assert.equal(normalizeAbout("a".repeat(MAX_ABOUT_CHARS)).ok, true);
  const over = normalizeAbout("a".repeat(MAX_ABOUT_CHARS + 1));
  assert.equal(over.ok, false);
  assert.match((over as { error: string }).error, /3,000 characters/);
  assert.equal(normalizeAbout(42).ok, false);
  assert.equal(normalizeAbout({ html: "<b>" }).ok, false);
});

test("about: markup is kept as literal text (rendered as text, never HTML)", () => {
  const r = normalizeAbout("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
  assert.deepEqual(r, { ok: true, value: "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>" });
  assert.deepEqual(aboutParagraphs((r as { value: string }).value), ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"]);
});

test("about: paragraphs split on blank lines, single breaks stay in the paragraph", () => {
  assert.deepEqual(aboutParagraphs("One\ntwo\n\nThree\n   \nFour"), ["One\ntwo", "Three", "Four"]);
  assert.deepEqual(aboutParagraphs(null), []);
});

// ── Location ─────────────────────────────────────────────────────────────

test("location: valid input -> patch for the 3 team columns (blank -> null, city/state -> '')", () => {
  assert.deepEqual(validateLocation({ street: " 800  Lion Drive ", city_state: "Phoenix, AZ", zip: "85001" }),
    { ok: true, value: { location_street: "800 Lion Drive", location: "Phoenix, AZ", location_zip: "85001" } });
  assert.deepEqual(validateLocation({ street: "", city_state: "", zip: "" }),
    { ok: true, value: { location_street: null, location: "", location_zip: null } });
  assert.deepEqual(validateLocation({ street: "", city_state: "Toronto, ON", zip: "M5V 2T6" }),
    { ok: true, value: { location_street: null, location: "Toronto, ON", location_zip: "M5V 2T6" } });
});

test("location: rejects bad shapes, over-long fields, odd ZIPs and a street without a city", () => {
  for (const bad of [null, "Phoenix", { street: 1, city_state: "", zip: "" }, { street: "", city_state: "", zip: "<b>" },
    { street: "x".repeat(121), city_state: "A", zip: "" }, { street: "", city_state: "x".repeat(81), zip: "" },
    { street: "", city_state: "A", zip: "12345678901" }, { street: "1 Main St", city_state: "", zip: "" }]) {
    assert.equal(validateLocation(bad).ok, false, JSON.stringify(bad));
  }
});

test("location display: team street/ZIP wins, then school street, then team city, then school city", () => {
  const org = { address: "1 School Rd", city: "Mesa", state: "AZ", zip: "85201" };
  assert.deepEqual(resolveDisplayLocation({ school_name: "QA Lions HS", location: "Phoenix, AZ", location_street: "800 Lion Dr", location_zip: "85001" }, org),
    { lines: ["800 Lion Dr", "Phoenix, AZ 85001"], source: "team", query: "800 Lion Dr, Phoenix, AZ 85001" });
  assert.deepEqual(resolveDisplayLocation({ school_name: "QA Lions HS", location: "Phoenix, AZ" }, org),
    { lines: ["1 School Rd", "Mesa, AZ 85201"], source: "school", query: "1 School Rd, Mesa, AZ 85201" });
  assert.deepEqual(resolveDisplayLocation({ school_name: "QA Lions HS", location: "Phoenix, AZ" }, { address: "", city: "", state: "", zip: "" }),
    { lines: ["Phoenix, AZ"], source: "team", query: "QA Lions HS, Phoenix, AZ" });
  assert.deepEqual(resolveDisplayLocation({ school_name: "QA Lions HS", location: "" }, { city: "Mesa", state: "AZ" }),
    { lines: ["Mesa, AZ"], source: "school", query: "QA Lions HS, Mesa, AZ" });
  assert.deepEqual(resolveDisplayLocation({ school_name: "QA Lions HS", location: "" }, null), { lines: [], source: "none", query: "" });
});

test("maps link: Apple Maps on Apple devices, Google Maps elsewhere; query is URL-encoded", () => {
  assert.equal(mapsHref("800 Lion Dr, Phoenix, AZ", true), "https://maps.apple.com/?q=800%20Lion%20Dr%2C%20Phoenix%2C%20AZ");
  assert.equal(mapsHref("A&B", false), "https://www.google.com/maps/search/?api=1&query=A%26B");
});

// ── Banner text ──────────────────────────────────────────────────────────

test("season label and initials", () => {
  assert.equal(seasonLabel("2027 Season"), "2027 Season");
  assert.equal(seasonLabel("26-27 Season"), "26-27 Season");
  assert.equal(seasonLabel("Fall"), "Fall Season");
  assert.equal(seasonLabel(""), "");
  assert.equal(initials("QA Lions High School"), "QL");
  assert.equal(initials(""), "");
});

// ── Shell data ───────────────────────────────────────────────────────────

test("withoutOverviewFields drops only the Overview columns", () => {
  const settings = {
    campaign_slug: "lions", school_name: "Lions HS", location: "Phoenix, AZ", logo_url: "x",
    team_banner_url: "b", team_about: "a", location_street: "1 Main", location_zip: "85001",
  };
  assert.deepEqual(withoutOverviewFields(settings), {
    campaign_slug: "lions", school_name: "Lions HS", location: "Phoenix, AZ", logo_url: "x",
  });
  assert.equal(settings.team_about, "a", "input is not mutated");
});
