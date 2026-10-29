// CSS isolation (R1) — marketing styles must never reach the Team App, the
// admin portal or public campaign pages again. globals.css is loaded on
// EVERY page, so a bare element rule there (the old
// `section { padding: 6rem 5% }`) silently re-styles any screen that uses
// that element: it caused the Fundraiser and Attendance spacing bugs. These
// guards keep globals.css down to tokens + the true base reset, keep
// marketing.css and the admin stylesheet inside their own prefixes, and make
// every non-marketing <section> say explicitly how it is padded.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every selector in a stylesheet, including those nested in @media/@supports. */
function selectors(css: string): string[] {
  const out: string[] = [];
  const body = stripCssComments(css).replace(/@imports+url([^)]*)s*;/g, "");
  for (const m of body.matchAll(/([^{}]+)\{/g)) {
    const head = m[1].trim();
    if (!head || head.startsWith("@")) continue;
    for (const s of head.split(",")) out.push(s.trim());
  }
  return out;
}

test("globals.css holds only tokens and the base reset (:root, *, html, body) — no marketing rules", () => {
  const css = read("src/app/globals.css");
  const sels = selectors(css);
  assert.ok(sels.length > 0);
  for (const s of sels) {
    assert.ok([":root", "*", "html", "body"].includes(s), `globals.css must not style "${s}" — it applies to every app page`);
  }
  assert.ok(!/@keyframes|@media/.test(stripCssComments(css)), "no animations or media queries in globals.css");
});

test("the old marketing element rules live only in marketing.css, scoped to the marketing shell", () => {
  const mk = read("src/app/marketing.css");
  assert.match(mk, /:where\(\.mk-root\) section \{\n  padding: 6rem 5%;\n\}/);
  assert.match(mk, /:where\(\.mk-root\) footer \{\n  background: #060F1E;\n  padding: 3\.5rem 5%;\n  border-top: 1px solid rgba\(212,160,23,0\.15\);\n\}/);
  assert.match(read("src/components/marketing/MarketingShell.tsx"), /className=\{`mk-root /, "MarketingShell renders the .mk-root scope");
});

test("every marketing.css selector is inside the marketing scope (.mk-* or :where(.mk-root))", () => {
  for (const s of selectors(read("src/app/marketing.css"))) {
    if (/^(from|to|\d+(\.\d+)?%)$/.test(s)) continue; // @keyframes steps
    // The selector's first compound must carry an .mk-* class (e.g. ".mk-nav a",
    // "a.mk-btn:hover") or be the :where(.mk-root) scope itself.
    const first = s.split(/\s*[\s>+~]\s*/)[0];
    assert.ok(first === ":where(.mk-root)" || /\.mk-/.test(first), `marketing.css selector escapes the marketing scope: "${s}"`);
  }
});

test("every admin stylesheet selector stays inside the .adm- prefix; admin sections keep their spacing explicitly", () => {
  for (const s of selectors(read("src/app/admin/adminResponsive.css"))) {
    assert.ok(/^\.adm-/.test(s), `adminResponsive.css selector escapes the admin prefix: "${s}"`);
  }
  assert.match(read("src/app/admin/adminResponsive.css"), /\.adm-section \{\n  padding: 6rem 5%;\n\}/);
});

/** <section> tags in a TSX file, ignoring ones that only appear in comments. */
function sectionTags(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  return code.match(/<section\b[^>]*>/g) ?? [];
}

test("no app, admin or campaign <section> relies on a global element rule: each has a className or explicit padding", () => {
  const files = execSync("git ls-files src", { cwd: ROOT }).toString().trim().split("\n")
    .filter(f => f.endsWith(".tsx") && !/\.test\./.test(f))
    .filter(f => !/src\/app\/\(marketing\)\/|src\/components\/marketing\/|src\/app\/MarketingPage\.tsx$/.test(f));
  const offenders: string[] = [];
  for (const f of files) {
    for (const tag of sectionTags(read(f))) {
      if (!/className=/.test(tag) && !/padding/.test(tag)) offenders.push(`${f}: ${tag}`);
    }
  }
  assert.deepEqual(offenders, [], "add a scoped class (e.g. .adm-section in the admin portal) instead of relying on globals.css");
});

test("every admin <section> uses .adm-section (the explicit replacement for the old global padding)", () => {
  const files = execSync("git ls-files src/app/admin", { cwd: ROOT }).toString().trim().split("\n").filter(f => f.endsWith(".tsx"));
  let count = 0;
  for (const f of files) {
    for (const tag of sectionTags(read(f))) {
      count++;
      assert.match(tag, /className="adm-section"/, `${f}: ${tag}`);
    }
  }
  assert.ok(count >= 44, `expected the 44 admin sections, found ${count}`);
});

test("the public campaign footer styles itself (does not depend on a global footer rule)", () => {
  const css = stripCssComments(read("src/app/campaign/_shared/campaign.css"));
  const block = css.split(/\n\.pc-footer \{/)[1]?.split("}")[0] ?? "";
  for (const prop of ["background:", "border-top:", "padding:"]) assert.ok(block.includes(prop), `.pc-footer sets ${prop}`);
});
