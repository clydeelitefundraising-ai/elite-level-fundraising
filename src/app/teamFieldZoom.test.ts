// iOS focus zoom — Team App text fields must render at 16px or larger on
// phones and tablets. iOS Safari / WKWebView zooms the whole page when a
// focused field is under 16px and doesn't zoom back out (the roster's
// "Search athletes…" field, .85rem, left the app wider than the screen).
// The fix is one shared rule in design-system.css; these guards keep it,
// its scope, and accessibility zoom intact.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const css = read("src/app/design-system.css");

const FIELDS = ':is(input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="hidden"], [type="button"], [type="submit"], [type="reset"], [type="image"]), textarea, select):not([data-elf-font="large"])';
const RULE = (scope: string) =>
  `@media (max-width: 767px), (pointer: coarse) {\n  ${scope} ${FIELDS} {\n    font-size: 16px !important;\n  }\n}`;

test("design-system.css raises every Team App text field to 16px on phones and touch devices", () => {
  assert.ok(css.includes(RULE(".elf-shell")), "fields inside the Team App shell");
  assert.ok(css.includes(RULE("body.elf-team-app")), "Team App modals portalled to <body>, every iOS version");
  assert.ok(css.includes(RULE("body:has(.elf-shell)")), "portalled fields without the body class (iOS 15.4+)");
});

test("iOS 15.0–15.3: modal coverage doesn't depend on :has()", () => {
  // The body-class rule uses only selectors Safari has supported since
  // iOS 14 (:is, :not with a list, attribute selectors).
  const block = css.match(/@media \(max-width: 767px\), \(pointer: coarse\) \{\n  body\.elf-team-app [\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(block, "body.elf-team-app rule present");
  assert.doesNotMatch(block, /:has\(/);
  // …and the Team App layout mounts the component that sets the class.
  const layout = read("src/app/team/[slug]/layout.tsx");
  assert.match(layout, /import TeamBodyClass from "\.\/_components\/TeamBodyClass";/);
  assert.match(layout, /<TeamBodyClass \/>/);
});

test("TeamBodyClass adds elf-team-app to <body> on mount and removes it on unmount", () => {
  const src = read("src/app/team/[slug]/_components/TeamBodyClass.tsx");
  assert.match(src, /export const TEAM_APP_BODY_CLASS = "elf-team-app";/);
  assert.match(src, /document\.body\.classList\.add\(TEAM_APP_BODY_CLASS\);\n\s*return \(\) => document\.body\.classList\.remove\(TEAM_APP_BODY_CLASS\);/);
  assert.match(src, /\}, \[\]\);/, "runs once per mount");
});

test("the three scopes stay separate rules (an unsupported :has() must not drop the others on iOS 15.0–15.3)", () => {
  const blocks = css.match(/@media \(max-width: 767px\), \(pointer: coarse\) \{[\s\S]*?\n\}/g) ?? [];
  const fieldBlocks = blocks.filter(b => b.includes("font-size: 16px !important"));
  assert.equal(fieldBlocks.length, 3);
  assert.equal(fieldBlocks.filter(b => b.includes(":has(")).length, 1, ":has() appears in exactly one rule");
  assert.ok(fieldBlocks.some(b => b.includes("  .elf-shell :is(")));
});

test("desktop keeps each field's own size: the rule is only for narrow screens or coarse pointers", () => {
  const outside = css.replace(/@media [^{]+\{[\s\S]*?\n\}/g, "");
  assert.doesNotMatch(outside, /font-size: 16px !important/);
});

test("the Team App renders the .elf-shell root the rule is scoped to", () => {
  assert.match(read("src/app/team/[slug]/layout.tsx"), /<div className="elf-shell"/);
});

test("accessibility zoom is never disabled", () => {
  const layout = read("src/app/layout.tsx");
  const viewport = /export const viewport: Viewport = \{([\s\S]*?)\n\};/.exec(layout)?.[1] ?? "";
  assert.ok(viewport, "root viewport export found");
  assert.doesNotMatch(viewport, /maximumScale|userScalable|minimumScale/);
  assert.doesNotMatch(layout, /user-scalable|maximum-scale/);
});

test("only fields deliberately above 16px opt out, and they really are", () => {
  const src = read("src/app/team/[slug]/contacts/coach/CoachContactsView.tsx");
  const field = /<input[\s\S]*?data-elf-font="large"[\s\S]*?\/>/.exec(src)?.[0] ?? "";
  assert.match(field, /fontSize: "1\.1rem"/, "the Contact Goal field is 17.6px");
});

test("sign-in and sign-up fields (outside the Team App shell) are already 16px", () => {
  const auth = read("src/components/auth/authEntry.module.css");
  const input = /\.input \{([^}]*)\}/.exec(auth)?.[1] ?? "";
  assert.match(input, /font-size: 1rem;/);
});
