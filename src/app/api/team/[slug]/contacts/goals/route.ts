import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

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

// POST /api/team/[slug]/contacts/goals
// Body: { goal: number, athlete_id?: string }
// Staff only. Upserts a goal — team default when athlete_id is omitted,
// per-athlete override when athlete_id is provided.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (actor.kind !== "coach") {
    return NextResponse.json({ error: "Only coaches can set goals." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const goal = typeof body?.goal === "number" ? body.goal : parseInt(body?.goal, 10);
  if (!Number.isInteger(goal) || goal < 1) {
    return NextResponse.json({ error: "Goal must be a positive integer." }, { status: 400 });
  }

  const athleteId: string | null = body?.athlete_id ?? null;
  const coachId = actor.session.id;
  const now     = new Date().toISOString();

  // Try PATCH first (update existing row)
  const filterAthlete = athleteId
    ? `&athlete_id=eq.${encodeURIComponent(athleteId)}`
    : "&athlete_id=is.null";
  const updateRes = await fetch(
    `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}${filterAthlete}`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify({ goal, set_by_coach_id: coachId, updated_at: now }),
    },
  );

  if (updateRes.ok) {
    const rows = await updateRes.json();
    if (rows.length > 0) {
      return NextResponse.json(rows[0]);
    }
  }

  // No existing row — insert
  const insertRes = await fetch(`${BASE}/rest/v1/fundraising_contact_goals`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      campaign_slug:    slug,
      athlete_id:       athleteId,
      goal,
      set_by_coach_id:  coachId,
      updated_at:       now,
    }),
  });
  if (!insertRes.ok) {
    return NextResponse.json({ error: "Failed to save goal." }, { status: 500 });
  }
  const [created] = await insertRes.json();
  return NextResponse.json(created, { status: 201 });
}
