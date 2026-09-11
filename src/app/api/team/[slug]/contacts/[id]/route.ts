import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageContact } from "@/lib/platform/coachFundraising";

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

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

const ALLOWED_RELATIONSHIPS = new Set([
  "Family","Friend","Coworker","Neighbor","Coach","Teacher","Business","Other",
]);

async function fetchContact(id: string, slug: string) {
  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contacts?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,athlete_id,coach_id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] as { id: string; athlete_id: string | null; coach_id: string | null } | undefined;
}

// PATCH /api/team/[slug]/contacts/[id]
// Athlete/parent: must share athlete_id with the contact
// Staff: may edit any ATHLETE-owned contact in this campaign (unchanged)
// Coach-owned contact: only that coach, or the Head Coach/Platform Admin
// — see canManageContact() for the full rule.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contact = await fetchContact(id, slug);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  if (!canManageContact(actor, contact)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const phone = (body.phone as string | undefined)?.trim() || null;
  const email = (body.email as string | undefined)?.trim() || null;
  if (!phone && !email) {
    return NextResponse.json({ error: "At least one of phone or email is required." }, { status: 400 });
  }
  if (phone && phone.length > 30) {
    return NextResponse.json({ error: "Phone must be 30 characters or fewer." }, { status: 400 });
  }
  if (email && email.length > 254) {
    return NextResponse.json({ error: "Email must be 254 characters or fewer." }, { status: 400 });
  }
  if (email && !email.includes("@")) {
    return NextResponse.json({ error: "Email must contain @." }, { status: 400 });
  }
  const rel = body.relationship as string | undefined;
  if (rel && !ALLOWED_RELATIONSHIPS.has(rel)) {
    return NextResponse.json({ error: "Invalid relationship value." }, { status: 400 });
  }

  const patch = {
    phone,
    email,
    first_name:          (body.first_name as string | undefined)?.trim() || null,
    last_name:           (body.last_name as string | undefined)?.trim() || null,
    relationship:        rel || null,
    relationship_other:  (body.relationship_other as string | undefined)?.trim() || null,
    notes:               (body.notes as string | undefined)?.trim() || null,
    updated_at:          new Date().toISOString(),
  };

  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contacts?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify(patch),
    },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to update contact." }, { status: 500 });
  }
  const [updated] = await res.json();
  return NextResponse.json(updated);
}

// DELETE /api/team/[slug]/contacts/[id]
// Athlete/parent: must share athlete_id with the contact
// Staff: may delete any ATHLETE-owned contact in this campaign (unchanged)
// Coach-owned contact: only that coach, or the Head Coach/Platform Admin
// — see canManageContact() for the full rule.
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contact = await fetchContact(id, slug);
  if (!contact) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  if (!canManageContact(actor, contact)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contacts?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h() },
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to delete contact." }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
