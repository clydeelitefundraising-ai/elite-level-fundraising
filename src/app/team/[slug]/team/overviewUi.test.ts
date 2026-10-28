// Phase T6 — Team -> Overview page. Structural checks on the component and
// its server wiring (this repo has no component-rendering test framework;
// see sponsors/partnersUi.test.ts). Behaviour of the write paths is covered
// by api/team/[slug]/overview/route.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const view = read("./OverviewView.tsx");
const page = read("./page.tsx");

test("banner, location and about are the only sections — no trophies, records or statistics", () => {
  assert.match(view, /<TeamBanner /);
  assert.match(view, /<LocationCard /);
  assert.match(view, /<AboutCard /);
  for (const word of ["Trophy", "Regional Titles", "State Qualifiers", "School Records", "championship"]) {
    assert.ok(!view.includes(word), `OverviewView must not contain ${word}`);
  }
});

test("nothing team-specific is hardcoded — banner text comes from the team's own data", () => {
  for (const word of ["QA Lions", "Lion Drive", "Track and Field", "2027", "Quality, ST"]) {
    assert.ok(!view.includes(word), `OverviewView must not hardcode ${word}`);
  }
  assert.match(view, /\{team\.school_name\}/);
  assert.match(view, /\{team\.sport_name\}/);
  assert.match(view, /seasonLabel\(team\.season\)/);
  // same logo precedence as the header
  assert.match(page, /logo_url:\s+resolveTeamLogoUrl\(settings\)/);
});

test("edit controls only for canEdit = Head Coach (incl. platform admin) on an active season", () => {
  assert.match(page, /canEdit=\{isHeadCoach\(actor\) && !isSeasonCompleted\(settings\)\}/);
  assert.match(view, /\{canEdit && \(\s+<div style=\{\{ position: "absolute", top: "\.7rem"/);
  assert.match(view, /action=\{canEdit && !editing && display\.source !== "none" \?/);
  assert.match(view, /action=\{canEdit && !editing && paragraphs\.length > 0 \?/);
});

test("About text is rendered as text, never as HTML", () => {
  assert.ok(!view.includes("dangerouslySetInnerHTML"));
  assert.match(view, /whiteSpace: "pre-line"/);
  assert.match(view, /aboutParagraphs\(about\)/);
});

test("banner image: covered, 16:9, behind a readability gradient; default background when none", () => {
  const css = read("./Overview.module.css");
  assert.match(css, /aspect-ratio: 16 \/ 9;/);
  assert.match(view, /objectFit: "cover"/);
  assert.match(view, /linear-gradient\(to top, rgba\(6,14,30,\.88\)/);
  assert.match(view, /background: bannerUrl \? NAVY : `radial-gradient/);
  assert.match(view, /accept="image\/jpeg,image\/png,image\/webp"/);
});

test("location: map link only (no map service / API key), opened in a new tab", () => {
  assert.match(view, /href=\{mapsHref\(display\.query, apple\)\}/);
  assert.match(view, /target="_blank"\s+rel="noopener noreferrer"/);
  assert.ok(!/api[_-]?key|maps\.googleapis|openstreetmap|mapbox/i.test(view));
});

test("existing tabs untouched: Roster and To-Do List are still rendered by TeamTabs", () => {
  assert.match(page, /overview=\{overview\}/);
  assert.match(page, /roster=\{\s+<RosterTabs/);
  assert.match(page, /<TodoListView slug=\{slug\} \/>/);
});
