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
