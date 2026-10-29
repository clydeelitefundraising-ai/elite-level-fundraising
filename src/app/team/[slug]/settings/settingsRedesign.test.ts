// Settings Redesign — compact Settings home, dedicated screens and role
// boundaries. Components are rendered as server markup through the same TSX
// test loader the attendance/partners/fundraiser UI tests use. Page files
// fetch from Supabase, so their gates are covered by source guards (same
// approach as settingsAccess.test.ts / publicAthletePhotosUi.test.ts).
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

register(new URL("../attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const cats = await import("./settingsCategories.ts");
const { default: SettingsHome } = await import("./SettingsHome.tsx");
const { default: SettingsScreen, SettingsAccessGate } = await import("./SettingsScreen.tsx");
const { default: TeamAccessSection } = await import("./TeamAccessSection.tsx");
const { default: SignOutButton } = await import("./SignOutButton.tsx");
const { filterAthletesByName } = await import("./PublicAthletePhotosSection.tsx");

const { settingsCategoriesFor, canOpenSettingsCategory, settingsCategoryHref } = cats;
type Actor = Parameters<typeof settingsCategoriesFor>[0];
type Category = Parameters<typeof canOpenSettingsCategory>[1];

const SLUG = "lions-track";
const DIR = "src/app/team/[slug]/settings";
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
const html = (el: unknown) => renderToStaticMarkup(el as never);

const coach = (role: "head_coach" | "assistant_coach") =>
  ({ kind: "coach", session: { id: "c1", name: "Hana Head", role, campaign_slug: SLUG } }) as unknown as Actor;
const member = (role: "athlete" | "parent" | "booster") =>
  ({ kind: "member", session: { id: "m1", name: "Jo Junior", role, campaign_slug: SLUG, athlete_id: null } }) as unknown as Actor;
const admin = { kind: "platform_admin", session: { id: "p1", name: "Pat Admin", role: "admin", campaign_slug: SLUG } } as unknown as Actor;
const publicActor = { kind: "public" } as unknown as Actor;

const ROLES: [string, Actor, { team: Category[]; personal: Category[] }][] = [
  ["Head Coach", coach("head_coach"), { team: ["access", "branding", "coach-fundraising", "athlete-photos", "staff", "teams"], personal: ["notifications", "account"] }],
  ["Assistant Coach", coach("assistant_coach"), { team: ["access", "teams"], personal: ["notifications", "account"] }],
  ["Athlete", member("athlete"), { team: [], personal: ["notifications", "account"] }],
  ["Parent", member("parent"), { team: [], personal: ["notifications", "account"] }],
  ["Booster", member("booster"), { team: [], personal: ["notifications", "account"] }],
  ["Platform Admin", admin, { team: [], personal: ["notifications", "account"] }],
];
const ALL: Category[] = ["access", "branding", "coach-fundraising", "athlete-photos", "staff", "teams", "notifications", "account"];

// ── 1. Settings home for each role ───────────────────────────────────────────

for (const [label, actor, expected] of ROLES) {
  test(`${label}: Settings home shows exactly the authorized categories`, () => {
    assert.deepEqual(settingsCategoriesFor(actor), expected);
    const markup = html(createElement(SettingsHome, {
      slug: SLUG, name: "Test User", roleLabel: label, photoUrl: null,
      categories: settingsCategoriesFor(actor), summaries: { access: "Join code ABC123 · Active", notifications: "Choose which push notifications you get" },
    }));
    for (const c of ALL) {
      const shown = [...expected.team, ...expected.personal].includes(c);
      assert.equal(markup.includes(`data-testid="settings-row-${c}"`), shown, `${label} ${c}`);
    }
    assert.equal(markup.includes("Team Management"), expected.team.length > 0);
    assert.ok(markup.includes("Personal Settings"));
    assert.ok(markup.includes("Sign Out"), "Sign Out stays at the bottom for every role");
    assert.ok(markup.indexOf("Sign Out") > markup.indexOf("Personal Settings"));
  });
}

test("public visitors open no Settings category", () => {
  for (const c of ALL) assert.equal(canOpenSettingsCategory(publicActor, c), false, c);
});

test("home rows link to their screens; Team Staff and Switch Teams link to the existing pages", () => {
  const markup = html(createElement(SettingsHome, {
    slug: SLUG, name: "Hana Head", roleLabel: "Head Coach", photoUrl: null,
    categories: settingsCategoriesFor(coach("head_coach")), summaries: { "athlete-photos": "Off" },
  }));
  for (const c of ["access", "branding", "coach-fundraising", "athlete-photos", "notifications", "account"]) {
    assert.ok(markup.includes(`href="/team/${SLUG}/settings/${c}"`), c);
  }
  assert.equal(settingsCategoryHref(SLUG, "staff"), `/team/${SLUG}/staff`);
  assert.equal(settingsCategoryHref(SLUG, "teams"), "/teams");
  assert.ok(markup.includes(`href="/team/${SLUG}/staff"`) && markup.includes('href="/teams"'));
  assert.ok(markup.includes(">Off<"), "status summary shown");
  assert.ok(markup.includes("Public Athlete Photos") && markup.includes("Account &amp; Privacy"));
});

// ── 2. Direct URL access to each screen ──────────────────────────────────────

const SCREENS: { file: string; category: Category; gate: string | null }[] = [
  { file: "access/page.tsx", category: "access", gate: 'who="coaching staff"' },
  { file: "branding/page.tsx", category: "branding", gate: 'who="Head Coach"' },
  { file: "coach-fundraising/page.tsx", category: "coach-fundraising", gate: 'who="Head Coach"' },
  { file: "athlete-photos/page.tsx", category: "athlete-photos", gate: 'who="Head Coach"' },
  { file: "notifications/page.tsx", category: "notifications", gate: null },
  { file: "account/page.tsx", category: "account", gate: null },
];

for (const s of SCREENS) {
  test(`settings/${s.file}: public → login; ${s.gate ? "unauthorized roles get the access gate before any data loads" : "open to every signed-in role"}; Back to Settings`, () => {
    const src = read(`${DIR}/${s.file}`);
    assert.match(src, /if \(actor\.kind === "public"\) redirect\("\/coach-login"\);/);
    assert.ok(src.includes("<SettingsScreen"), "uses the shared screen frame (Back to Settings)");
    if (s.gate) {
      const gateAt = src.indexOf(`canOpenSettingsCategory(actor, "${s.category}")`);
      assert.ok(gateAt > 0, "re-checks the shared role rule");
      assert.ok(src.includes(s.gate));
      for (const load of ["getCampaignSettings(", "getActiveJoinCode(", "<TeamAccessSection", "<TeamBrandingSection", "<CoachFundraisingSection", "<PublicAthletePhotosSection"]) {
        const at = src.indexOf(load);
        if (at >= 0) assert.ok(at > gateAt, `${load} only after the gate`);
      }
    }
  });
}

for (const c of ["branding", "coach-fundraising", "athlete-photos", "staff"] as Category[]) {
  test(`${c}: Head Coach only (assistant coach, every member role and platform admin refused)`, () => {
    assert.equal(canOpenSettingsCategory(coach("head_coach"), c), true);
    for (const a of [coach("assistant_coach"), member("athlete"), member("parent"), member("booster"), admin]) {
      assert.equal(canOpenSettingsCategory(a, c), false);
    }
  });
}

test("access gate renders the screen frame and no settings controls", () => {
  const markup = html(createElement(SettingsAccessGate, { slug: SLUG, title: "Team Branding", who: "Head Coach" }));
  assert.ok(markup.includes("Head Coach Access Only") && markup.includes("Back to Settings"));
  assert.ok(markup.includes(`href="/team/${SLUG}/settings"`));
  assert.ok(!/<input|<button/.test(markup));
});

test("screen frame: plain-link Back to Settings, title, description", () => {
  const markup = html(createElement(SettingsScreen, { slug: SLUG, title: "Team Access", description: "Join link.", children: "x" }));
  assert.match(markup, new RegExp(`<a href="/team/${SLUG}/settings"[^>]*data-testid="back-to-settings"`));
  assert.ok(markup.includes(">Team Access<") && markup.includes("Join link."));
});

// ── 3. Notifications: every role, own account only ──────────────────────────

test("notification preferences API is account-scoped: account from the session cookie, only four boolean fields, no id from the client", () => {
  const route = read("src/app/api/push/preferences/route.ts");
  assert.equal((route.match(/const account = await getAccountSession\(\);/g) ?? []).length, 2, "GET and PATCH");
  assert.ok(route.includes("getPushPreferences(account.id)") && route.includes("updatePushPreferences(account.id, patch)"));
  assert.ok(/for \(const key of \["team_updates", "messages", "calendar", "requests"\] as const\)/.test(route));
  assert.ok(!/account_id|accountId|body\.id|campaign_slug|team_id/.test(route), "never trusts a client-supplied account or team");
  const lib = read("src/lib/pushDevices.ts");
  assert.ok(lib.includes("push_preferences?account_id=eq.${encodeURIComponent(accountId)}"), "row selected by that account only");
});

test("Notifications screen: preferences with an account session, activation path without one; no role gate", () => {
  const src = read(`${DIR}/notifications/page.tsx`);
  assert.match(src, /\{account \? \(\n\s+<NotificationPreferencesSection showHeading=\{false\} \/>/);
  assert.ok(src.includes("/activate-account"));
  assert.ok(!src.includes("canOpenSettingsCategory"));
});

// ── 4/5. Completed season + join-code / QR controls ──────────────────────────

function accessMarkup(role: "head_coach" | "assistant_coach") {
  return html(createElement(TeamAccessSection, {
    slug: SLUG,
    coach: { id: "c1", name: "Hana Head", role, campaign_slug: SLUG } as never,
    initialCode: { id: "jc1", code: "ABC123", created_at: "2026-10-01T00:00:00Z" } as never,
    joinCodeSettings: { school_name: "QA Lions", sport_name: "Track", mascot: "Lions", season: "2027", primary_color: "#f60" },
  }));
}

test("Team Access: Head Coach gets Copy, New Code, Revoke and QR/signup sheet", () => {
  const m = accessMarkup("head_coach");
  for (const s of ["ABC123", "Copy Join Link", "New Code", "Revoke", "Team QR &amp; Signup Sheet"]) assert.ok(m.includes(s), s);
});

test("Team Access: Assistant Coach gets Copy and QR/signup sheet only (no New Code / Revoke)", () => {
  const m = accessMarkup("assistant_coach");
  assert.ok(m.includes("Copy Join Link") && m.includes("Team QR &amp; Signup Sheet"));
  assert.ok(!m.includes("New Code") && !m.includes(">Revoke<"));
});

test("Team Access keeps the existing join-code endpoints, revoke confirmation and print sheet", () => {
  const src = read(`${DIR}/TeamAccessSection.tsx`);
  assert.ok(src.includes("fetch(`/api/team/${slug}/join-codes`, { method: \"POST\" })"));
  assert.ok(src.includes("fetch(`/api/team/${slug}/join-codes/${code.id}`, { method: \"PATCH\" })"));
  assert.ok(src.includes('confirm("Revoke this join code? Anyone with the old link will no longer be able to join.")'));
  assert.ok(src.includes("<PrintSignupSheet") && src.includes(".elf-settings-print"));
});

// ── 6/7/8. Branding, coach fundraising, public photos ────────────────────────

test("branding and coach fundraising sections are reused unchanged on their screens (same props, same wrapper)", () => {
  assert.match(read(`${DIR}/branding/page.tsx`), /<ReadOnlyFieldset><TeamBrandingSection slug=\{slug\} branding=\{branding\} \/><\/ReadOnlyFieldset>/);
  assert.match(read(`${DIR}/coach-fundraising/page.tsx`), /<ReadOnlyFieldset><CoachFundraisingSection slug=\{slug\} initialAllowCoachFundraising=\{allowCoachFundraising\} \/><\/ReadOnlyFieldset>/);
});

test("public photos search: case-insensitive name filter; empty query keeps roster order; never changes rows", () => {
  const roster = [{ name: "Sam Senior", excluded: false }, { name: "Jo Junior", excluded: true }, { name: "Sol Sophomore", excluded: false }];
  assert.deepEqual(filterAthletesByName(roster, "").map(a => a.name), ["Sam Senior", "Jo Junior", "Sol Sophomore"]);
  assert.deepEqual(filterAthletesByName(roster, "  so ").map(a => a.name), ["Sol Sophomore"]);
  assert.deepEqual(filterAthletesByName(roster, "JUN").map(a => a.name), ["Jo Junior"]);
  assert.deepEqual(filterAthletesByName(roster, "zz"), []);
  assert.equal(filterAthletesByName(roster, "jo")[0], roster[1], "same objects — exclusion state untouched");
});

test("public photos screen: search is labelled, announces counts, and the list renders the filtered rows with the same checkbox", () => {
  const src = read(`${DIR}/PublicAthletePhotosSection.tsx`);
  assert.ok(src.includes('<label htmlFor="public-photos-search"') && src.includes('id="public-photos-search"'));
  assert.ok(src.includes('aria-live="polite"'));
  assert.ok(src.includes("{visible.map(a => ("));
  assert.match(src, /checked=\{!a\.excluded\}/);
  assert.ok(src.includes("No athletes match"));
  // Confirmation + wording version + fail-closed availability unchanged.
  assert.match(src, /enabled \? \{ enabled, confirm: true, confirmation_version: state\.confirmation_version \} : \{ enabled \}/);
  assert.ok(src.includes("disabled={!state || !state.available || working || confirming}"));
});

// ── 9/10/11. Staff navigation, Account & Privacy, Sign Out ───────────────────

test("Team Staff: existing page and permission check unchanged, with a Back to Settings link", () => {
  const src = read("src/app/team/[slug]/staff/page.tsx");
  assert.ok(src.includes("if (!canManageStaff(actor)) return <HeadCoachOnlyGate slug={slug} />;"));
  assert.ok(src.includes("<BackToSettings slug={slug} />"));
});

test("Account & Privacy: profile link only with an account session; existing modals reused", () => {
  const src = read(`${DIR}/account/page.tsx`);
  assert.match(src, /\{account && \(\n\s+<a\n\s+href=\{`\/team\/\$\{slug\}\/profile`\}/);
  const section = read(`${DIR}/AccountPrivacySection.tsx`);
  assert.ok(section.includes("<BlockedUsersModal") && section.includes("<DeleteAccountModal"));
});

test("Sign Out renders for the Settings home and uses the native-aware logout", () => {
  const markup = html(createElement(SignOutButton));
  assert.ok(markup.includes("Sign Out") && markup.includes('type="button"'));
  assert.ok(read(`${DIR}/SignOutButton.tsx`).includes("const handleSignOut = () => performNativeAwareLogout(router);"));
});

// ── 12. Mobile / desktop navigation ──────────────────────────────────────────

test("navigation: tap targets ≥ 40px, plain-link rows/Back (always land at the top), 700px reading width, no bare <section>", () => {
  const home = read(`${DIR}/SettingsHome.tsx`);
  assert.ok(home.includes("minHeight: 56") && read(`${DIR}/SignOutButton.tsx`).includes("minHeight: 44"));
  assert.ok(read(`${DIR}/SettingsScreen.tsx`).includes("minHeight: 40"));
  for (const f of ["SettingsHome.tsx", "SettingsScreen.tsx", "SignOutButton.tsx", ...SCREENS.map(s => s.file)]) {
    const src = read(`${DIR}/${f}`);
    assert.ok(!src.includes('from "next/link"'), `${f}: plain anchors`);
    assert.ok(!/<section[\s>]/.test(src), `${f}: no bare <section> (globals.css pads it)`);
  }
  assert.ok(read(`${DIR}/SettingsScreen.tsx`).includes("maxWidth: 700"));
});
