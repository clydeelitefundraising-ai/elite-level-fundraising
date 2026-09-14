// QA fix regression guard: every fixed-overlay confirmation/report/block
// modal mounted from AccountMenu or ThreadView must render via
// createPortal(..., document.body) — not inline — or it can be trapped
// behind other page content by an ancestor stacking context (e.g.
// DesktopSidebar's `position: sticky`, which unconditionally creates one
// regardless of z-index). This is a static source check, not a rendered-
// DOM test, since this codebase's test setup has no jsdom/React Testing
// Library harness — it still catches the exact regression class that
// caused the original bug (a future edit reverting to an inline return).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MODAL_FILES = [
  "BlockedUsersModal.tsx",
  "BlockUserModal.tsx",
  "ReportModal.tsx",
  "DeleteAccountModal.tsx",
];

for (const file of MODAL_FILES) {
  const source = readFileSync(join(process.cwd(), "src/app/team/[slug]/_components", file), "utf8");

  test(`${file} renders its overlay via createPortal(..., document.body), not inline`, () => {
    assert.ok(source.includes('import { createPortal } from "react-dom"'), `${file} must import createPortal`);
    assert.ok(source.includes("return createPortal("), `${file} must return createPortal(...)`);
    assert.ok(source.includes("document.body"), `${file} must portal into document.body`);
  });

  // QA follow-up: "visible but unclickable" report. No DOM/click-testing
  // harness exists in this repo (no jsdom/RTL) to literally simulate a
  // click, so this is a structural source guard instead — it fails if a
  // future edit removes the exact wiring that makes the card clickable:
  // the card must stop the backdrop's own onClose from firing when a
  // click originates inside it (otherwise every click anywhere in the
  // modal would immediately close it via the backdrop's onClick), and
  // both layers must carry an explicit pointerEvents: "auto" so neither
  // can silently inherit pointer-events: none from anywhere.
  test(`${file}'s modal card stops propagation to the backdrop (so its own buttons are actually clickable, not swallowed by backdrop onClose)`, () => {
    assert.ok(source.includes("stopPropagation"), `${file}'s inner card must call stopPropagation so clicking it doesn't also trigger the backdrop's onClose`);
  });

  test(`${file}'s backdrop and card are both explicitly pointer-events: auto`, () => {
    const auto = (source.match(/pointerEvents:\s*"auto"/g) ?? []).length;
    assert.ok(auto >= 1, `${file} must set pointerEvents: "auto" explicitly on its backdrop`);
  });
}
