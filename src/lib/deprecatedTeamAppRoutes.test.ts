import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// Regression coverage for the second pilot-hardening P0: the deprecated
// /team-app/* and /team-app-admin/* route trees used to render entirely
// from src/app/team-app/_data/mockData.ts (fake athletes, fake fundraising
// totals, fake announcements, fake team "Paradise Valley Trojans") at
// publicly reachable URLs. They are now pure redirects. This file asserts
// that stays true — no rendering harness is set up in this repo, so it
// checks the route files' actual source (imports + content), not a
// server-rendered DOM.

const DEPRECATED_TEAM_APP_PAGES = [
  "src/app/team-app/page.tsx",
  "src/app/team-app/home/page.tsx",
  "src/app/team-app/calendar/page.tsx",
  "src/app/team-app/fundraiser/page.tsx",
  "src/app/team-app/roster/page.tsx",
  "src/app/team-app/shop/page.tsx",
  "src/app/team-app/updates/page.tsx",
];

const DEPRECATED_TEAM_APP_ADMIN_PAGES = [
  "src/app/team-app-admin/page.tsx",
  "src/app/team-app-admin/calendar/page.tsx",
  "src/app/team-app-admin/fundraiser/page.tsx",
  "src/app/team-app-admin/roster/page.tsx",
  "src/app/team-app-admin/shop/page.tsx",
  "src/app/team-app-admin/sponsors/page.tsx",
  "src/app/team-app-admin/team-profile/page.tsx",
  "src/app/team-app-admin/updates/page.tsx",
];

// Distinctive strings that only ever appear in the fabricated mock dataset
// (mockData.ts's fake team "Paradise Valley Trojans" and fake people) — if
// any of these show up in a deprecated route file again, mock data has
// leaked back into a publicly reachable page.
const FABRICATED_MARKERS = [
  "Paradise Valley",
  "Trojans",
  "Aaliyah Torres",
  "Cameron Lee",
  "Darius Williams",
  "Destiny Hughes",
  "Chandler High School",
];

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function listTsxFiles(dir: string): string[] {
  const abs = join(process.cwd(), dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const rel = join(dir, entry);
    const absEntry = join(process.cwd(), rel);
    if (statSync(absEntry).isDirectory()) {
      out.push(...listTsxFiles(rel));
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      out.push(rel);
    }
  }
  return out;
}

// Matches an actual `import ... from ".../AppStore"` / ".../mockData"`
// statement, not incidental mentions in prose comments (this file's own
// @deprecated comments reference both paths by name).
const IMPORTS_APP_STORE = /from\s+["'][^"']*_store\/AppStore["']/;
const IMPORTS_MOCK_DATA = /from\s+["'][^"']*_data\/mockData["']/;

for (const page of [...DEPRECATED_TEAM_APP_PAGES, ...DEPRECATED_TEAM_APP_ADMIN_PAGES]) {
  test(`${page}: is a redirect, not a mock-data render`, () => {
    const src = read(page);
    assert.match(src, /redirect\(/, `${page} must call redirect()`);
    assert.doesNotMatch(src, IMPORTS_APP_STORE, `${page} must not import the mock AppStore`);
    assert.doesNotMatch(src, IMPORTS_MOCK_DATA, `${page} must not import mockData`);
    for (const marker of FABRICATED_MARKERS) {
      assert.ok(!src.includes(marker), `${page} must not contain fabricated content "${marker}"`);
    }
  });
}

test("team-app/* redirects go to the real generic entry point, not a guessed team", () => {
  for (const page of DEPRECATED_TEAM_APP_PAGES) {
    const src = read(page);
    assert.match(src, /redirect\("\/login"\)/, `${page} must redirect to /login (no team-slug context to guess from)`);
  }
});

test("team-app-admin/* redirects go to the real single admin destination", () => {
  for (const page of DEPRECATED_TEAM_APP_ADMIN_PAGES) {
    const src = read(page);
    assert.match(src, /redirect\("\/admin"\)/, `${page} must redirect to /admin`);
  }
});

test("the mock data source and its provider have been deleted, not just orphaned", () => {
  for (const removed of [
    "src/app/team-app/_data/mockData.ts",
    "src/app/_store/AppStore.tsx",
    "src/app/team-app/_components/TeamHeader.tsx",
    "src/app/team-app/_components/SponsorCarousel.tsx",
    "src/app/team-app/_components/BottomNav.tsx",
    "src/app/team-app/_components/PhoneShell.tsx",
  ]) {
    assert.ok(!existsSync(join(process.cwd(), removed)), `${removed} should have been deleted`);
  }
});

test("root layout no longer wraps the app in the mock AppStoreProvider", () => {
  const src = read("src/app/layout.tsx");
  assert.doesNotMatch(src, /AppStoreProvider/, "src/app/layout.tsx must not reference AppStoreProvider");
});

test("the real /team/[slug]/* tree never imports the mock store or mock data", () => {
  const files = listTsxFiles("src/app/team/[slug]");
  assert.ok(files.length > 0, "expected to find files under src/app/team/[slug]");
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, IMPORTS_APP_STORE, `${file} must not import the mock AppStore`);
    assert.doesNotMatch(src, IMPORTS_MOCK_DATA, `${file} must not import mockData`);
  }
});

test("the real admin tree (including Demo Center) never imports the mock store or mock data", () => {
  const files = listTsxFiles("src/app/admin");
  assert.ok(files.length > 0, "expected to find files under src/app/admin");
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, IMPORTS_APP_STORE, `${file} must not import the mock AppStore`);
    assert.doesNotMatch(src, IMPORTS_MOCK_DATA, `${file} must not import mockData`);
  }
});

test("the real public campaign tree never imports the mock store or mock data", () => {
  const files = listTsxFiles("src/app/campaign");
  assert.ok(files.length > 0, "expected to find files under src/app/campaign");
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, IMPORTS_APP_STORE, `${file} must not import the mock AppStore`);
    assert.doesNotMatch(src, IMPORTS_MOCK_DATA, `${file} must not import mockData`);
  }
});
