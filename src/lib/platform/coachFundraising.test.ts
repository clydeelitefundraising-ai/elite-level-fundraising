// Integration-shaped tests for Coach Fundraising Participation, using a
// small in-memory fake of the Supabase PostgREST layer (mocking
// globalThis.fetch) — same approach as parentAccessRequests.test.ts.
// Purpose-built to exactly the query shapes coachFundraising.ts actually
// issues, rather than a fully generic PostgREST emulator.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: { campaign_settings: Row[]; team_coaches: Row[]; campaign_coach_fundraisers: Row[]; donations: Row[] } = {
    campaign_settings: [],
    team_coaches: [],
    campaign_coach_fundraisers: [],
    donations: [],
  };
  let nextId = 1;
  const genId = () => `id-${nextId++}`;

  function parseFilters(qs: string): { table: string; params: URLSearchParams } {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }

  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr === "is.null") return row[field] === null || row[field] === undefined;
    if (expr === "not.is.null") return row[field] !== null && row[field] !== undefined;
    if (expr.startsWith("in.(") && expr.endsWith(")")) {
      const ids = expr.slice(4, -1).split(",");
      return ids.includes(String(row[field]));
    }
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order") continue;
      rows = rows.filter(r => matchesFilter(r, key, val));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function handle(url: string, init?: RequestInit): Promise<Response> {
    const path = url.replace("https://fake.supabase.co/rest/v1/", "");
    const { table, params } = parseFilters(path);
    const method = init?.method ?? "GET";
    const tableRows = db[table as keyof typeof db];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });

    if (method === "GET") {
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(init!.body as string);
      const row: Row = { id: genId(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init!.body as string);
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      const updated: Row[] = [];
      for (const row of tableRows) {
        if (matchedIds.has(row.id)) {
          Object.assign(row, patch);
          updated.push({ ...row });
        }
      }
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }

  return { db, handle };
}

const { db, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { getCoachFundraisers, getActiveCoachFundraisers, validateCoachForCampaign, upsertCoachParticipant, getCoachById, getCoachTotals, canManageContact, ownCoachIdForActor } =
  await import("./coachFundraising.ts");

function resetDb() {
  db.campaign_settings.length = 0;
  db.team_coaches.length = 0;
  db.campaign_coach_fundraisers.length = 0;
  db.donations.length = 0;
}

const SLUG = "monroe-valley";

function seedCampaign(allowCoachFundraising: boolean) {
  db.campaign_settings.push({ campaign_slug: SLUG, allow_coach_fundraising: allowCoachFundraising });
}

function seedCoach(id: string, role: "head_coach" | "assistant_coach" | "booster", name = "Coach " + id) {
  db.team_coaches.push({ id, campaign_slug: SLUG, name, role });
}

test("validateCoachForCampaign: booster cannot become a participant even with an active row", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("booster-1", "booster", "Stephanie Nielsen");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "booster-1", active: true, goal_cents: null });
  assert.equal(await validateCoachForCampaign("booster-1", SLUG), false);
});

test("upsertCoachParticipant: rejects a booster at the data layer too (defense in depth)", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("booster-1", "booster");
  const result = await upsertCoachParticipant(SLUG, "booster-1", { active: true, goal_cents: 50000 });
  assert.equal(result.ok, false);
  assert.equal(db.campaign_coach_fundraisers.length, 0);
});

test("validateCoachForCampaign: assistant coach can participate when selected and active", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("assist-1", "assistant_coach", "Rachel Moreno");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "assist-1", active: true, goal_cents: 75000 });
  assert.equal(await validateCoachForCampaign("assist-1", SLUG), true);
});

test("validateCoachForCampaign: head coach can participate when selected and active", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: 100000 });
  assert.equal(await validateCoachForCampaign("head-1", SLUG), true);
});

test("validateCoachForCampaign: allow_coach_fundraising=false blocks attribution even with an active row", async () => {
  resetDb();
  seedCampaign(false); // feature disabled at the campaign level
  seedCoach("head-1", "head_coach");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: null });
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("validateCoachForCampaign: never inferred solely from row existence — an inactive row blocks new attribution", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: false, goal_cents: null });
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("validateCoachForCampaign: no participation row at all is not a participant", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach");
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("upsertCoachParticipant: deactivating (active=false) does not delete the row or its history", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach");
  const first = await upsertCoachParticipant(SLUG, "head-1", { active: true, goal_cents: 100000 });
  assert.equal(first.ok, true);
  assert.equal(db.campaign_coach_fundraisers.length, 1);

  const second = await upsertCoachParticipant(SLUG, "head-1", { active: false, goal_cents: 100000 });
  assert.equal(second.ok, true);
  // Row still exists, just inactive — never deleted.
  assert.equal(db.campaign_coach_fundraisers.length, 1);
  assert.equal(db.campaign_coach_fundraisers[0].active, false);
  assert.equal(await validateCoachForCampaign("head-1", SLUG), false);
});

test("getCoachFundraisers: lists every participation row regardless of active state (historical visibility)", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: false, goal_cents: 50000 });
  const all = await getCoachFundraisers(SLUG);
  assert.equal(all.length, 1);
  assert.equal(all[0].name, "Mike Owens");
});

test("getActiveCoachFundraisers: only returns active rows for a campaign with the flag on", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  seedCoach("assist-1", "assistant_coach", "Rachel Moreno");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: 100000 });
  db.campaign_coach_fundraisers.push({ id: "row-2", campaign_slug: SLUG, coach_id: "assist-1", active: false, goal_cents: 50000 });
  const active = await getActiveCoachFundraisers(SLUG);
  assert.equal(active.length, 1);
  assert.equal(active[0].coach_id, "head-1");
});

test("getCoachById: resolves an active participant's public-safe name", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: null });
  const coach = await getCoachById("head-1", SLUG);
  assert.equal(coach?.name, "Mike Owens");
});

test("getCoachById: returns null for a non-participant, deselected, or booster coach id — never fishable", async () => {
  resetDb();
  seedCampaign(true);
  seedCoach("head-1", "head_coach", "Mike Owens");   // never selected
  seedCoach("assist-1", "assistant_coach", "Rachel Moreno");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "assist-1", active: false, goal_cents: null }); // deselected
  seedCoach("booster-1", "booster", "Stephanie Nielsen");
  db.campaign_coach_fundraisers.push({ id: "row-2", campaign_slug: SLUG, coach_id: "booster-1", active: true, goal_cents: null });

  assert.equal(await getCoachById("head-1", SLUG), null);
  assert.equal(await getCoachById("assist-1", SLUG), null);
  assert.equal(await getCoachById("booster-1", SLUG), null);
  assert.equal(await getCoachById("nonexistent", SLUG), null);
});

test("getCoachTotals: id-first, grouped by coach_id, in cents", async () => {
  resetDb();
  db.donations.push({ campaign_slug: SLUG, coach_id: "head-1", amount_cents: 5000 });
  db.donations.push({ campaign_slug: SLUG, coach_id: "head-1", amount_cents: 2500 });
  db.donations.push({ campaign_slug: SLUG, coach_id: null, athlete_id: "ath-1", amount_cents: 1000 });
  const totals = await getCoachTotals(SLUG);
  assert.equal(totals["head-1"], 7500);
  assert.equal(Object.keys(totals).length, 1);
});

// ── Cross-campaign scoping (backs the new Head-Coach-facing routes:
// /api/team/[slug]/coach-fundraisers and
// /api/team/[slug]/settings/coach-fundraising — both call these exact lib
// functions with the slug taken from their own URL param, never a
// client-supplied campaign, so a Head Coach of campaign A cannot read or
// act on campaign B's coaches by guessing a coach_id) ─────────────────────
const OTHER_SLUG = "chino-valley";

test("upsertCoachParticipant: a coach_id that belongs to a DIFFERENT campaign is rejected as not_eligible, even with the right role", async () => {
  resetDb();
  seedCampaign(true);
  db.campaign_settings.push({ campaign_slug: OTHER_SLUG, allow_coach_fundraising: true });
  // head-1 exists only under OTHER_SLUG, not SLUG
  db.team_coaches.push({ id: "head-1", campaign_slug: OTHER_SLUG, name: "Mike Owens", role: "head_coach" });

  const result = await upsertCoachParticipant(SLUG, "head-1", { active: true, goal_cents: null });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_eligible");
  // and no row was created under either campaign
  assert.equal(db.campaign_coach_fundraisers.length, 0);
});

test("getCoachFundraisers: only returns rows for the requested campaign_slug, never another campaign's", async () => {
  resetDb();
  seedCampaign(true);
  db.campaign_settings.push({ campaign_slug: OTHER_SLUG, allow_coach_fundraising: true });
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.team_coaches.push({ id: "head-2", campaign_slug: OTHER_SLUG, name: "Other Coach", role: "head_coach" });
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: null });
  db.campaign_coach_fundraisers.push({ id: "row-2", campaign_slug: OTHER_SLUG, coach_id: "head-2", active: true, goal_cents: null });

  const rows = await getCoachFundraisers(SLUG);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].coach_id, "head-1");
});

test("validateCoachForCampaign: a coach active under one campaign is NOT a participant under a different campaign_slug", async () => {
  resetDb();
  seedCampaign(true);
  db.campaign_settings.push({ campaign_slug: OTHER_SLUG, allow_coach_fundraising: true });
  seedCoach("head-1", "head_coach", "Mike Owens");
  db.campaign_coach_fundraisers.push({ id: "row-1", campaign_slug: SLUG, coach_id: "head-1", active: true, goal_cents: null });

  assert.equal(await validateCoachForCampaign("head-1", SLUG), true);
  assert.equal(await validateCoachForCampaign("head-1", OTHER_SLUG), false);
});

// ── canManageContact / ownCoachIdForActor — coach fundraising contacts UI ──
//
// Fully-typed TeamActor literals (matching CoachSession/MemberSession/
// PlatformAdminActorSession exactly, including fields these functions
// don't read, e.g. member.account_id) so these tests type-check with no
// `any`/suppression — a real compile-time guarantee the fixtures are
// shaped like production actors, not just "close enough" mocks.

const headCoachActor    = { kind: "coach" as const, session: { id: "head-1",  name: "Mike Owens",      role: "head_coach" as const,      campaign_slug: SLUG } };
const asstCoachActor    = { kind: "coach" as const, session: { id: "asst-1",  name: "Rachel Moreno",   role: "assistant_coach" as const, campaign_slug: SLUG } };
const otherAsstActor    = { kind: "coach" as const, session: { id: "asst-2",  name: "Other Asst",      role: "assistant_coach" as const, campaign_slug: SLUG } };
const boosterCoachActor = { kind: "coach" as const, session: { id: "boost-1", name: "Booster",         role: "booster" as const,         campaign_slug: SLUG } };

const boosterMemberActor = { kind: "member" as const, session: { id: "m-boost", name: "Booster Member", role: "booster" as const,  campaign_slug: SLUG, athlete_id: null,   account_id: null } };
const athleteMemberActor = { kind: "member" as const, session: { id: "m-ath-1", name: "Athlete One",    role: "athlete" as const,  campaign_slug: SLUG, athlete_id: "ath-1", account_id: null } };
const otherAthleteMemberActor = { kind: "member" as const, session: { id: "m-ath-2", name: "Athlete Two", role: "athlete" as const, campaign_slug: SLUG, athlete_id: "ath-2", account_id: null } };
const parentMemberActor  = { kind: "member" as const, session: { id: "m-par-1", name: "Parent One",     role: "parent" as const,   campaign_slug: SLUG, athlete_id: "ath-1", account_id: null } };

const platformAdminActor = { kind: "platform_admin" as const, session: { platformAdminId: "pa-1", accountId: "acc-1", name: "Admin", email: "a@b.com", campaign_slug: SLUG } };
const publicActor = { kind: "public" as const };

const coachOwnedContact   = { athlete_id: null, coach_id: "asst-1" };
const athleteOwnedContact = { athlete_id: "ath-1", coach_id: null };

test("canManageContact: a coach can manage their OWN coach-owned contact", () => {
  assert.equal(canManageContact(asstCoachActor, coachOwnedContact), true);
});

test("canManageContact: a DIFFERENT coach cannot manage another coach's contact (own-only, not roster-wide)", () => {
  assert.equal(canManageContact(otherAsstActor, coachOwnedContact), false);
});

test("canManageContact: Head Coach / Platform Admin can manage ANY coach's contact (campaign-wide authority preserved)", () => {
  assert.equal(canManageContact(headCoachActor, coachOwnedContact), true);
  assert.equal(canManageContact(platformAdminActor, coachOwnedContact), true);
});

test("canManageContact: a booster (either team_coaches role or member role) cannot manage a coach-owned contact", () => {
  assert.equal(canManageContact(boosterCoachActor, coachOwnedContact), false);
  assert.equal(canManageContact(boosterMemberActor, coachOwnedContact), false);
});

test("canManageContact: public (unauthenticated) can never manage any contact", () => {
  assert.equal(canManageContact(publicActor, coachOwnedContact), false);
  assert.equal(canManageContact(publicActor, athleteOwnedContact), false);
});

test("canManageContact REGRESSION: athlete-owned contact behavior is unchanged — any staff actor may manage it", () => {
  assert.equal(canManageContact(headCoachActor, athleteOwnedContact), true);
  assert.equal(canManageContact(asstCoachActor, athleteOwnedContact), true);
  // boosters ARE staff for athlete-owned contacts (isStaff() includes them) — unchanged pre-existing behavior
  assert.equal(canManageContact(boosterCoachActor, athleteOwnedContact), true);
  assert.equal(canManageContact(boosterMemberActor, athleteOwnedContact), true);
  assert.equal(canManageContact(platformAdminActor, athleteOwnedContact), true);
});

test("canManageContact REGRESSION: athlete-owned contact — matching member (athlete/parent) can manage, non-matching cannot", () => {
  assert.equal(canManageContact(athleteMemberActor, athleteOwnedContact), true);
  assert.equal(canManageContact(parentMemberActor, athleteOwnedContact), true);
  assert.equal(canManageContact(otherAthleteMemberActor, athleteOwnedContact), false);
});

test("ownCoachIdForActor: resolves an eligible coach's own id, never a client-supplied one", () => {
  assert.equal(ownCoachIdForActor(headCoachActor), "head-1");
  assert.equal(ownCoachIdForActor(asstCoachActor), "asst-1");
});

test("ownCoachIdForActor: null for a booster (either shape), member, platform admin, or public actor", () => {
  assert.equal(ownCoachIdForActor(boosterCoachActor), null);
  assert.equal(ownCoachIdForActor(boosterMemberActor), null);
  assert.equal(ownCoachIdForActor(athleteMemberActor), null);
  assert.equal(ownCoachIdForActor(platformAdminActor), null);
  assert.equal(ownCoachIdForActor(publicActor), null);
});
