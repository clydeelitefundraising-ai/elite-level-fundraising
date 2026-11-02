// Hydration (React #418) — JSX text that starts with a space right after an
// element or expression. With reactCompiler on, the server (SSR) build
// compiled these four texts WITHOUT their leading space while the client
// build kept it, so the server HTML and the first client render differed
// (found by comparing .next/server and .next/static string literals). Each
// space is now an explicit {" "}, which both builds render identically.
// Visible copy is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");

const CASES: { file: string; fixed: RegExp; broken: RegExp }[] = [
  {
    file: "src/components/marketing/demo/FundraisingPreview.tsx",
    fixed: /\{SAMPLE_NOTICE\}\{" "\}Try the leaderboard filters/,
    broken: /\{SAMPLE_NOTICE\} Try/,
  },
  {
    file: "src/app/team/[slug]/settings/TeamAccessSection.tsx",
    fixed: /<QrCode size=\{15\} \/>\{" "\}Team QR &amp; Signup Sheet/,
    broken: /<QrCode size=\{15\} \/> Team QR/,
  },
  {
    file: "src/app/team/[slug]/attendance/AttendanceScreen.tsx",
    fixed: /Showing \{visible\.length\} of \{list\.inSession\}\{" "\}athletes\. Filters only change what&apos;s shown — Save Draft always saves every athlete\./,
    broken: /\{list\.inSession\} athletes\./,
  },
  {
    file: "src/app/coach-login/page.tsx",
    fixed: /Coaching more than one team\? <a href="\/login"[^>]*>Use your ELF account<\/a>\{" "\}instead — ask your administrator for an activation link if you haven&apos;t set one up yet\./,
    broken: /<\/a> instead — ask your administrator/,
  },
];

for (const { file, fixed, broken } of CASES) {
  test(`hydration whitespace: ${file} uses an explicit {" "} (same text on server and client)`, () => {
    const src = read(file);
    assert.match(src, fixed);
    assert.doesNotMatch(src, broken);
  });
}

test("the marketing demo's generated attendance twin carries the same fix", () => {
  const twin = read("src/components/marketing/team-app-demo/DemoAttendanceScreen.tsx");
  assert.match(twin, /\{list\.inSession\}\{" "\}athletes\./);
});
