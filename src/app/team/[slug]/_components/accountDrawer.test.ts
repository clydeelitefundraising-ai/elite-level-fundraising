// Account drawer — the pure keyboard/animation rules (accountDrawer.ts)
// plus structural checks on AccountMenu.tsx. Source scans for the
// component, same approach as the repo's other client-component tests
// (settingsAccess.test.ts, gradeTabs.test.ts); they pin the approved
// behavior rather than render it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DRAWER_FOCUSABLE,
  DRAWER_TRANSITION_MS,
  DRAWER_WIDTH,
  drawerCloseDelayMs,
  drawerKeyAction,
  drawerTransition,
} from "./accountDrawer.ts";

const src = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const menu = src("./AccountMenu.tsx");
const header = src("./TeamHeader.tsx");
const sidebar = src("./DesktopSidebar.tsx");
const nav = src("./TeamNav.tsx");

// ── Keyboard ──────────────────────────────────────────────────────────────

test("keyboard: Escape closes the drawer, wherever focus is", () => {
  assert.deepEqual(drawerKeyAction("Escape", false, 2, 8), { type: "close" });
  assert.deepEqual(drawerKeyAction("Escape", false, -1, 8), { type: "close" });
  assert.deepEqual(drawerKeyAction("Escape", true, 0, 0), { type: "close" });
});

test("keyboard: Tab on the last item wraps to the first (focus never leaves the drawer)", () => {
  assert.deepEqual(drawerKeyAction("Tab", false, 7, 8), { type: "focus", index: 0 });
});

test("keyboard: Shift+Tab on the first item wraps to the last", () => {
  assert.deepEqual(drawerKeyAction("Tab", true, 0, 8), { type: "focus", index: 7 });
});

test("keyboard: Tab between inner items is left to the browser", () => {
  assert.equal(drawerKeyAction("Tab", false, 3, 8), null);
  assert.equal(drawerKeyAction("Tab", true, 3, 8), null);
});

test("keyboard: focus outside the drawer is pulled back in", () => {
  assert.deepEqual(drawerKeyAction("Tab", false, -1, 8), { type: "focus", index: 0 });
  assert.deepEqual(drawerKeyAction("Tab", true, -1, 8), { type: "focus", index: 7 });
});

test("keyboard: other keys, and Tab with nothing focusable, do nothing", () => {
  for (const key of ["Enter", " ", "ArrowDown", "a"]) assert.equal(drawerKeyAction(key, false, 1, 8), null);
  assert.equal(drawerKeyAction("Tab", false, -1, 0), null);
});

test("keyboard: a single focusable element keeps focus on itself", () => {
  assert.deepEqual(drawerKeyAction("Tab", false, 0, 1), { type: "focus", index: 0 });
  assert.deepEqual(drawerKeyAction("Tab", true, 0, 1), { type: "focus", index: 0 });
});

test("focusable selector covers links, buttons and form fields, and skips disabled / tabindex=-1", () => {
  for (const part of ["a[href]", "button:not([disabled])", "input:not([disabled])", '[tabindex]:not([tabindex="-1"])']) {
    assert.ok(DRAWER_FOCUSABLE.includes(part), part);
  }
});

// ── Size and motion ───────────────────────────────────────────────────────

test("size: about 88% of a phone screen, capped at 380px on wider screens", () => {
  assert.equal(DRAWER_WIDTH, "min(88vw, 380px)");
  assert.match(menu, /width: DRAWER_WIDTH/);
});

test("motion: slides and fades over 240ms; reduced motion turns both off and closes at once", () => {
  assert.equal(DRAWER_TRANSITION_MS, 240);
  assert.match(drawerTransition("transform", false), /^transform 240ms /);
  assert.match(drawerTransition("opacity", false), /^opacity 240ms /);
  assert.equal(drawerTransition("transform", true), "none");
  assert.equal(drawerTransition("opacity", true), "none");
  assert.equal(drawerCloseDelayMs(false), 240);
  assert.equal(drawerCloseDelayMs(true), 0);
  assert.match(menu, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
});

// ── Opening ───────────────────────────────────────────────────────────────

test("open: the existing profile photo / initials button opens the drawer", () => {
  assert.match(menu, /onClick=\{\(\) => \(mounted \? closeDrawer\(\) : openDrawer\(\)\)\}/);
  assert.match(menu, /aria-label="Account menu"\s+aria-haspopup="dialog"\s+aria-expanded=\{mounted\}/);
  assert.match(menu, /\{avatar\(16\)\}/, "button still shows the profile photo, initials or user icon");
});

test("open: slides in from the RIGHT edge over a dimmed overlay, portaled to <body>", () => {
  assert.match(menu, /top: 0,\s+right: 0,\s+bottom: 0,/);
  assert.match(menu, /transform: shown \? "translateX\(0\)" : "translateX\(100%\)"/);
  assert.match(menu, /background: "rgba\(0,0,0,\.4\)", pointerEvents: "auto",\s+opacity: shown \? 1 : 0/);
  assert.match(menu, /document\.body,/);
});

test("open: focus moves into the drawer (its close button) and the page behind can't scroll", () => {
  assert.match(menu, /setShown\(true\);\s+closeButtonRef\.current\?\.focus\(\);/);
  assert.match(menu, /function DrawerScrollLock\(\) \{\s+useBodyScrollLock\(\);/);
  assert.match(menu, /<DrawerScrollLock \/>/);
  assert.match(src("./Modal.tsx"), /export function useBodyScrollLock\(\)/, "reuses Modal's iOS-safe lock");
});

test("open: announced as a modal dialog", () => {
  assert.match(menu, /role="dialog"\s+aria-modal="true"\s+aria-label="Account menu"/);
});

// ── Closing ───────────────────────────────────────────────────────────────

test("close: tapping the overlay outside the drawer", () => {
  assert.match(menu, /<div\s+onClick=\{closeDrawer\}\s+aria-hidden="true"/);
});

test("close: a visible X button", () => {
  assert.match(menu, /ref=\{closeButtonRef\}\s+onClick=\{closeDrawer\}\s+aria-label="Close account menu"/);
  assert.match(menu, /<X size=\{18\} aria-hidden="true" \/>/);
});

test("close: Escape (and Tab wrapping) through a document keydown listener while open", () => {
  assert.match(menu, /drawerKeyAction\(e\.key, e\.shiftKey,/);
  assert.match(menu, /if \(action\.type === "close"\) closeDrawer\(\);/);
  assert.match(menu, /document\.addEventListener\("keydown", onKeyDown\)/);
  assert.match(menu, /document\.removeEventListener\("keydown", onKeyDown\)/);
});

test("close: Android hardware back still closes it instead of leaving the app", () => {
  assert.match(menu, /window\.__elfHasOpenOverlay = \(\) => true;/);
  assert.match(menu, /const handleAndroidBack = \(\) => closeDrawer\(\);/);
});

test("close: slides out before unmounting, and focus returns to the profile button", () => {
  const close = menu.slice(menu.indexOf("const closeDrawer = useCallback"), menu.indexOf("}, [reducedMotion]);"));
  assert.match(close, /setShown\(false\);/);
  assert.match(close, /buttonRef\.current\?\.focus\(\);/);
  assert.match(close, /setTimeout\(\(\) => \{\s+setMounted\(false\);/);
  assert.match(close, /drawerCloseDelayMs\(reducedMotion\)/);
});

test("close: every menu link closes the drawer when chosen", () => {
  assert.equal((menu.match(/onClick=\{\(\) => setOpen\(false\)\}/g) ?? []).length, 0, "no leftover pop-up close handlers");
  // My Account, Create Team, Notifications, My Profile, My Athletes,
  // Activate ELF Account, Settings, Support & Legal links.
  assert.ok((menu.match(/onClick=\{closeDrawer\}/g) ?? []).length >= 10);
});

// ── Content and actions preserved ─────────────────────────────────────────

test("identity: the signed-in user's photo and name stay at the top, with My Account", () => {
  const top = menu.slice(menu.indexOf("{/* Account identity"), menu.indexOf("{/* Everything between"));
  assert.match(top, /\{avatar\(20\)\}/);
  assert.match(top, /\{accountName\}/);
  assert.match(top, /href="\/teams"/);
  assert.match(top, /My Account →/);
});

test("teams: every team listed; the current one highlighted and marked aria-current", () => {
  assert.match(menu, /teams\.map\(team => \{/);
  assert.match(menu, /\{teams\.length > 1 \? "Switch Team" : "Team"\}/);
  assert.match(menu, /aria-current=\{isCurrent \? "true" : undefined\}/);
  assert.match(menu, /borderLeft: isCurrent \? "3px solid var\(--elf-orange\)" : "3px solid transparent"/);
  assert.match(menu, /background: isCurrent \? "var\(--surface-light-elevated\)" : "#fff"/);
  assert.match(menu, /aria-label="Current team"/);
});

test("teams: switching still closes and navigates to the chosen team's Home", () => {
  assert.match(menu, /closeDrawer\(\);\s+if \(!isCurrent\) router\.push\(`\/team\/\$\{team\.campaign_slug\}\/home`\);/);
});

test("menu items: every existing destination and its permission gate is kept", () => {
  for (const href of ['href="/team-onboarding"', "href={`/team/${currentSlug}/notifications`}", "href={`/team/${currentSlug}/profile`}",
    "href={`/team/${currentSlug}/family`}", "href={`/team/${currentSlug}/activate-account`}", "href={`/team/${currentSlug}/settings`}",
    '"/contact"', '"/trust/privacy"', '"/legal/terms"', '"/legal/acceptable-use"']) {
    assert.ok(menu.includes(href), href);
  }
  for (const label of ["Create Team", "Notifications", "My Profile", "My Athletes", "Activate ELF Account", "Settings", "Support &amp; Legal", "Sign Out"]) {
    assert.ok(menu.includes(label), label);
  }
  assert.match(menu, /<PushOptIn slug=\{currentSlug\} \/>/);
  assert.equal((menu.match(/\{hasAccountSession && \(/g) ?? []).length, 2, "My Profile and My Athletes stay account-only");
  assert.match(menu, /\{!hasAccountSession && isMember && \(/);
  assert.match(menu, /\{!hasAccountSession && !isMember && \(/);
});

test("sign out: same form POST and native-aware intercept, pinned below the scrolling list", () => {
  assert.match(menu, /method="POST"\s+action="\/api\/auth\/logout"/);
  assert.match(menu, /if \(!isNativeApp\(\)\) return;\s+e\.preventDefault\(\);\s+void performNativeAwareLogout\(router\);/);
  const list = menu.indexOf("overflowY: \"auto\"");
  const form = menu.indexOf('action="/api/auth/logout"');
  const listEnd = menu.lastIndexOf("{/* Sign Out");
  assert.ok(list > 0 && listEnd > list && form > listEnd, "Sign Out comes after the scrolling list closes");
  assert.match(menu, /style=\{\{ flexShrink: 0, borderTop: "1px solid #f0f0f0", paddingBottom: "env\(safe-area-inset-bottom, 0px\)" \}\}/);
});

// ── Layout ────────────────────────────────────────────────────────────────

test("layout: header fixed, middle scrolls (long team lists never clip), safe areas respected", () => {
  assert.match(menu, /flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain"/);
  assert.match(menu, /paddingTop: "env\(safe-area-inset-top, 0px\)"/);
  assert.match(menu, /paddingRight: "env\(safe-area-inset-right, 0px\)"/);
  assert.match(menu, /display: "flex",\s+flexDirection: "column",/);
});

test("layout: the old anchored pop-up positioning is gone", () => {
  assert.ok(!menu.includes("computeClampedMenuPosition"));
  assert.ok(!menu.includes("menuPos"));
});

// ── Everything else unchanged ─────────────────────────────────────────────

test("still mounted in the same two places with the same props; bottom nav untouched", () => {
  assert.match(header, /<AccountMenu\s+currentSlug=\{settings\.campaign_slug\}/);
  assert.match(sidebar, /<AccountMenu\s+currentSlug=\{slug\}[\s\S]*?onDark\s+\/>/);
  assert.ok(!nav.includes("AccountMenu") && !nav.includes("accountDrawer"));
});
