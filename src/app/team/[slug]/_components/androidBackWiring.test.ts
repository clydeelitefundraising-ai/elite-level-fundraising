// Static source guard (same constraint as modalPortals.test.ts: no
// jsdom/React Testing Library harness exists in this repo to render these
// components and simulate a real Android back-button event). This catches
// the regression class that caused the original bug — a modal added later,
// or one of these edited, without wiring into the shared Android back-close
// contract — even without executing the components.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS_DIR = join(process.cwd(), "src/app/team/[slug]/_components");

// Every one of these mounts/stays open only while the user should be able
// to dismiss it with Android's hardware/system Back button (see
// src/hooks/useAndroidBackClose.ts for the shared contract with
// MainActivity.java). Modal.tsx alone covers ~18 other call sites app-wide.
const OVERLAY_FILES = [
  "Modal.tsx",
  "BlockedUsersModal.tsx",
  "DeleteAccountModal.tsx",
  "BlockUserModal.tsx",
  "ReportModal.tsx",
  "AccountMenu.tsx",
];

for (const file of OVERLAY_FILES) {
  const source = readFileSync(join(COMPONENTS_DIR, file), "utf8");

  test(`${file} imports useAndroidBackClose from the shared hook (not a second/local Android-back mechanism)`, () => {
    assert.ok(
      source.includes('from "@/hooks/useAndroidBackClose"'),
      `${file} must import useAndroidBackClose from @/hooks/useAndroidBackClose`,
    );
  });

  test(`${file} actually calls useAndroidBackClose(...)`, () => {
    assert.ok(
      /useAndroidBackClose\(/.test(source),
      `${file} imports the hook but never calls it — Android back would silently do nothing for this overlay`,
    );
  });
}

test("AccountMenu.tsx no longer defines its own inline __elfHasOpenOverlay/elfAndroidBackButton wiring (fully migrated to the shared hook)", () => {
  const source = readFileSync(join(COMPONENTS_DIR, "AccountMenu.tsx"), "utf8");
  assert.ok(
    !source.includes("window.addEventListener(\"elfAndroidBackButton\""),
    "AccountMenu.tsx should call useAndroidBackClose rather than registering its own listener directly",
  );
});

// Phase 1A.1: overlays that live outside _components/ and are NOT built on
// Modal.tsx (hand-rolled dropdowns / a hand-rolled full-screen compose
// overlay). Each must register with the same shared hook, and the ones
// that stay mounted while closed must gate it on their own open state.
const SRC_APP = join(process.cwd(), "src/app");

function read(relPath: string): string {
  return readFileSync(join(SRC_APP, relPath), "utf8");
}

// Returns the source from `marker` up to the next top-level function
// declaration, so an assertion can't be satisfied by a call elsewhere in the
// same file (e.g. another component's hook call).
function sliceComponent(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.ok(start !== -1, `expected to find ${marker}`);
  const rest = source.slice(start + marker.length);
  const next = rest.search(/\n(?:export default )?function /);
  return next === -1 ? source.slice(start) : source.slice(start, start + marker.length + next);
}

test("ThreadView.tsx registers its Report/Block '...' menu with the shared hook, gated on menuOpen", () => {
  const source = read("team/[slug]/messages/[threadId]/ThreadView.tsx");
  assert.ok(source.includes('from "@/hooks/useAndroidBackClose"'));
  assert.ok(
    source.includes("useAndroidBackClose(() => setMenuOpen(false), menuOpen)"),
    "the thread menu must close on Android Back and only be registered while open",
  );
});

test("MessagesView.tsx ComposeModal registers itself with the shared hook (mounted only while open)", () => {
  const source = read("team/[slug]/messages/MessagesView.tsx");
  assert.ok(source.includes('from "@/hooks/useAndroidBackClose"'));
  const compose = sliceComponent(source, "function ComposeModal(");
  assert.ok(
    compose.includes("useAndroidBackClose(onClose)"),
    "ComposeModal must call useAndroidBackClose(onClose) inside its own body",
  );
});

test("ExportMenu.tsx registers its dropdown with the shared hook, gated on its open state", () => {
  const source = read("team/[slug]/calendar/ExportMenu.tsx");
  assert.ok(source.includes('from "@/hooks/useAndroidBackClose"'));
  assert.ok(source.includes("useAndroidBackClose(() => setOpen(false), open)"));
});

test("TeamsView.tsx ProfileMenu registers with the shared hook, gated on its open state", () => {
  const source = read("teams/TeamsView.tsx");
  assert.ok(source.includes('from "@/hooks/useAndroidBackClose"'));
  const menu = sliceComponent(source, "function ProfileMenu(");
  assert.ok(
    menu.includes("useAndroidBackClose(() => setOpen(false), open)"),
    "ProfileMenu must call the hook inside its own body, not another component's",
  );
});

test("BlockUserModal.tsx keeps an explicit space between the name and \"won't\" (an implicit JSX space is dropped by the compiler before an entity)", () => {
  const source = readFileSync(join(COMPONENTS_DIR, "BlockUserModal.tsx"), "utf8");
  assert.ok(
    source.includes('{blockedName}{" "}won&apos;t be able to start a new direct message'),
    "the space after {blockedName} must be an explicit {\" \"} expression",
  );
  assert.ok(
    !source.includes("{blockedName} won&apos;t"),
    "the implicit-space form renders as 'Namewon't' in the compiled bundle",
  );
});
