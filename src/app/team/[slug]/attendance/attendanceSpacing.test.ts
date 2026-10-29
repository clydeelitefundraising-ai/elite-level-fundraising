// Attendance mobile spacing fix — guards against the regression: the class
// groups were bare <section> elements, so globals.css's marketing rule
// `section { padding: 6rem 5% }` added ~192px of blank space between grade
// groups (and a 5% side indent) on every platform. Layout only — no
// attendance behavior is covered or changed here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src/app/team/[slug]/attendance");
const read = (f: string) => readFileSync(join(DIR, f), "utf8").replace(/\r\n/g, "\n");
const css = read("Attendance.module.css");
const rule = (name: string) => {
  const body = css.split(`\n.${name} {`)[1];
  assert.ok(body, `.${name} rule exists`);
  return body.split("\n}")[0];
};

test("every <section> in the attendance screen carries a class (never picks up the global section padding)", () => {
  for (const f of readdirSync(DIR).filter(n => n.endsWith(".tsx"))) {
    for (const tag of read(f).match(/<section\b[^>]*>/g) ?? []) {
      assert.match(tag, /className=/, `${f}: ${tag}`);
    }
  }
});

test("class groups and the removed-athletes group use .classGroup, which resets padding and margin", () => {
  const screen = read("AttendanceScreen.tsx");
  assert.match(screen, /<section key=\{g\.label\} className=\{styles\.classGroup\} aria-labelledby=\{`att-class-\$\{i\}`\}>/);
  assert.match(screen, /<section className=\{styles\.classGroup\} aria-labelledby="att-removed-title">/);
  const group = rule("classGroup");
  assert.match(group, /padding: 0;/);
  assert.match(group, /margin: 0;/);
  assert.ok(!/min-height|height:|flex-grow|justify-content/.test(group), "no stretched or fixed-height groups");
});

test("spacing targets: ~23px between grade groups, 12px between athlete cards, equal Present/Absent", () => {
  assert.match(rule("classPanel"), /gap: \.85rem;/);
  assert.match(rule("classHeading"), /margin: \.6rem 0 \.5rem;/);
  assert.match(rule("list"), /gap: \.75rem;/);
  assert.match(rule("segmented"), /grid-template-columns: 1fr 1fr;/);
});

test("Save Draft bar still sticks above the bottom nav and home indicator", () => {
  const bar = rule("saveBar");
  assert.match(bar, /position: sticky;/);
  assert.match(bar, /bottom: calc\(4rem \+ env\(safe-area-inset-bottom, 0px\)\);/);
});
