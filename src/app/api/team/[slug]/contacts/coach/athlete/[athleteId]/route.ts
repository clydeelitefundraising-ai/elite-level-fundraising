import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type RouteCtx = { params: Promise<{ slug: string; athleteId: string }> };

// GET /api/team/[slug]/contacts/coach/athlete/[athleteId]
// Staff only. Returns full contact list for one athlete.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug, athleteId } = await params;
  const actor = await getTeamActor(slug);

  if (!isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=eq.${encodeURIComponent(athleteId)}&select=*&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to load contacts." }, { status: 500 });
  }
  const contacts = await res.json();
  return NextResponse.json({ contacts });
}

const ALLOWED_RELATIONSHIPS = new Set([
  "Family","Friend","Coworker","Neighbor","Coach","Teacher","Business","Other",
]);

// POST /api/team/[slug]/contacts/coach/athlete/[athleteId]
// Staff only. Creates a contact on behalf of a coach for a specific athlete.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug, athleteId } = await params;
  const actor = await getTeamActor(slug);

  if (!isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const phone = (body.phone as string | undefined)?.trim() || null;
  const email = (body.email as string | undefined)?.trim() || null;
  if (!phone && !email) return NextResponse.json({ error: "At least one of phone or email is required." }, { status: 400 });

  const rel = body.relationship as string | undefined;
  if (rel && !ALLOWED_RELATIONSHIPS.has(rel)) return NextResponse.json({ error: "Invalid relationship value." }, { status: 400 });

  const coachId = actor.kind === "coach" ? actor.session.id : null;

  const now = new Date().toISOString();
  const contact = {
    campaign_slug:        slug,
    athlete_id:           athleteId,
    phone,
    email,
    first_name:           (body.first_name as string | undefined)?.trim() || null,
    last_name:            (body.last_name as string | undefined)?.trim() || null,
    relationship:         rel || null,
    relationship_other:   rel === "Other" ? ((body.relationship_other as string | undefined)?.trim() || null) : null,
    notes:                (body.notes as string | undefined)?.trim() || null,
    added_by_type:        "coach",
    added_by_member_id:   null,
    added_by_coach_id:    coachId,
    created_at:           now,
    updated_at:           now,
  };

  const res = await fetch(`${BASE}/rest/v1/fundraising_contacts`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify(contact),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: (err as { message?: string }).message ?? "Failed to save contact." },
      { status: 500 },
    );
  }
  const [created] = await res.json();
  return NextResponse.json(created, { status: 201 });
}
