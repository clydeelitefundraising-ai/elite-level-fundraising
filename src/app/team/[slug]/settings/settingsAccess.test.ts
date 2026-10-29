// Apple-review UI polish: Settings used to dead-end for every non-coach
// role ("Coach Access Only"), and Blocked Users/Delete Account lived
// only in the AccountMenu flyout. This is a static source-level guard —
// this codebase has no jsdom/React Testing Library harness to literally
// render these server/client components and simulate navigation — but it
// still catches the exact regression class a future edit could
// reintroduce (the old dead-end returning, or the account actions
// silently disappearing from both places).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

test("settings/page.tsx no longer dead-ends non-coaches with a 'Coach Access Only' gate", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  // Only the historical explanatory comment may still mention the old
  // gate's text — the actual dead-end COMPONENT (and any JSX rendering
  // that heading as real UI) must be gone.
  assert.ok(!source.includes("CoachOnlyGate"), "the old dead-end gate component must be removed");
  assert.ok(!source.includes(">Coach Access Only<"), "the old dead-end heading must not render as real UI");
  assert.ok(!/function CoachOnlyGate/.test(source), "the old dead-end gate function must not be defined");
});

// Settings Redesign: the single SettingsView/MemberSettingsView pair became
// a Settings home (SettingsHome) whose category rows come from
// settingsCategoriesFor(actor) — role coverage is tested by rendering in
// settingsRedesign.test.ts; these guards keep the page's wiring.
test("settings/page.tsx: every authenticated role renders the Settings home, with rows from settingsCategoriesFor(actor)", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  assert.ok(source.includes("const categories = settingsCategoriesFor(actor);"), "rows must come from the shared role rule");
  assert.ok(/<SettingsHome[\s\S]{0,300}categories=\{categories\}/.test(source), "must render SettingsHome with those categories");
  assert.ok(source.includes('actor.kind === "coach"'), "coach-only summaries are only loaded for a coach");
  assert.ok(!source.includes("SettingsView") && !source.includes("MemberSettingsView"), "the old single-page views are gone");
});

test("settings/page.tsx: resolves a real role label for coach, member and platform_admin actors", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  assert.ok(source.includes("staffRoleLabel(actor.session.role)"));
  assert.ok(source.includes("memberRoleLabel") && source.includes("platformAdminRoleLabel"), "must resolve a real role label for both member and platform_admin actors");
});

test("settings/page.tsx still redirects an unauthenticated (public) visitor — unchanged", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  assert.ok(/actor\.kind === "public"[\s\S]{0,80}redirect/.test(source), "public visitors must still be redirected, not shown any settings view");
});

test("settings/account/page.tsx renders AccountPrivacySection for every authenticated role — Blocked Users/Delete Account stay reachable from Settings", () => {
  const source = read("src/app/team/[slug]/settings/account/page.tsx");
  assert.ok(source.includes('import AccountPrivacySection from "../AccountPrivacySection"'), "must import AccountPrivacySection");
  assert.ok(source.includes("<AccountPrivacySection"), "must render AccountPrivacySection");
  assert.ok(!source.includes("canOpenSettingsCategory"), "no role gate beyond sign-in: every role reaches its own account settings");
});

test("personal Settings screens (Notifications, Account & Privacy) never reference coach-only features", () => {
  for (const f of ["notifications/page.tsx", "account/page.tsx", "SettingsHome.tsx"]) {
    const source = read(`src/app/team/[slug]/settings/${f}`);
    for (const forbidden of ["TeamBrandingSection", "CoachFundraisingSection", "TeamQrModal", "join-codes", "PublicAthletePhotosSection"]) {
      assert.ok(!source.includes(forbidden), `${f} must never reference coach-only feature: ${forbidden}`);
    }
  }
});

test("AccountPrivacySection.tsx reuses the EXISTING BlockedUsersModal/DeleteAccountModal components unmodified — behavior is not reimplemented", () => {
  const source = read("src/app/team/[slug]/settings/AccountPrivacySection.tsx");
  assert.ok(source.includes('import BlockedUsersModal from "../_components/BlockedUsersModal"'), "must import the existing BlockedUsersModal, not a new component");
  assert.ok(source.includes('import DeleteAccountModal from "../_components/DeleteAccountModal"'), "must import the existing DeleteAccountModal, not a new component");
  assert.ok(source.includes("<BlockedUsersModal") && source.includes("<DeleteAccountModal"), "must actually render both existing modals");
});

test("AccountMenu.tsx no longer offers Blocked Users or Delete Account directly in the flyout — moved to Settings", () => {
  const source = read("src/app/team/[slug]/_components/AccountMenu.tsx");
  assert.ok(!source.includes("Blocked Users"), "Blocked Users must be removed from the AccountMenu flyout");
  assert.ok(!source.includes("Delete Account"), "Delete Account must be removed from the AccountMenu flyout");
  assert.ok(!source.includes("BlockedUsersModal"), "AccountMenu must no longer import/render BlockedUsersModal directly");
  assert.ok(!source.includes("DeleteAccountModal"), "AccountMenu must no longer import/render DeleteAccountModal directly");
});

test("AccountMenu.tsx still keeps Notifications, My Profile, Settings, Support & Legal, and Sign Out in the flyout", () => {
  const source = read("src/app/team/[slug]/_components/AccountMenu.tsx");
  for (const kept of ["Notifications", "Settings", "Support &amp; Legal", "Sign Out"]) {
    assert.ok(source.includes(kept), `AccountMenu must still offer: ${kept}`);
  }
});

// ─── Account-menu / Team-switcher backdrop architecture fix ────────────────────
//
// Both AccountMenu and TeamSwitcher are header dropdowns mounted under
// TeamHeader/DesktopSidebar and shared the identical trapped-stacking-
// context bug: DesktopSidebar's `position: sticky` unconditionally
// creates its own stacking context regardless of z-index, which trapped
// each dropdown's backdrop inside it — since <main>'s page content is a
// LATER sibling of DesktopSidebar at the root stacking level, it painted
// on top of the entire trapped subtree, backdrop included, which is why
// underlying cards/inputs/buttons visually "punched through" the dimming
// instead of being covered by it. Both got the identical fix, so this is
// one parameterized guard rather than two near-duplicate test blocks.

const HEADER_DROPDOWNS = [
  { file: "src/app/team/[slug]/_components/AccountMenu.tsx", name: "AccountMenu" },
  { file: "src/app/team/[slug]/_components/TeamSwitcher.tsx", name: "TeamSwitcher" },
];

for (const { file, name } of HEADER_DROPDOWNS) {
  test(`${name}.tsx portals its dropdown (backdrop + panel) to document.body, same fix as the four confirmation modals`, () => {
    const source = read(file);
    assert.ok(source.includes('import { createPortal } from "react-dom"'), `${name} must import createPortal`);
    assert.ok(source.includes("createPortal("), `${name} must call createPortal`);
    assert.ok(source.includes("document.body"), `${name} must portal into document.body`);
  });

  test(`${name}.tsx's backdrop covers the full viewport and is explicitly pointer-events: auto (so underlying page content can never receive clicks while it's open)`, () => {
    const source = read(file);
    assert.ok(/position: "fixed", inset: 0, zIndex: 99, background: "rgba\(0,0,0,\.4\)", pointerEvents: "auto"/.test(source), `${name}'s backdrop must be a full-viewport, explicitly-interactive dimming layer`);
  });

  test(`${name}.tsx's panel is explicitly pointer-events: auto too (so its own buttons/links are always clickable once portaled)`, () => {
    const source = read(file);
    const autoCount = (source.match(/pointerEvents:\s*"auto"/g) ?? []).length;
    assert.ok(autoCount >= 2, `${name} must set pointerEvents: "auto" on both the backdrop and the panel`);
  });
}

// The positioning guards below apply only to the pop-up that is still
// anchored to its trigger (TeamSwitcher). AccountMenu became a full-height
// drawer docked to the right edge (accountDrawer.test.ts), so it has no
// trigger-relative position to compute or clamp.
for (const { file, name } of HEADER_DROPDOWNS.filter(d => d.name === "TeamSwitcher")) {
  test(`${name}.tsx's dropdown panel no longer uses position: absolute anchored to the button (that anchor breaks once portaled) — it computes fixed screen coordinates instead`, () => {
    const source = read(file);
    assert.ok(source.includes("getBoundingClientRect"), `${name} must compute the panel's position from the toggle button's real screen position`);
    assert.ok(!/position: "absolute",\s*\n\s*top: "calc\(100% \+ \.5rem\)"/.test(source), `${name} must no longer rely on position:absolute + calc(100% + .5rem) anchoring, which only worked while non-portaled`);
  });

  // QA fix: the panel used to position itself with a fixed `right` distance
  // computed from the trigger's own rect, assuming a roughly-constant panel
  // width. Both AccountMenu (mounted in DesktopSidebar, at the LEFT edge of
  // the screen on desktop) and TeamSwitcher share the same mounting point
  // and so share the same overflow risk — see src/lib/menuPositioning.ts
  // and menuPositioning.test.ts for the actual clamping math.
  test(`${name}.tsx positions its panel using the shared viewport-clamping helper (computeClampedMenuPosition), not a raw right-distance calculation`, () => {
    const source = read(file);
    assert.ok(source.includes('import { computeClampedMenuPosition'), `${name} must import computeClampedMenuPosition from the shared helper`);
    assert.ok(source.includes("computeClampedMenuPosition("), `${name} must call computeClampedMenuPosition to compute the panel's position`);
    assert.ok(!/right:\s*window\.innerWidth\s*-\s*rect\.right/.test(source), `${name} must no longer use the old fixed right-distance calculation that could push the panel's left edge off-screen`);
  });

  test(`${name}.tsx re-clamps the panel against its OWN measured size (ref + useLayoutEffect) before paint, not just an initial guess`, () => {
    const source = read(file);
    assert.ok(source.includes("useLayoutEffect"), `${name} must use useLayoutEffect to re-clamp before the browser paints`);
    assert.ok(/panelRef\.current\.getBoundingClientRect\(\)/.test(source), `${name} must measure the panel's own real rendered size`);
    assert.ok(source.includes("panelRef"), `${name}'s panel element must carry a ref for measurement`);
  });

  test(`${name}.tsx caps the panel to the viewport width so it can never be wider than the screen on narrow/mobile widths`, () => {
    const source = read(file);
    assert.ok(/maxWidth:\s*`calc\(100vw - \$\{MENU_VIEWPORT_PADDING \* 2\}px\)`/.test(source), `${name}'s panel must cap its own width to the viewport, independent of the clamping math`);
  });
}

test("TeamSwitcher.tsx still switches teams via router.push and still signs out via the native-aware logout helper — team-switching/sign-out logic is untouched by the portal fix", () => {
  const source = read("src/app/team/[slug]/_components/TeamSwitcher.tsx");
  assert.ok(source.includes('router.push(`/team/${slug}/home`)'), "switchTo must still navigate to the selected team's home");
  assert.ok(source.includes("performNativeAwareLogout"), "Sign Out must still route through the native-aware logout helper on iOS");
  assert.ok(source.includes('action="/api/auth/logout"'), "Sign Out form must still POST to the same logout endpoint");
});

// ─── Settings identity card: profile photo, same source as AccountMenu ────────
//
// QA fix: the Settings identity card (coach strip in SettingsView, general
// strip in MemberSettingsView) always showed initials, even for an account
// with a real profile photo. Both were switched to the shared
// IdentityAvatar component, fed the SAME elf_accounts.profile_photo_url
// AccountMenu already displays (getAccountSession(), resolved once in
// settings/page.tsx) — no second photo storage/resolution system.

test("IdentityAvatar.tsx renders the profile photo when one is provided, with a circular crop, object-fit: cover, and accessible alt text — no email/private IDs in the alt text", () => {
  const source = read("src/app/team/[slug]/settings/IdentityAvatar.tsx");
  assert.ok(source.includes("photoUrl ?"), "must conditionally render based on whether a photo URL was provided");
  assert.ok(source.includes('src={photoUrl}'), "must render the provided photo as the <img> src");
  assert.ok(/alt=\{`\$\{name\}'s profile photo`\}/.test(source), "alt text must be based on the account's name only — never email or an internal id");
  assert.ok(source.includes('borderRadius: "50%"'), "avatar must be circular");
  assert.ok(source.includes('objectFit: "cover"'), "photo must use object-fit: cover so it fills the circle without distortion");
});

test("IdentityAvatar.tsx falls back to initials when no photo URL is provided — the fallback is not lost by the photo change", () => {
  const source = read("src/app/team/[slug]/settings/IdentityAvatar.tsx");
  assert.ok(/const initials = name\.split/.test(source), "must still compute initials from the name");
  // The ternary's else-branch (no photoUrl) must render `initials`, not a
  // second hardcoded fallback — i.e. the same `initials` variable is what
  // renders when photoUrl is falsy.
  assert.ok(/\) : \(\s*initials\s*\)/.test(source), "must render the computed `initials` value when no photo URL is provided");
});

test("SettingsHome.tsx (every role's identity card) renders IdentityAvatar with a photoUrl prop, reusing the SAME component", () => {
  const source = read("src/app/team/[slug]/settings/SettingsHome.tsx");
  assert.ok(source.includes('import IdentityAvatar from "./IdentityAvatar"'), "must import the shared IdentityAvatar component");
  assert.ok(/<IdentityAvatar name=\{.+\} photoUrl=\{photoUrl\}/.test(source), "must render <IdentityAvatar> with a photoUrl prop");
});

test("settings/page.tsx resolves photoUrl from the SAME getAccountSession() source AccountMenu uses (layout.tsx), and passes it to the Settings home for every role", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  assert.ok(source.includes('import { getAccountSession } from "@/lib/accountSession"'), "must import the existing getAccountSession() resolver, not a new one");
  assert.ok(source.includes("accountSession?.profile_photo_url"), "must read profile_photo_url off the resolved account session, same field AccountMenu/layout.tsx reads");
  assert.ok(/<SettingsHome[\s\S]{0,300}photoUrl=\{photoUrl\}/.test(source), "must pass photoUrl to SettingsHome");
});
