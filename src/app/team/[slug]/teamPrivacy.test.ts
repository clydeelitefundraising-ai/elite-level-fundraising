// Cross-team privacy of campaign_settings. The team layout renders for
// every visitor of a /team/<slug>/… URL before any page decides to
// redirect a non-member, and the Shop page is public, so the data they hand
// to components is what reaches the browser (the RSC payload). These tests
// run the REAL layout and pages against a fake PostgREST world (no real
// database) as each kind of viewer and walk everything they pass on,
// checking that private settings of a team never appear unless the viewer
// is authorized for that team.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import type { ReactElement } from "react";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.ELF_ACCOUNT_PEPPER        = "fake-account-pepper";

register(new URL("./attendance/testSupport/uiLoader.mjs", import.meta.url).href, import.meta.url);

const { default: TeamLayout } = await import("./layout.tsx");
const { default: TeamPage } = await import("./team/page.tsx");
const { default: OverviewView } = await import("./team/OverviewView.tsx");
const { default: ShopPage } = await import("./shop/page.tsx");
const { default: ShopView } = await import("./shop/ShopView.tsx");
const { RedirectSignal } = await import("./attendance/testSupport/nextNavigationStub.mjs");
const { TEAM_SHELL_FIELDS, SHOP_SETTINGS_FIELDS } = await import("@/lib/teamShellSettings");
const W = await import("../../api/team/[slug]/attendance/testSupport/attendanceWorld.mjs");

type World = { db: Record<string, unknown[]>; requests: string[] };

// Every non-public column, with a value that can't occur by accident.
function privateColumns(tag: string) {
  return {
    team_about:                `${tag}-PRIVATE-ABOUT`,
    location_street:           `${tag}-PRIVATE-STREET`,
    location_zip:              `${tag}-ZIP`,
    team_banner_url:           `https://fake.supabase.co/storage/v1/object/public/team-branding-logos/${tag}/banner/1.webp`,
    team_id:                   `${tag}-TEAM-ID`,
    organization_id:           null,
    crm_contact_id:            `${tag}-CRM-ID`,
    program_id:                `${tag}-PROGRAM-ID`,
    status:                    `${tag}-STATUS`,
    demo_template:             `${tag}-DEMO-TEMPLATE`,
    contact_requirement:       `${tag}-CONTACT-REQ`,
    default_athlete_goal_cents: 98765,
  };
}
// (successor/predecessor_campaign_slug are not in the list: the account
// team switcher reads them for the viewer's OWN teams, by design.)

function settingsRow(slug: string, school: string, tag: string) {
  return {
    campaign_slug: slug, school_name: school, sport_name: "Track", mascot: "Mascot", season: "2027 Season",
    location: "Phoenix, AZ", logo_url: "", primary_color: "#112233", secondary_color: "#445566",
    goal_cents: 100000, deadline: "2027-03-01", archived: false, fundraising_enabled: true,
    branding_customized: false, season_completed_at: null, external_store_url: null, store_provider: null,
    ...privateColumns(tag),
  };
}

// One account that is a parent on Wolves and Head Coach on Hawks.
function seed(w: World) {
  w.db.campaign_settings = [settingsRow(W.SLUG, "Wolves High", "WOLVES"), settingsRow(W.OTHER, "Hawks High", "HAWKS")];
  (w.db.elf_accounts as unknown[]).push({ id: "acct-multi", name: "Max Multi", email: "max@elf.test", salt: "sm", profile_photo_url: null });
  (w.db.team_members as unknown[]).push({ id: "m-multi", name: "Max Multi", role: "parent", campaign_slug: W.SLUG, athlete_id: W.A(1), account_id: "acct-multi", salt: "t9" });
  (w.db.team_coaches as unknown[]).push({ id: "coach-multi", name: "Max Multi", role: "head_coach", campaign_slug: W.OTHER, salt: "s9", account_id: "acct-multi" });

  // The shared fake ignores `select=`; real PostgREST returns only the
  // listed columns, so project campaign_settings reads the same way here
  // (otherwise a narrow select elsewhere would look like a leak).
  const fakeFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const res = await fakeFetch(url, init);
    const u = new URL(url);
    const select = u.searchParams.get("select");
    if (!u.pathname.endsWith("/campaign_settings") || !select || select === "*" || (init?.method ?? "GET") !== "GET") return res;
    const cols = select.split(",");
    const rows = (await res.json()) as Record<string, unknown>[];
    return new Response(JSON.stringify(rows.map(r => Object.fromEntries(cols.filter(c => c in r).map(c => [c, r[c]])))), { status: res.status, headers: res.headers });
  }) as typeof fetch;
}
const asMulti = () => W.as.account("acct-multi", "sm");

// Every string reachable from what a component tree passes on (element
// props, nested elements, arrays, plain objects), plus every object key.
function payloadText(node: unknown, seen = new Set<unknown>()): string {
  if (node === null || node === undefined || typeof node === "function" || typeof node === "symbol") return "";
  if (typeof node !== "object") return String(node);
  if (seen.has(node)) return "";
  seen.add(node);
  const el = node as { $$typeof?: symbol; props?: unknown };
  if (el.$$typeof) return payloadText(el.props, seen);
  if (Array.isArray(node)) return node.map(n => payloadText(n, seen)).join(" ");
  if (node instanceof Promise) return "";
  return Object.entries(node).map(([k, v]) => `${k} ${payloadText(v, seen)}`).join(" ");
}

// Column names checked where no private column may appear at all (the shell
// and the Shop); "status" is skipped as a key because it is also an ordinary
// prop name — its value is still checked.
const PRIVATE_KEYS = Object.keys(privateColumns("X")).filter(k => k !== "status");
function assertNoPrivate(text: string, tag: string, who: string, opts: { keys?: boolean } = {}) {
  for (const v of Object.values(privateColumns(tag))) {
    if (typeof v === "string") assert.ok(!text.includes(v), `${who}: ${tag} private value ${v} leaked`);
  }
  assert.ok(!text.includes("98765"), `${who}: ${tag} default_athlete_goal_cents leaked`);
  if (opts.keys) for (const k of PRIVATE_KEYS) assert.ok(!new RegExp(`\\b${k}\\b`).test(text), `${who}: column ${k} present`);
}

async function renderLayout(slug: string) {
  return await TeamLayout({ children: "PAGE", params: Promise.resolve({ slug }) }) as ReactElement;
}

/** Resolves to the page's element, or to the redirect target it threw. */
async function renderOverviewPage(slug: string): Promise<ReactElement | { redirect: string }> {
  try {
    return await TeamPage({ params: Promise.resolve({ slug }) }) as ReactElement;
  } catch (e) {
    if (e instanceof RedirectSignal) return { redirect: (e as { url: string }).url };
    throw e;
  }
}

const VIEWERS: Record<string, () => void> = {
  "Head Coach":      W.ROLES.head,
  "Assistant Coach": W.ROLES.assistant,
  "platform admin":  W.ROLES.admin,
  "parent":          W.ROLES.parent,
  "athlete":         W.ROLES.athlete,
  "booster":         W.ROLES.boosterMember,
  "other team's Head Coach": W.ROLES.otherTeamHead,
  "signed out":      W.ROLES.nobody,
  "forged cookie":   W.ROLES.forged,
  "multi-team account": asMulti,
};

test("team layout: no viewer — member, outsider or signed out — gets private settings in the shell", async () => {
  await W.withWorld(async (w: World) => {
    seed(w);
    for (const [who, signIn] of Object.entries(VIEWERS)) {
      signIn();
      for (const [slug, school] of [[W.SLUG, "Wolves High"], [W.OTHER, "Hawks High"]]) {
        const text = payloadText(await renderLayout(slug));
        assertNoPrivate(text, "WOLVES", `${who} on ${slug}`, { keys: true });
        assertNoPrivate(text, "HAWKS", `${who} on ${slug}`, { keys: true });
        assert.ok(text.includes(school), `${who} on ${slug}: shell still shows the team's public identity`);
        assert.ok(text.includes("PAGE"), `${who} on ${slug}: page content still rendered`);
      }
    }
  });
});

test("team layout: the shell gets exactly the public display fields", async () => {
  await W.withWorld(async (w: World) => {
    seed(w);
    W.ROLES.head();
    const tree = await renderLayout(W.SLUG);
    const found: Record<string, unknown>[] = [];
    (function walk(n: unknown) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      const el = n as { $$typeof?: symbol; props?: Record<string, unknown> };
      if (!el.$$typeof || !el.props) return;
      if (el.props.settings) found.push(el.props.settings as Record<string, unknown>);
      Object.values(el.props).forEach(walk);
    })(tree);
    assert.equal(found.length, 2, "TeamChrome and TeamHeader");
    for (const s of found) {
      for (const k of Object.keys(s)) assert.ok((TEAM_SHELL_FIELDS as readonly string[]).includes(k), `unexpected shell field ${k}`);
      assert.equal(s.school_name, "Wolves High");
    }
  });
});

test("Overview page: outsiders and signed-out visitors are redirected on the server before any team data is read", async () => {
  await W.withWorld(async (w: World) => {
    seed(w);
    for (const [who, signIn, to] of [
      ["other team's Head Coach", W.ROLES.otherTeamHead, "/login"],
      ["signed out", W.ROLES.nobody, "/login"],
      ["forged cookie", W.ROLES.forged, "/login"],
    ] as const) {
      signIn();
      const before = w.requests.length;
      const out = await renderOverviewPage(W.SLUG);
      assert.deepEqual(out, { redirect: to }, who);
      assert.ok(!w.requests.slice(before).some(r => r.includes("campaign_settings")), `${who}: settings never fetched`);
    }
    // A signed-in account with no role on the team goes to its team list.
    asMulti();
    w.db.team_members = (w.db.team_members as { id: string }[]).filter(m => m.id !== "m-multi");
    assert.deepEqual(await renderOverviewPage(W.SLUG), { redirect: "/teams" });
  });
});

function overviewOf(page: ReactElement | { redirect: string }) {
  assert.ok(!("redirect" in page), "expected the page, got a redirect");
  const overview = (page as ReactElement<{ overview: ReactElement }>).props.overview;
  assert.equal(overview.type, OverviewView);
  return overview.props as { canEdit: boolean; team: Record<string, unknown> };
}

test("Overview page: members read their own team's overview; only Head Coach and platform admin can edit", async () => {
  await W.withWorld(async (w: World) => {
    seed(w);
    for (const [who, signIn, canEdit] of [
      ["Head Coach", W.ROLES.head, true],
      ["platform admin", W.ROLES.admin, true],
      ["Assistant Coach", W.ROLES.assistant, false],
      ["parent", W.ROLES.parent, false],
      ["athlete", W.ROLES.athlete, false],
      ["booster", W.ROLES.boosterMember, false],
    ] as const) {
      signIn();
      const page = await renderOverviewPage(W.SLUG);
      const o = overviewOf(page);
      assert.equal(o.canEdit, canEdit, who);
      assert.equal(o.team.team_about, "WOLVES-PRIVATE-ABOUT", who);
      assert.equal(o.team.location_street, "WOLVES-PRIVATE-STREET", who);
      assertNoPrivate(payloadText(page), "HAWKS", who);
    }
  });
});

test("Overview page: a completed season is read-only even for the Head Coach", async () => {
  await W.withWorld(async (w: World) => {
    seed(w);
    (w.db.campaign_settings[0] as Record<string, unknown>).season_completed_at = "2026-06-01T00:00:00Z";
    for (const signIn of [W.ROLES.head, W.ROLES.admin]) {
      signIn();
      assert.equal(overviewOf(await renderOverviewPage(W.SLUG)).canEdit, false);
    }
  });
});

test("team switching: one account sees each team's own overview with that team's permissions, never the other's", async () => {
  await W.withWorld(async (w: World) => {
    seed(w);
    asMulti();
    const wolves = await renderOverviewPage(W.SLUG);
    const wo = overviewOf(wolves);
    assert.equal(wo.canEdit, false, "parent on Wolves");
    assert.equal(wo.team.school_name, "Wolves High");
    assertNoPrivate(payloadText(wolves), "HAWKS", "multi on Wolves");

    const hawks = await renderOverviewPage(W.OTHER);
    const ho = overviewOf(hawks);
    assert.equal(ho.canEdit, true, "Head Coach on Hawks");
    assert.equal(ho.team.school_name, "Hawks High");
    assert.equal(ho.team.team_about, "HAWKS-PRIVATE-ABOUT");
    assertNoPrivate(payloadText(hawks), "WOLVES", "multi on Hawks");
  });
});

test("Shop page (public): only the store fields are handed to the client, for every viewer", async () => {
  await W.withWorld(async (w: World) => {
    seed(w);
    for (const [who, signIn] of Object.entries(VIEWERS)) {
      signIn();
      const el = await ShopPage({ params: Promise.resolve({ slug: W.SLUG }) }) as ReactElement<{ settings: Record<string, unknown> }>;
      assert.equal(el.type, ShopView, who);
      for (const k of Object.keys(el.props.settings)) {
        assert.ok((SHOP_SETTINGS_FIELDS as readonly string[]).includes(k), `${who}: unexpected shop field ${k}`);
      }
      assertNoPrivate(payloadText(el), "WOLVES", who, { keys: true });
    }
  });
});
