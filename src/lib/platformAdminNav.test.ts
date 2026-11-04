// Admin consolidation, Stage 1 — the unified Platform Admin shell:
// navigation, landing, legacy /admin access for Platform Admin accounts,
// Moderation rename, My Teams, and no change for team members.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ADMIN_NAV, activeSectionId, navSection, PLATFORM_ADMIN_HOME } from "./platformAdminNav.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const pageFile = (href: string) => join(ROOT, "src/app", href.split("?")[0], "page.tsx");

test("navigation: the nine approved sections, in order", () => {
  assert.deepEqual(ADMIN_NAV.map(s => s.label), [
    "Dashboard", "Schools", "Teams & Onboarding", "Fundraising", "Partners & Sponsors",
    "Sales & CRM", "Moderation", "Reports & Analytics", "Settings",
  ]);
  assert.equal(new Set(ADMIN_NAV.map(s => s.id)).size, ADMIN_NAV.length);
});

test("navigation: every section and tool link points at a page that exists", () => {
  for (const s of ADMIN_NAV) {
    assert.ok(existsSync(pageFile(s.href)), `${s.label} → ${s.href}`);
    for (const i of s.items) assert.ok(existsSync(pageFile(i.href)), `${s.label} / ${i.label} → ${i.href}`);
  }
});

test("navigation: tools are labelled legacy exactly when they live in /admin; nothing links to removed routes", () => {
  for (const s of ADMIN_NAV) {
    assert.ok(s.href.startsWith(PLATFORM_ADMIN_HOME), `${s.label} hub stays in Platform Admin`);
    for (const i of s.items) assert.equal(Boolean(i.legacy), i.href.startsWith("/admin"), `${i.label}`);
  }
  const all = ADMIN_NAV.flatMap(s => [s.href, ...s.items.map(i => i.href)]);
  assert.ok(!all.includes("/platform-admin/reports"), "moderation is linked by its new name");
  assert.ok(all.includes("/admin/organization"), "Organization Center reachable");
  assert.ok(all.includes("/platform-admin/my-teams"));
});

test("navigation: every /platform-admin page is reachable from the navigation (except detail pages and redirects)", () => {
  const pages: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") pages.push("/" + relative(join(ROOT, "src/app"), d).split(sep).join("/"));
    }
  })(join(ROOT, "src/app/platform-admin"));
  const linked = new Set(ADMIN_NAV.flatMap(s => [s.href, ...s.items.map(i => i.href)]));
  const orphans = pages.filter(p => !p.includes("[") && p !== "/platform-admin/reports" && !linked.has(p));
  assert.deepEqual(orphans, []);
});

test("activeSectionId highlights the right section", () => {
  assert.equal(activeSectionId("/platform-admin"), "dashboard");
  assert.equal(activeSectionId("/platform-admin/"), "dashboard");
  assert.equal(activeSectionId("/platform-admin/schools"), "schools");
  assert.equal(activeSectionId("/platform-admin/schools/abc-123"), "schools");
  assert.equal(activeSectionId("/platform-admin/school-links"), "schools");
  assert.equal(activeSectionId("/platform-admin/school-links/some-team-2026"), "schools");
  assert.equal(activeSectionId("/platform-admin/fundraising-inquiries"), "fundraising");
  assert.equal(activeSectionId("/platform-admin/moderation?x=1"), "moderation");
  assert.equal(activeSectionId("/platform-admin/my-teams"), "settings");
  assert.equal(activeSectionId("/platform-admin/teams"), "teams");
  assert.equal(activeSectionId("/team/x/home"), null);
  assert.throws(() => navSection("nope"));
});

test("landing: Platform Admin accounts land on the dashboard; /teams sends them there unless they ask for My Teams", () => {
  assert.match(read("src/lib/platformAdminLanding.ts"), /isPlatformAdmin \? "\/platform-admin" : "\/teams"/);
  const teams = read("src/app/teams/page.tsx");
  assert.match(teams, /if \(platformAdmin && view !== "my-teams"\) redirect\(resolveAuthenticatedLandingPath\(true\)\);/);
  assert.match(read("src/app/login/page.tsx"), /resolveAuthenticatedLandingPath\(/);
  assert.doesNotMatch(read("src/app/platform-admin/page.tsx"), /redirect\(/, "/platform-admin is the dashboard, not a redirect");
});

test("Moderation rename: the old Reports URL redirects; the API is unchanged", () => {
  assert.match(read("src/app/platform-admin/reports/page.tsx"), /redirect\("\/platform-admin\/moderation"\)/);
  const view = read("src/app/platform-admin/moderation/ModerationQueueView.tsx");
  assert.match(view, />Moderation<\/h1>/);
  assert.match(view, /fetch\("\/api\/platform-admin\/reports"\)/);
  assert.ok(!existsSync(join(ROOT, "src/app/platform-admin/reports/ReportsQueueView.tsx")));
});

test("legacy /admin: the layout and every page admit getAdminAccess() (Platform Admin or shared password), never the cookie directly", () => {
  const layout = read("src/app/admin/layout.tsx");
  assert.match(layout, /const access = await getAdminAccess\(\);\n\n  if \(!access\) \{\n    return <LoginView \/>;/);
  assert.match(layout, /<AdminShell via=\{access\.via\}>/);
  const pages: string[] = [];
  (function walk(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "page.tsx") pages.push(relative(ROOT, p).split(sep).join("/"));
    }
  })(join(ROOT, "src/app/admin"));
  for (const p of pages) {
    const src = read(p);
    assert.doesNotMatch(src, /verifyToken|elf_admin/, p);
    // Either the one-line check or the same check kept in a variable (pages
    // that also look at access.via, e.g. the campaign wizards).
    if (/redirect\("\/admin"\)/.test(src)) assert.match(src, /if \(!\(await getAdminAccess\(\)\)\) redirect\("\/admin"\);|const access = await getAdminAccess\(\);\n  if \(!access\) redirect\("\/admin"\);/, p);
  }
  // Community Partners still needs the Platform Admin account itself.
  assert.match(read("src/app/admin/community-partners/page.tsx"), /getPlatformAdminSession\(\)/);
  // A Platform Admin gets a way back instead of the shared-password sign-out.
  const shell = read("src/app/admin/AdminShell.tsx");
  assert.match(shell, /via === "platform_admin" \?/);
  assert.match(shell, /href="\/platform-admin"/);
});

test("Platform Admin shell: gated by the layout, safe areas, no iOS zoom, native-aware sign out", () => {
  const layout = read("src/app/platform-admin/layout.tsx");
  assert.match(layout, /await requirePlatformAdminPage\(\)/);
  assert.match(layout, /<PlatformAdminShell /);
  const css = read("src/app/platform-admin/_components/PlatformAdminShell.module.css");
  for (const inset of ["top", "bottom", "left", "right"]) assert.match(css, new RegExp(`env\\(safe-area-inset-${inset}\\)`));
  assert.match(css, /\.shell input,\n\.shell select,\n\.shell textarea \{\n  font-size: max\(16px, 1rem\);/);
  const shell = read("src/app/platform-admin/_components/PlatformAdminShell.tsx");
  assert.match(shell, /if \(!isNativeApp\(\)\) return;/);
  assert.match(shell, /ADMIN_NAV\.map/);
  assert.match(shell, /href="\/platform-admin\/my-teams"/);
});

test("team members see no change: the Team App only gains the admin banner's new link, shown to Platform Admins only", () => {
  const layout = read("src/app/team/[slug]/layout.tsx");
  assert.match(layout, /\{isPlatformAdmin\(actor\) && \(\n\s*<PlatformAdminBanner/);
  assert.match(read("src/app/team/[slug]/_components/PlatformAdminBanner.tsx"), /href="\/platform-admin"/);
  assert.doesNotMatch(read("src/lib/permissions.ts"), /platformAdminNav|adminAccess/);
});
