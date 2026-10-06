// Phase F1b — /api/team/[slug]/fundraising-inquiries route tests. Same
// technique as contacts/route.test.ts: real getTeamActor() -> legacy
// team_coach/team_member cookie path (real makeCoachCookie/makeMemberCookie,
// real verify functions) against a fetch-mocked in-memory Supabase layer.
import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.TEAM_MEMBER_PEPPER        = "fake-member-pepper";
process.env.TEAM_COACH_PEPPER         = "fake-coach-pepper";
process.env.RESEND_API_KEY            = "fake-resend-key";
process.env.FROM_EMAIL                = "ELF Fundraising <noreply@elitelevelfundraising.com>";

register(new URL("../../../../../lib/testSupport/nextStubLoader.mjs", import.meta.url).href, import.meta.url);

const { NextRequest }      = await import("../../../../../lib/testSupport/nextServerStub.mjs");
const { __setTestCookie }  = await import("../../../../../lib/testSupport/nextHeadersStub.mjs");
const { makeMemberCookie } = await import("@/lib/memberAuth");
const { makeCoachCookie }  = await import("@/lib/teamAuth");

type Row = Record<string, unknown>;

const SLUG = "wolves";

function makeFakeDb(opts: { resendOk?: boolean } = {}) {
  const db: Record<string, Row[]> = {
    campaign_settings:     [],
    team_coaches:          [],
    team_members:          [],
    fundraising_inquiries: [],
  };
  let nextId = 1;
  const emailCalls: { to: unknown; subject: unknown }[] = [];

  function matches(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr.startsWith("in.(") && expr.endsWith(")")) {
      const vals = expr.slice(4, -1).split(",").map(decodeURIComponent);
      return vals.includes(String(row[field]));
    }
    return true;
  }

  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "limit" || key === "order") continue;
      rows = rows.filter(r => matches(r, key, val));
    }
    const limit = params.get("limit");
    if (limit) rows = rows.slice(0, parseInt(limit, 10));
    return rows.map(r => ({ ...r }));
  }

  async function fetchImpl(url: string, init?: RequestInit): Promise<Response> {
    if (url.startsWith("https://api.resend.com")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      emailCalls.push({ to: body.to, subject: body.subject });
      if (opts.resendOk === false) {
        return new Response(JSON.stringify({ message: "simulated Resend failure" }), { status: 500 });
      }
      return new Response(JSON.stringify({ id: "email-fake-1" }), { status: 200 });
    }

    const path = url.replace(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, "");
    const [table, query] = path.split("?");
    const params = new URLSearchParams(query ?? "");
    const method = init?.method ?? "GET";
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });

    if (method === "GET") {
      return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(init!.body as string);
      if (table === "fundraising_inquiries") {
        // Mirrors fundraising_inquiries_active_uniq — one ACTIVE ('new' or
        // 'contacted') inquiry per campaign_slug at a time; 'resolved' is
        // never active and never blocks a later insert.
        const dup = tableRows.find(r =>
          r.campaign_slug === body.campaign_slug && (r.status === "new" || r.status === "contacted"),
        );
        if (dup) {
          return new Response(JSON.stringify({ code: "23505", message: "duplicate" }), { status: 409 });
        }
      }
      const row: Row = { id: `inq-${nextId++}`, status: "new", created_at: new Date().toISOString(), decided_by_account_id: null, decided_at: null, ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }

  return { db, emailCalls, fetchImpl };
}

async function withFakeDb<T>(run: (ctx: ReturnType<typeof makeFakeDb>) => Promise<T>, opts?: { resendOk?: boolean }): Promise<T> {
  const ctx = makeFakeDb(opts);
  const realFetch = globalThis.fetch;
  globalThis.fetch = ctx.fetchImpl as typeof fetch;
  try {
    return await run(ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
}

function clearCookies() {
  __setTestCookie("elf_session", undefined);
  __setTestCookie("team_member", undefined);
  __setTestCookie("team_coach", undefined);
}

function signInAsCoach(coach: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_coach", makeCoachCookie(coach.id, coach.salt));
}

function signInAsMember(member: { id: string; salt: string }) {
  clearCookies();
  __setTestCookie("team_member", makeMemberCookie(member.id, member.salt));
}

function seedCampaign(db: Record<string, Row[]>, fundraisingEnabled: boolean) {
  db.campaign_settings.push({
    campaign_slug: SLUG, school_name: "Wolves HS", sport_name: "Track",
    fundraising_enabled: fundraisingEnabled,
  });
}

async function loadRoute() {
  return import("./route.ts");
}

function postRequest(): Request {
  return new NextRequest(`http://test.local/api/team/${SLUG}/fundraising-inquiries`, { method: "POST" });
}

function getRequest(): Request {
  return new NextRequest(`http://test.local/api/team/${SLUG}/fundraising-inquiries`, { method: "GET" });
}

// ── Authorization: only Head Coach / Assistant Coach may submit ────────────

test("POST: Head Coach can submit an inquiry when fundraising is disabled", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-1", salt: "s1" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.created, true);
    assert.equal(data.inquiry.status, "new");
    assert.equal(data.inquiry.campaign_slug, SLUG);
    assert.equal(data.inquiry.requested_by_account_id, coach.id);
    assert.equal(data.inquiry.requested_by_role, "head_coach");
  });
});

test("POST: Assistant Coach can submit an inquiry when fundraising is disabled", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-2", salt: "s2" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "assistant_coach", salt: coach.salt, name: "Coach Jane" });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 200);
  });
});

test("POST: a Booster is rejected with 403, no row created", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-3", salt: "s3" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "booster", salt: coach.salt, name: "Booster Bob" });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 403);
    assert.equal(db.fundraising_inquiries.length, 0);
  });
});

test("POST: a Parent (team_members role) is rejected with 403", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const member = { id: "mem-1", salt: "sm1" };
    db.team_members.push({ id: member.id, campaign_slug: SLUG, role: "parent", salt: member.salt, name: "Parent Pat", athlete_id: null });
    signInAsMember(member);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 403);
    assert.equal(db.fundraising_inquiries.length, 0);
  });
});

test("POST: an Athlete (team_members role) is rejected with 403", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const member = { id: "mem-2", salt: "sm2" };
    db.team_members.push({ id: member.id, campaign_slug: SLUG, role: "athlete", salt: member.salt, name: "Athlete Al", athlete_id: "a1" });
    signInAsMember(member);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 403);
    assert.equal(db.fundraising_inquiries.length, 0);
  });
});

test("POST: an anonymous (unauthenticated) request is rejected with 403", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    clearCookies();

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 403);
    assert.equal(db.fundraising_inquiries.length, 0);
  });
});

// ── Enabled-campaign behavior ────────────────────────────────────────────

test("POST: a Head Coach on an already-ENABLED campaign is rejected, no row created", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, true);
    const coach = { id: "coach-4", salt: "s4" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 409);
    assert.equal(db.fundraising_inquiries.length, 0);
  });
});

// ── Duplicate-active-inquiry idempotency ────────────────────────────────────

test("POST: a second submission while one is already active does not duplicate the row", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-5", salt: "s5" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const first  = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const firstData = await first.json();
    const second = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const secondData = await second.json();

    assert.equal(secondData.created, false);
    assert.equal(secondData.inquiry.id, firstData.inquiry.id);
    assert.equal(db.fundraising_inquiries.length, 1);
  });
});

test("POST: a DIFFERENT coach submitting while one is already active does not duplicate the row either", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coachA = { id: "coach-6", salt: "s6" };
    const coachB = { id: "coach-7", salt: "s7" };
    db.team_coaches.push({ id: coachA.id, campaign_slug: SLUG, role: "head_coach", salt: coachA.salt, name: "Coach Mike" });
    db.team_coaches.push({ id: coachB.id, campaign_slug: SLUG, role: "assistant_coach", salt: coachB.salt, name: "Coach Jane" });

    signInAsCoach(coachA);
    const { POST } = await loadRoute();
    await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });

    signInAsCoach(coachB);
    const res2 = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data2 = await res2.json();

    assert.equal(data2.created, false);
    assert.equal(db.fundraising_inquiries.length, 1);
  });
});

// ── GET: already-requested lookup ───────────────────────────────────────────

test("GET: returns the active inquiry for this campaign to a Head Coach", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-8", salt: "s8" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    signInAsCoach(coach);

    const { POST, GET } = await loadRoute();
    await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const res = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.inquiry);
    assert.equal(data.inquiry.campaign_slug, SLUG);
  });
});

test("GET: returns null when there is no active inquiry", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-9", salt: "s9" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    signInAsCoach(coach);

    const { GET } = await loadRoute();
    const res = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.inquiry, null);
  });
});

test("GET: a Booster is rejected with 403", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-10", salt: "s10" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "booster", salt: coach.salt, name: "Booster Bob" });
    signInAsCoach(coach);

    const { GET } = await loadRoute();
    const res = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res.status, 403);
  });
});

// ── Full lifecycle: new -> contacted -> resolved (review item 1) ───────────
// Both "new" and "contacted" are ACTIVE and must block a second submission;
// only "resolved" releases the campaign for a later inquiry.

test("POST: an existing 'new' inquiry blocks a second submission (no duplicate)", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-11", salt: "s11" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    db.fundraising_inquiries.push({
      id: "inq-existing", campaign_slug: SLUG, requested_by_account_id: "someone-else",
      requested_by_role: "head_coach", status: "new", created_at: new Date().toISOString(),
      decided_by_account_id: null, decided_at: null,
    });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.created, false);
    assert.equal(data.inquiry.id, "inq-existing");
    assert.equal(db.fundraising_inquiries.length, 1);
  });
});

test("POST: an existing 'contacted' inquiry ALSO blocks a second submission (no duplicate)", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-12", salt: "s12" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    db.fundraising_inquiries.push({
      id: "inq-contacted", campaign_slug: SLUG, requested_by_account_id: "someone-else",
      requested_by_role: "head_coach", status: "contacted", created_at: new Date().toISOString(),
      decided_by_account_id: "admin-1", decided_at: null,
    });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.created, false);
    assert.equal(data.inquiry.id, "inq-contacted");
    assert.equal(db.fundraising_inquiries.length, 1);
  });
});

test("POST: an existing 'resolved' inquiry does NOT block a new submission", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-13", salt: "s13" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    db.fundraising_inquiries.push({
      id: "inq-resolved", campaign_slug: SLUG, requested_by_account_id: "someone-else",
      requested_by_role: "head_coach", status: "resolved", created_at: new Date().toISOString(),
      decided_by_account_id: "admin-1", decided_at: new Date().toISOString(),
    });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.created, true);
    assert.notEqual(data.inquiry.id, "inq-resolved");
    assert.equal(db.fundraising_inquiries.length, 2);
  });
});

test("GET: a 'contacted' inquiry is reported as the active inquiry too (not just 'new')", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-14", salt: "s14" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    db.fundraising_inquiries.push({
      id: "inq-contacted-2", campaign_slug: SLUG, requested_by_account_id: coach.id,
      requested_by_role: "head_coach", status: "contacted", created_at: new Date().toISOString(),
      decided_by_account_id: "admin-1", decided_at: null,
    });
    signInAsCoach(coach);

    const { GET } = await loadRoute();
    const res = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.ok(data.inquiry);
    assert.equal(data.inquiry.id, "inq-contacted-2");
  });
});

test("GET: a 'resolved' inquiry is NOT reported as active", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-15", salt: "s15" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    db.fundraising_inquiries.push({
      id: "inq-resolved-2", campaign_slug: SLUG, requested_by_account_id: coach.id,
      requested_by_role: "head_coach", status: "resolved", created_at: new Date().toISOString(),
      decided_by_account_id: "admin-1", decided_at: new Date().toISOString(),
    });
    signInAsCoach(coach);

    const { GET } = await loadRoute();
    const res = await GET(getRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(data.inquiry, null);
  });
});

// ── Concurrent/unique-conflict path remains safe with the widened index ────

test("POST: a race against an in-flight 'new' insert (23505 from the unique index) still resolves to the winning row, never a 500", async () => {
  await withFakeDb(async ({ db }) => {
    seedCampaign(db, false);
    const coachA = { id: "coach-16", salt: "s16" };
    const coachB = { id: "coach-17", salt: "s17" };
    db.team_coaches.push({ id: coachA.id, campaign_slug: SLUG, role: "head_coach", salt: coachA.salt, name: "Coach Mike" });
    db.team_coaches.push({ id: coachB.id, campaign_slug: SLUG, role: "assistant_coach", salt: coachB.salt, name: "Coach Jane" });

    signInAsCoach(coachA);
    const { POST } = await loadRoute();
    const res1 = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res1.status, 200);

    signInAsCoach(coachB);
    const res2 = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.created, false);
    assert.equal(db.fundraising_inquiries.length, 1);
  });
});

// ── Phase F1d: admin notification email ─────────────────────────────────────

test("POST: a genuinely new inquiry sends exactly one notification email when the recipient is configured", async () => {
  process.env.ELF_ADMIN_NOTIFICATION_EMAIL = "ops@elitelevelfundraising.com";
  try {
    await withFakeDb(async ({ db, emailCalls }) => {
      seedCampaign(db, false);
      const coach = { id: "coach-20", salt: "s20" };
      db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
      signInAsCoach(coach);

      const { POST } = await loadRoute();
      const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
      assert.equal(res.status, 200);
      assert.equal(emailCalls.length, 1);
      assert.equal(emailCalls[0].to, "ops@elitelevelfundraising.com");
    });
  } finally {
    delete process.env.ELF_ADMIN_NOTIFICATION_EMAIL;
  }
});

test("POST: a duplicate/idempotent submission does NOT send a second email", async () => {
  process.env.ELF_ADMIN_NOTIFICATION_EMAIL = "ops@elitelevelfundraising.com";
  try {
    await withFakeDb(async ({ db, emailCalls }) => {
      seedCampaign(db, false);
      const coach = { id: "coach-21", salt: "s21" };
      db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
      signInAsCoach(coach);

      const { POST } = await loadRoute();
      await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
      await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });

      assert.equal(emailCalls.length, 1);
    });
  } finally {
    delete process.env.ELF_ADMIN_NOTIFICATION_EMAIL;
  }
});

test("POST: a notification email failure does not prevent the inquiry from succeeding", async () => {
  process.env.ELF_ADMIN_NOTIFICATION_EMAIL = "ops@elitelevelfundraising.com";
  try {
    await withFakeDb(async ({ db }) => {
      seedCampaign(db, false);
      const coach = { id: "coach-22", salt: "s22" };
      db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
      signInAsCoach(coach);

      const { POST } = await loadRoute();
      const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.created, true);
      assert.equal(db.fundraising_inquiries.length, 1);
    }, { resendOk: false });
  } finally {
    delete process.env.ELF_ADMIN_NOTIFICATION_EMAIL;
  }
});

test("POST: an unset recipient still succeeds, without attempting to send", async () => {
  // ELF_ADMIN_NOTIFICATION_EMAIL deliberately left unset here.
  await withFakeDb(async ({ db, emailCalls }) => {
    seedCampaign(db, false);
    const coach = { id: "coach-23", salt: "s23" };
    db.team_coaches.push({ id: coach.id, campaign_slug: SLUG, role: "head_coach", salt: coach.salt, name: "Coach Mike" });
    signInAsCoach(coach);

    const { POST } = await loadRoute();
    const res = await POST(postRequest() as never, { params: Promise.resolve({ slug: SLUG }) });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.created, true);
    assert.equal(emailCalls.length, 0);
  });
});
