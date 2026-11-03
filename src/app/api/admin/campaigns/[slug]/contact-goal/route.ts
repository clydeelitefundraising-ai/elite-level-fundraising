import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

type RouteCtx = { params: Promise<{ slug: string }> };

// GET — return current team-default contact goal (athlete_id = null row)
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { slug } = await params;

  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=is.null&select=goal&limit=1`,
    { headers: h(), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ goal: 10 });
  const rows: { goal: number }[] = await res.json();
  return NextResponse.json({ goal: rows[0]?.goal ?? 10 });
}

// PATCH — upsert team-default contact goal
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { slug } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;

  const body = await req.json().catch(() => null);
  const goal = typeof body?.goal === "number" ? body.goal : parseInt(body?.goal, 10);
  if (!Number.isInteger(goal) || goal < 1 || goal > 999) {
    return NextResponse.json({ error: "Goal must be a positive integer between 1 and 999." }, { status: 400 });
  }

  const audit = () => logAuditEvent({
    actor:         adminAuditActor(access),
    action:        "contact_goal.updated",
    entity_type:   "fundraising_contact_goals",
    entity_id:     slug,
    campaign_slug: slug,
    summary:       `Team contact goal set to ${goal}`,
    new_value:     { goal },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  // Try PATCH first (update existing row)
  const updateRes = await fetch(
    `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=is.null`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ goal, updated_at: new Date().toISOString() }),
    },
  );

  if (updateRes.ok) {
    const rows = await updateRes.json();
    if (Array.isArray(rows) && rows.length > 0) {
      audit();
      return NextResponse.json({ ok: true, goal: rows[0].goal });
    }
  }

  // No row yet — insert
  const insertRes = await fetch(`${BASE}/rest/v1/fundraising_contact_goals`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({ campaign_slug: slug, athlete_id: null, goal, set_by_coach_id: null }),
  });

  if (!insertRes.ok) {
    const msg = await insertRes.text();
    return NextResponse.json({ error: `Failed to save contact goal: ${msg}` }, { status: 500 });
  }
  const [created] = await insertRes.json();
  audit();
  return NextResponse.json({ ok: true, goal: created.goal }, { status: 201 });
}
