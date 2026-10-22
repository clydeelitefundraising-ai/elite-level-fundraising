#!/usr/bin/env node
// Prepares supabase/baseline/schema.sql for a FRESH Supabase project.
//
// The baseline was dumped from production and includes one object that
// Supabase itself installs on every new project: the event-trigger function
// public.rls_auto_enable() (and its three GRANTs). On a new project it may
// already exist under a platform-owned role, where re-creating or
// re-granting it as "postgres" would fail. The app never calls it. This
// removes exactly that definition block and those three GRANT lines — and
// fails if the file doesn't contain exactly them — leaving every other
// statement byte-for-byte unchanged.
//
//   node scripts/qa/prepare-baseline.mjs <input schema.sql> <output file>
import { readFileSync, writeFileSync } from "node:fs";

export function prepareBaseline(text) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith('CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"'));
  const end = lines.findIndex(l => l === 'ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";');
  if (start < 0 || end < 0 || end <= start || end - start > 40) throw new Error("rls_auto_enable block not found exactly once");
  const grants = lines
    .map((l, i) => ({ l, i }))
    .filter(x => /^GRANT ALL ON FUNCTION "public"\."rls_auto_enable"\(\) TO "(anon|authenticated|service_role)";$/.test(x.l));
  if (grants.length !== 3) throw new Error(`expected 3 rls_auto_enable grants, found ${grants.length}`);
  const others = lines.filter((l, i) => (i < start || i > end) && l.includes("rls_auto_enable") && !grants.some(g => g.i === i));
  if (others.length) throw new Error("unexpected other references to rls_auto_enable");
  const drop = new Set([...Array.from({ length: end - start + 1 }, (_, k) => start + k), ...grants.map(g => g.i)]);
  const out = lines.filter((_, i) => !drop.has(i));
  return { text: out.join(nl), removedLines: drop.size };
}

if (process.argv[1] && process.argv[1].endsWith("prepare-baseline.mjs")) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error("usage: prepare-baseline.mjs <input> <output>"); process.exit(2); }
  const { text, removedLines } = prepareBaseline(readFileSync(input, "utf8"));
  writeFileSync(output, text);
  console.error(`prepared baseline: removed ${removedLines} lines (rls_auto_enable, platform-managed)`);
}
