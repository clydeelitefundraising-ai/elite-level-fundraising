// Same in-memory PostgREST-fake approach as src/lib/platform/coachFundraising.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL  = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

type Row = Record<string, unknown>;

function makeFakeDb() {
  const db: Record<string, Row[]> = {
    content_reports: [],
    announcements: [],
    announcement_comments: [],
    messages: [],
    message_attachments: [],
    message_threads: [],
    team_coaches: [],
    team_members: [],
    platform_admins: [],
  };
  let nextId = 1;
  const genId = () => `id-${nextId++}`;

  function parseFilters(qs: string) {
    const [table, query] = qs.split("?");
    return { table, params: new URLSearchParams(query ?? "") };
  }
  function matchesFilter(row: Row, field: string, expr: string): boolean {
    if (expr.startsWith("eq.")) return String(row[field]) === expr.slice(3);
    if (expr.startsWith("neq.")) return String(row[field]) !== expr.slice(4);
    return true;
  }
  function select(table: Row[], params: URLSearchParams): Row[] {
    let rows = table;
    for (const [key, val] of params.entries()) {
      if (["select", "limit", "order"].includes(key)) continue;
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
    const tableRows = db[table];
    if (!tableRows) return new Response(JSON.stringify([]), { status: 200 });

    if (method === "GET") return new Response(JSON.stringify(select(tableRows, params)), { status: 200 });
    if (method === "POST") {
      const body = JSON.parse(init!.body as string);
      const row: Row = { id: genId(), created_at: new Date().toISOString(), ...body };
      tableRows.push(row);
      return new Response(JSON.stringify([row]), { status: 201 });
    }
    if (method === "PATCH") {
      const patch = JSON.parse(init!.body as string);
      const matched = select(tableRows, params);
      const matchedIds = new Set(matched.map(r => r.id));
      const updated: Row[] = [];
      for (const row of tableRows) {
        if (matchedIds.has(row.id)) { Object.assign(row, patch); updated.push({ ...row }); }
      }
      return new Response(JSON.stringify(updated), { status: 200 });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  }
  return { db, handle };
}

const { db, handle } = makeFakeDb();
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => handle(String(url), init)) as typeof fetch;

const { createReport, resolveReport, getReportsForCampaign, getAllReports } = await import("./reports.ts");

const SLUG = "monroe-valley";
function reset() {
  for (const k of Object.keys(db)) db[k].length = 0;
}

test("member can report an announcement", async () => {
  reset();
  db.announcements.push({ id: "ann-1", campaign_slug: SLUG });
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey Athlete",
    targetType: "announcement", targetId: "ann-1", reason: "spam",
  });
  assert.equal(result.ok, true);
});

// messages/message_attachments have NO campaign_slug column of their
// own (only message_threads does) — every test below seeds a thread row
// and points the message/attachment at it, matching the real schema.
test("coach can report a message (campaign resolved via the message's thread)", async () => {
  reset();
  db.message_threads.push({ id: "t1", campaign_slug: SLUG });
  db.messages.push({ id: "msg-1", thread_id: "t1", deleted_at: null });
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "coach", id: "coach-1" }, reporterName: "Coach Lee",
    targetType: "message", targetId: "msg-1", reason: "harassment",
  });
  assert.equal(result.ok, true);
});

test("member can report an attachment (campaign resolved via the attachment's thread)", async () => {
  reset();
  db.message_threads.push({ id: "t1", campaign_slug: SLUG });
  db.message_attachments.push({ id: "att-1", thread_id: "t1", removed_at: null });
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "attachment", targetId: "att-1", reason: "inappropriate_content",
  });
  assert.equal(result.ok, true);
});

test("reporting a message belonging to a DIFFERENT campaign is rejected (never discloses cross-team existence)", async () => {
  reset();
  db.message_threads.push({ id: "t2", campaign_slug: "other-team" });
  db.messages.push({ id: "msg-2", thread_id: "t2", deleted_at: null });
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "message", targetId: "msg-2", reason: "spam",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "target_not_found");
});

test("reporting an ALREADY moderator-removed message is rejected with a distinct reason", async () => {
  reset();
  db.message_threads.push({ id: "t1", campaign_slug: SLUG });
  db.messages.push({ id: "msg-3", thread_id: "t1", deleted_at: new Date().toISOString() });
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "message", targetId: "msg-3", reason: "spam",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "already_removed");
});

test("reporting an ALREADY moderator-removed attachment is rejected with a distinct reason", async () => {
  reset();
  db.message_threads.push({ id: "t1", campaign_slug: SLUG });
  db.message_attachments.push({ id: "att-2", thread_id: "t1", removed_at: new Date().toISOString() });
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "attachment", targetId: "att-2", reason: "spam",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "already_removed");
});

test("a message/attachment report supports moderator Remove Content afterward (report resolves normally)", async () => {
  reset();
  db.message_threads.push({ id: "t1", campaign_slug: SLUG });
  db.messages.push({ id: "msg-4", thread_id: "t1", deleted_at: null });
  const created = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "message", targetId: "msg-4", reason: "harassment",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.report.target_type, "message");
  assert.equal(created.report.target_id, "msg-4");
  const resolved = await resolveReport(created.report.id, SLUG, { kind: "coach", id: "hc-1" }, "actioned", "Content removed by moderator.");
  assert.equal(resolved.ok, true);
});

test("reporting a nonexistent target is rejected", async () => {
  reset();
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "comment", targetId: "does-not-exist", reason: "spam",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "target_not_found");
});

test("reporting a user requires targetKind and validates against the correct role table", async () => {
  reset();
  db.team_coaches.push({ id: "coach-9", campaign_slug: SLUG });
  const result = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "user", targetId: "coach-9", targetKind: "coach", reason: "impersonation",
  });
  assert.equal(result.ok, true);
});

test("invalid reason is rejected before ever touching the DB", async () => {
  reset();
  db.announcements.push({ id: "ann-1", campaign_slug: SLUG });
  const badInput = {
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "announcement", targetId: "ann-1", reason: "not_a_real_reason",
  } as unknown as Parameters<typeof createReport>[0];
  const result = await createReport(badInput);
  assert.equal(result.ok, false);
  assert.equal(db.content_reports.length, 0);
});

test("a report starts as open and only a head-coach/platform-admin resolve call changes status", async () => {
  reset();
  db.announcements.push({ id: "ann-1", campaign_slug: SLUG });
  const created = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "announcement", targetId: "ann-1", reason: "spam",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.report.status, "open");

  const resolved = await resolveReport(created.report.id, SLUG, { kind: "coach", id: "hc-1" }, "actioned", "Removed the announcement.");
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.report.status, "actioned");
    assert.equal(resolved.report.resolved_by_kind, "coach");
    assert.equal(resolved.report.resolution_note, "Removed the announcement.");
  }
});

test("resolveReport for a report in a different campaign fails (campaign boundary enforced)", async () => {
  reset();
  db.announcements.push({ id: "ann-1", campaign_slug: SLUG });
  const created = await createReport({
    campaignSlug: SLUG, reporter: { kind: "member", id: "mem-1" }, reporterName: "Casey",
    targetType: "announcement", targetId: "ann-1", reason: "spam",
  });
  if (!created.ok) throw new Error("setup failed");
  const resolved = await resolveReport(created.report.id, "other-campaign", { kind: "coach", id: "hc-1" }, "dismissed");
  assert.equal(resolved.ok, false);
});

test("getReportsForCampaign only returns this campaign's reports; getAllReports (platform admin) returns every campaign", async () => {
  reset();
  db.announcements.push({ id: "ann-1", campaign_slug: SLUG }, { id: "ann-2", campaign_slug: "other-campaign" });
  await createReport({ campaignSlug: SLUG, reporter: { kind: "member", id: "m1" }, reporterName: "A", targetType: "announcement", targetId: "ann-1", reason: "spam" });
  await createReport({ campaignSlug: "other-campaign", reporter: { kind: "member", id: "m2" }, reporterName: "B", targetType: "announcement", targetId: "ann-2", reason: "spam" });

  const scoped = await getReportsForCampaign(SLUG);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].campaign_slug, SLUG);

  const all = await getAllReports();
  assert.equal(all.length, 2);
});
