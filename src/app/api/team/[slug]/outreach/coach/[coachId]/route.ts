import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

const VALID_STATUSES = ["contacted", "needs_follow_up", "resolved"] as const;
type ValidStatus = typeof VALID_STATUSES[number];

type RouteContext = { params: Promise<{ slug: string; coachId: string }> };

// Coach-subject counterpart to outreach/[athleteId]/route.ts — same
// append-only athlete_outreach table, same VALID_STATUSES, same
// staff-only gating, but writes/reads subject_coach_id (the fundraising
// SUBJECT) instead of athlete_id. Deliberately a separate route file
// (URL path shape differs) rather than a rename of the athlete route —
// the underlying table/logic is reused, not duplicated. The existing
// coach_id column on this table is untouched here — it always means
// "which coach performed this outreach action" (the actor, set below
// from the authenticated actor exactly as the athlete route already
// does), never the subject.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug, coachId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const { status, note } = body as { status: ValidStatus; note?: string };
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const contactedBy = actor.session.name;
  const actingCoachId = actor.kind === "coach" ? actor.session.id : null;

  const row: Record<string, unknown> = {
    subject_coach_id: coachId,
    campaign_slug:    slug,
    status,
    contacted_by:     contactedBy,
  };
  if (actingCoachId)  row.coach_id = actingCoachId;
  if (note?.trim())   row.note     = note.trim();

  const res = await fetch(`${BASE}/rest/v1/athlete_outreach`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to save outreach: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json(rows[0]);
}

// Full outreach history for one coach (as a fundraising subject) in this
// campaign (newest first). Staff-only, same as the athlete route.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, coachId } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/athlete_outreach?subject_coach_id=eq.${encodeURIComponent(coachId)}&campaign_slug=eq.${encodeURIComponent(slug)}&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch outreach history" }, { status: 500 });
  }

  return NextResponse.json(await res.json());
}
