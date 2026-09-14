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
  test(`${file} renders its overlay via createPortal(..., document.body), not inline`, () => {
    const source = readFileSync(join(process.cwd(), "src/app/team/[slug]/_components", file), "utf8");
    assert.ok(source.includes('import { createPortal } from "react-dom"'), `${file} must import createPortal`);
    assert.ok(source.includes("return createPortal("), `${file} must return createPortal(...)`);
    assert.ok(source.includes("document.body"), `${file} must portal into document.body`);
  });
}
