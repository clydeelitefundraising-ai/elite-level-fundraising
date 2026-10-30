// Phase 1B — responsive Admin Portal shell. Unit tests for the pure drawer
// helpers plus structural checks on AdminShell.tsx / adminResponsive.css.
// Source scans, same approach as the repo's other client-component tests;
// they pin the approved behavior rather than render it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADMIN_DESKTOP_MEDIA_QUERY,
  ADMIN_DESKTOP_MIN_WIDTH_PX,
  ADMIN_DRAWER_ID,
  lockDocumentScroll,
  wrapFocusIndex,
} from "./adminDrawer.ts";

const shell  = readFileSync(new URL("./AdminShell.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const css    = readFileSync(new URL("./adminResponsive.css", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const MOBILE_MEDIA = "@media (max-width: 899.98px)";

/** Top-level CSS blocks as [prelude, body] pairs (one level of nesting). */
function topLevelBlocks(src: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0, start = 0, preludeStart = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "{") {
      if (depth === 0) { start = i; }
      depth++;
    } else if (src[i] === "}") {
      depth--;
      if (depth === 0) {
        out.push([src.slice(preludeStart, start).trim(), src.slice(start + 1, i)]);
        preludeStart = i + 1;
      }
    }
  }
  return out;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

test("breakpoint constants agree with the stylesheet", () => {
  assert.equal(ADMIN_DESKTOP_MIN_WIDTH_PX, 900);
  assert.equal(ADMIN_DESKTOP_MEDIA_QUERY, "(min-width: 900px)");
  assert.ok(css.includes(MOBILE_MEDIA));
});

test("wrapFocusIndex: wraps at both ends, otherwise defers to the browser", () => {
  assert.equal(wrapFocusIndex(4, 5, false), 0);     // Tab on last → first
  assert.equal(wrapFocusIndex(0, 5, true), 4);      // Shift+Tab on first → last
  assert.equal(wrapFocusIndex(2, 5, false), null);
  assert.equal(wrapFocusIndex(2, 5, true), null);
  assert.equal(wrapFocusIndex(-1, 5, false), 0);    // focus escaped → pull back in
  assert.equal(wrapFocusIndex(-1, 5, true), 4);
  assert.equal(wrapFocusIndex(0, 0, false), null);  // nothing focusable
});

test("lockDocumentScroll: locks html + body and restores the previous values exactly", () => {
  const doc = { documentElement: { style: { overflow: "" } }, body: { style: { overflow: "scroll" } } };
  const unlock = lockDocumentScroll(doc);
  assert.equal(doc.documentElement.style.overflow, "hidden");
  assert.equal(doc.body.style.overflow, "hidden");
  unlock();
  assert.equal(doc.documentElement.style.overflow, "");
  assert.equal(doc.body.style.overflow, "scroll");
});

// ── Stylesheet structure ───────────────────────────────────────────────────

test("stylesheet is imported once, by the admin layout only", () => {
  assert.equal(layout.match(/import "\.\/adminResponsive\.css";/g)?.length, 1);
});

test("every selector is admin-scoped (.adm-) so nothing leaks to other pages", () => {
  const selectors = css.replace(/@media[^{]*\{/g, "").match(/[^{}]+(?=\{)/g) ?? [];
  assert.ok(selectors.length > 10);
  for (const group of selectors) {
    for (const sel of group.split(",")) assert.match(sel.trim(), /^\.adm-/, `unscoped selector: ${sel.trim()}`);
  }
});

test("desktop is untouched: outside the mobile media query, only the mobile-only elements are hidden", () => {
  const outside = topLevelBlocks(css).filter(([prelude]) => !prelude.startsWith("@media"));
  // CSS isolation (R1): the only other top-level rule is .adm-section, which
  // reproduces exactly the padding admin sections used to get from the
  // global `section { padding: 6rem 5% }` — so desktop stays visually identical.
  assert.equal(outside.length, 2);
  const [prelude, body] = outside[0];
  assert.deepEqual(prelude.split(",").map(s => s.trim()).sort(), [".adm-backdrop", ".adm-drawer-close", ".adm-menu-btn"]);
  assert.equal(body.trim(), "display: none;");
  assert.equal(outside[1][0].trim(), ".adm-section");
  assert.equal(outside[1][1].trim(), "padding: 6rem 5%;");
  for (const [p] of topLevelBlocks(css).filter(([p]) => p.startsWith("@media"))) {
    assert.ok(p.startsWith(MOBILE_MEDIA), `media query not mobile-scoped: ${p}`);
  }
});

test("mobile: sidebar becomes an off-canvas drawer with safe areas and dvh fallback", () => {
  const rule = css.slice(css.indexOf(".adm-sidebar {"), css.indexOf("}", css.indexOf(".adm-sidebar {")));
  assert.match(rule, /position: fixed !important/);
  assert.match(rule, /transform: translateX\(-100%\)/);
  assert.match(rule, /visibility: hidden/);
  assert.match(rule, /height: 100vh !important;\s*height: 100dvh !important/);
  assert.match(rule, /env\(safe-area-inset-top\)/);
  assert.match(rule, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.adm-shell\[data-drawer-open="true"\] \.adm-sidebar \{\s*transform: none;\s*visibility: visible;/);
});

test("mobile: layering is backdrop above page modals, drawer above backdrop, Command Center on top", () => {
  const mobile = css.slice(css.indexOf(MOBILE_MEDIA));
  const z = (sel: string) => {
    const start = mobile.indexOf(`${sel} {`);
    return Number(mobile.slice(start, mobile.indexOf("}", start)).match(/z-index: (\d+)/)![1]);
  };
  const commandCenterZ = Math.min(...[...readFileSync(new URL("./CommandCenter/CommandCenter.tsx", import.meta.url), "utf8")
    .matchAll(/zIndex:\s*(\d+)/g)].map(m => Number(m[1])));
  assert.ok(z(".adm-backdrop") > 1000, "backdrop must cover page modals (max zIndex 1000)");
  assert.ok(z(".adm-sidebar") > z(".adm-backdrop"));
  assert.ok(commandCenterZ > z(".adm-sidebar"));
});

test("mobile: touch targets, header safe area, iOS input zoom", () => {
  for (const sel of [".adm-menu-btn", ".adm-drawer-close", ".adm-search-btn"]) {
    const rule = css.slice(css.indexOf(`${sel} {`), css.indexOf("}", css.indexOf(`${sel} {`)));
    assert.match(rule, /min-width: 44px/, sel);
    assert.match(rule, /min-height: 44px/, sel);
  }
  assert.match(css, /\.adm-nav-item \{\s*min-height: 44px;/);
  assert.match(css, /\.adm-header \{[^}]*padding: env\(safe-area-inset-top\)/);
  assert.match(css, /\.adm-shell select,\s*\.adm-shell textarea \{\s*font-size: 16px !important;/);
});

test("reusable classes for later phases exist but no page uses them yet", () => {
  for (const cls of ["adm-page", "adm-stack", "adm-table-scroll", "adm-modal", "adm-touch", "adm-hide-mobile"]) {
    assert.match(css, new RegExp(`\\.${cls} \\{`), cls);
    assert.doesNotMatch(shell, new RegExp(`"${cls}"`), `${cls} is reserved for later phases`);
  }
});

// ── AdminShell ─────────────────────────────────────────────────────────────

test("all 18 nav destinations are preserved", () => {
  const hrefs = [...shell.matchAll(/href: "([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(hrefs, [
    "/admin/executive", "/admin/dashboard", "/admin/reports",
    "/admin/operations", "/admin/automation", "/admin/notifications", "/admin/audit",
    "/admin/campaigns", "/admin/health",
    "/admin/crm", "/admin/sponsors", "/admin/community-partners",
    "/admin/analytics", "/admin/accounts", "/admin/exports",
    "/admin/organization", "/admin/demo", "#",
  ]);
});

test("desktop inline styles of the sidebar and header are unchanged", () => {
  assert.match(shell, /width: 220, flexShrink: 0, background: "#fff",\s*borderRight: "1px solid #e5e7eb",\s*display: "flex", flexDirection: "column",\s*position: "sticky", top: 0, height: "100vh",/);
  assert.match(shell, /style=\{\{ height: 52, background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", padding: "0 1\.75rem", gap: "1rem", flexShrink: 0, position: "sticky", top: 0, zIndex: 10 \}\}/);
});

test("Ctrl+K / ⌘+K still toggles the Command Center, and the search button still opens it", () => {
  assert.match(shell, /if \(\(e\.ctrlKey \|\| e\.metaKey\) && e\.key === "k"\) \{\s*e\.preventDefault\(\);\s*setMobileOpen\(false\);\s*setCcOpen\(prev => !prev\);/);
  assert.match(shell, /onClick=\{openCC\}\s*className="adm-search-btn"\s*aria-label="Open Command Center \(Ctrl\+K\)"/);
  assert.match(shell, /\{ccOpen && <CommandCenter onClose=\{\(\) => setCcOpen\(false\)\} \/>\}/);
});

test("menu button: labelled, reports expanded state, controls the drawer", () => {
  assert.match(shell, /className="adm-menu-btn"\s*aria-label="Open navigation menu"\s*aria-expanded=\{mobileOpen\}\s*aria-controls=\{ADMIN_DRAWER_ID\}/);
  assert.match(shell, /id=\{ADMIN_DRAWER_ID\}\s*className="adm-sidebar"/);
  assert.equal(ADMIN_DRAWER_ID, "admin-nav-drawer");
});

test("open drawer is a modal dialog and the rest of the page is inert", () => {
  assert.match(shell, /\{\.\.\.\(mobileOpen \? \{ role: "dialog", "aria-modal": true \} : \{\}\)\}/);
  assert.match(shell, /<div inert=\{mobileOpen\}/);
  assert.match(shell, /data-drawer-open=\{mobileOpen \? "true" : "false"\}/);
});

test("drawer closes on navigation, route change, Escape, backdrop, close button and desktop resize", () => {
  assert.match(shell, /onClick=\{\(\) => \{ if \(!isDisabled\) \{ onNavigate\(\); router\.push\(item\.href\); \} \}\}/);
  assert.match(shell, /onNavigate=\{closeDrawer\}/);
  assert.match(shell, /if \(drawerPath !== pathname\) \{\s*setDrawerPath\(pathname\);\s*setMobileOpen\(false\);/);
  assert.match(shell, /if \(e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*setMobileOpen\(false\);/);
  assert.match(shell, /className="adm-backdrop" aria-hidden="true" onClick=\{closeDrawer\}/);
  assert.match(shell, /className="adm-drawer-close" aria-label="Close navigation menu" onClick=\{closeDrawer\}/);
  assert.match(shell, /window\.matchMedia\(ADMIN_DESKTOP_MEDIA_QUERY\)/);
});

test("drawer traps focus, locks scroll, and restores focus to the menu button", () => {
  assert.match(shell, /const unlock = lockDocumentScroll\(document\);/);
  assert.match(shell, /unlock\(\);/);
  assert.match(shell, /wrapFocusIndex\(items\.indexOf\(document\.activeElement as HTMLElement\), items\.length, e\.shiftKey\)/);
  assert.match(shell, /focusables\(\)\[0\]\?\.focus\(\);/);
  assert.match(shell, /menuButtonRef\.current\?\.focus\(\);/);
});

test("current nav item is announced with aria-current", () => {
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(shell, /role="navigation" aria-label="Admin sections"/);
});

test("Phase 1B leaves authentication alone", () => {
  assert.match(layout, /if \(!verifyToken\(token\)\) \{\s*return <LoginView \/>;/);
  assert.match(shell, /await fetch\("\/api\/admin\/logout", \{ method: "POST" \}\);\s*window\.location\.href = "\/admin";/);
});
