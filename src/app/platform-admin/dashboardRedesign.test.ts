// Platform Admin dashboard redesign — data sources, privacy, markup,
// responsive CSS and the phone bottom navigation.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ADMIN_NAV, BOTTOM_NAV, activeSectionId } from "../../lib/platformAdminNav.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const page = read("src/app/platform-admin/page.tsx");
const data = read("src/lib/platform/adminDashboard.ts");
const css = read("src/app/platform-admin/_components/Dashboard.module.css");
const shell = read("src/app/platform-admin/_components/PlatformAdminShell.tsx");
const shellCss = read("src/app/platform-admin/_components/PlatformAdminShell.module.css");
const pageExists = (href: string) => existsSync(join(ROOT, "src/app", href, "page.tsx"));
/** The body of the `@media (max-width: 899px)` block. */
const phoneBlock = shellCss.slice(shellCss.indexOf("@media (max-width: 899px)"), shellCss.indexOf("@media (prefers-reduced-motion"));

test("data: the page reads only the dashboard loader and the session — no direct database access", () => {
  assert.match(page, /getAdminDashboardData\(\)/);
  assert.doesNotMatch(page, /\bfetch\(|restUrl|restList|rest\/v1|SUPABASE/);
});

test("data: the loader uses only existing readers; the audit read is getRecentAudit's own query, strict", () => {
  const imports = [...data.matchAll(/^import .* from "(.*)";$/gm)].map(m => m[1]).concat(
    [...data.matchAll(/^} from "(.*)";$/gm)].map(m => m[1]));
  assert.deepEqual(imports.sort(), [
    "./_client", "./adminDashboardView", "./audit", "./fundraisingInquiries", "./schoolLinks", "@/lib/moderation/reports",
  ].sort());
  for (const fn of ["getAllReports()", "listFundraisingInquiries()", "getCampaignContextsForSlugs(", "listAllSeasons()", "getRecentAuditStrict("]) {
    assert.ok(data.includes(fn), fn);
  }
  const audit = read("src/lib/platform/audit.ts");
  assert.match(audit, /return restList<AuditEntry>\(recentAuditPath\(limit\)\);/);
  assert.match(audit, /fetch\(restUrl\(recentAuditPath\(limit\)\), \{ headers: restHeaders\(\), cache: "no-store" \}\)/);
  assert.doesNotMatch(audit, /method:/, "the audit readers never write");
});

test("dashboard: four existing KPIs with their existing destinations; no legacy badges or directory card grids", () => {
  for (const href of ["/platform-admin/moderation", "/platform-admin/fundraising-inquiries", "/platform-admin/schools", "/admin/campaigns"]) {
    assert.ok(page.includes(`href: "${href}"`), href);
  }
  assert.equal([...page.matchAll(/\{ label: "[^"]+", value: show\(counts\./g)].length, 4);
  assert.doesNotMatch(page, /Legacy admin|legacy|ToolGrid|navSection|ADMIN_NAV/);
});

test("dashboard: quick actions are School Links, Campaigns, Community Partners and Audit Log — all existing pages", () => {
  const hrefs = [...page.matchAll(/\{ label: "[^"]+", href: "([^"]+)", icon: /g)].map(m => m[1]);
  assert.deepEqual(hrefs, ["/platform-admin/school-links", "/admin/campaigns", "/admin/community-partners", "/admin/audit"]);
  for (const h of hrefs) assert.ok(pageExists(h), h);
});

test("dashboard: failures and genuine empty states render differently", () => {
  assert.match(page, /activity\.state === "failed" && \(/);
  assert.match(page, /activity\.state === "empty" && <p className=\{styles\.empty\}>No recent activity yet\.<\/p>/);
  assert.match(page, /data-state=\{g\.state\}/);
  assert.match(page, /g\.state === "failed" && <span className=\{styles\.warn\}/);
  assert.match(page, /attention\.length === 0 \?/);
});

test("dashboard accessibility: one h1, labelled sections, decorative glyphs hidden", () => {
  assert.equal([...page.matchAll(/<h1 /g)].length, 1);
  for (const id of ["pa-attention", "pa-quick", "pa-activity"]) {
    assert.match(page, new RegExp(`aria-labelledby="${id}"`));
    assert.match(page, new RegExp(`<h2 id="${id}"`));
  }
  assert.match(page, /aria-label="At a glance"/);
  for (const glyph of ["styles.quickIcon", "styles.chevron", "styles.warn"]) {
    assert.match(page, new RegExp(`className=\\{${glyph.replace(".", "\\.")}\\} aria-hidden="true"`), glyph);
  }
});

test("dashboard CSS: mobile-first, no overflow-prone widths, ≥44px tap targets", () => {
  assert.match(css, /\.kpis \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width: 600px\) \{\n  \.kpis \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width: 900px\) \{\n  \.columns \{/);
  assert.doesNotMatch(css, /(?<!max-|min-)width:\s*\d{3,}px/, "no fixed pixel widths");
  for (const [sel, min] of [[".kpi", 64], [".attentionRow", 44], [".quickAction", 48], [".panelLink", 44]] as const) {
    const block = css.slice(css.indexOf(`${sel} {`));
    const m = /min-height: (\d+)px;/.exec(block.slice(0, block.indexOf("}")));
    assert.ok(m && +m[1] >= 44 && +m[1] <= 72, `${sel} min-height ${m?.[1]}`);
    assert.equal(+m![1], min);
  }
  assert.match(css, /overflow-wrap: anywhere;/);
});

test("bottom nav: Home, Schools, Fundraising match their sections; More opens the existing drawer", () => {
  assert.deepEqual(BOTTOM_NAV.map(b => b.label), ["Home", "Schools", "Fundraising"]);
  for (const b of BOTTOM_NAV) {
    const section = ADMIN_NAV.find(s => s.id === b.id);
    assert.ok(section, b.id);
    assert.equal(b.href, section!.href);
    assert.equal(activeSectionId(b.href), b.id);
  }
  assert.match(shell, /<nav className=\{styles\.bottomNav\} aria-label="Quick navigation">/);
  assert.match(shell, /aria-label="More navigation"\n\s*aria-expanded=\{open\}\n\s*aria-controls=\{DRAWER_ID\}/);
  assert.match(shell, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(shell, /onClick=\{e => openFrom\(e\.currentTarget\)\}/);
  assert.match(shell, /\(openerRef\.current \?\? menuButtonRef\.current\)\?\.focus\(\);/, "focus returns to the opener");
  // Inside the inert main column, so it can't be reached while the drawer is open.
  assert.ok(shell.indexOf("styles.bottomNav") > shell.indexOf("inert={open}"));
});

test("bottom nav CSS: phones only, fixed above the safe area, never covers content or the drawer", () => {
  assert.match(shellCss, /\.bottomNav \{\n  display: none;\n\}/);
  assert.match(phoneBlock, /\.bottomNav \{\n    display: block;\n    position: fixed;/);
  assert.match(phoneBlock, /padding: 0 env\(safe-area-inset-right\) env\(safe-area-inset-bottom\) env\(safe-area-inset-left\);/);
  assert.match(phoneBlock, /calc\(56px \+ 1\.5rem \+ env\(safe-area-inset-bottom\)\)/, "content clears the bar");
  assert.match(phoneBlock, /\.shell\[data-drawer-open="true"\] \.bottomNav \{\n    visibility: hidden;/);
  assert.match(phoneBlock, /\.bottomItem \{[^}]*min-height: 56px;/);
  assert.match(phoneBlock, /\.bottomItem:focus-visible \{/);
  const z = (sel: string) => +(new RegExp(`\\.${sel} \\{[^}]*z-index: (\\d+);`).exec(phoneBlock)?.[1] ?? NaN);
  assert.ok(z("bottomNav") < z("backdrop") && z("backdrop") < z("sidebar"), "drawer and backdrop sit above the bar");
});

test("bottom nav appears on every Platform Admin page: the layout wraps them all in the shell", () => {
  assert.match(read("src/app/platform-admin/layout.tsx"), /<PlatformAdminShell [^>]*>\n\s*\{children\}/);
});
