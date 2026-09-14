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

test("settings/page.tsx: a real coach (Head Coach or Assistant Coach — both are actor.kind === 'coach') renders the full SettingsView", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  assert.ok(source.includes('actor.kind === "coach"'), "must branch on actor.kind === 'coach'");
  assert.ok(/actor\.kind === "coach"[\s\S]{0,400}<SettingsView/.test(source), "the coach branch must render SettingsView (full existing coach settings)");
});

test("settings/page.tsx: every non-coach role (athlete/parent/booster/platform admin) renders MemberSettingsView, never SettingsView", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  assert.ok(source.includes("<MemberSettingsView"), "must render MemberSettingsView for the non-coach fallback");
  assert.ok(source.includes("memberRoleLabel") && source.includes("platformAdminRoleLabel"), "must resolve a real role label for both member and platform_admin actors");
});

test("settings/page.tsx still redirects an unauthenticated (public) visitor — unchanged", () => {
  const source = read("src/app/team/[slug]/settings/page.tsx");
  assert.ok(/actor\.kind === "public"[\s\S]{0,80}redirect/.test(source), "public visitors must still be redirected, not shown any settings view");
});

test("SettingsView.tsx (coach settings) includes AccountPrivacySection — coaches reach Blocked Users/Delete Account from Settings too", () => {
  const source = read("src/app/team/[slug]/settings/SettingsView.tsx");
  assert.ok(source.includes('import AccountPrivacySection from "./AccountPrivacySection"'), "SettingsView must import AccountPrivacySection");
  assert.ok(source.includes("<AccountPrivacySection"), "SettingsView must render AccountPrivacySection");
});

test("MemberSettingsView.tsx (non-coach settings) includes AccountPrivacySection — the ONLY thing GENERAL settings needs to expose, no coach-only controls", () => {
  const source = read("src/app/team/[slug]/settings/MemberSettingsView.tsx");
  assert.ok(source.includes('import AccountPrivacySection from "./AccountPrivacySection"'), "MemberSettingsView must import AccountPrivacySection");
  assert.ok(source.includes("<AccountPrivacySection"), "MemberSettingsView must render AccountPrivacySection");
  // Coach-only concerns that must never leak into the general settings view.
  for (const forbidden of ["TeamBrandingSection", "CoachFundraisingSection", "TeamQrModal", "join-codes", "Manage Team Staff"]) {
    assert.ok(!source.includes(forbidden), `MemberSettingsView must never reference coach-only feature: ${forbidden}`);
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

// ─── Account-menu backdrop architecture fix ────────────────────────────────────

test("AccountMenu.tsx portals its dropdown (backdrop + panel) to document.body, same fix as the four confirmation modals", () => {
  const source = read("src/app/team/[slug]/_components/AccountMenu.tsx");
  assert.ok(source.includes('import { createPortal } from "react-dom"'), "must import createPortal");
  assert.ok(source.includes("createPortal("), "must call createPortal");
  assert.ok(source.includes("document.body"), "must portal into document.body");
});

test("AccountMenu.tsx's backdrop covers the full viewport and is explicitly pointer-events: auto (so underlying page content can never receive clicks while it's open)", () => {
  const source = read("src/app/team/[slug]/_components/AccountMenu.tsx");
  assert.ok(/position: "fixed", inset: 0, zIndex: 99, background: "rgba\(0,0,0,\.4\)", pointerEvents: "auto"/.test(source), "backdrop must be a full-viewport, explicitly-interactive dimming layer");
});

test("AccountMenu.tsx's dropdown panel no longer uses position: absolute anchored to the button (that anchor breaks once portaled) — it computes fixed screen coordinates instead", () => {
  const source = read("src/app/team/[slug]/_components/AccountMenu.tsx");
  assert.ok(source.includes("getBoundingClientRect"), "must compute the panel's position from the toggle button's real screen position");
  assert.ok(!/position: "absolute",\s*\n\s*top: "calc\(100% \+ \.5rem\)"/.test(source), "must no longer rely on position:absolute + calc(100% + .5rem) anchoring, which only worked while non-portaled");
});
