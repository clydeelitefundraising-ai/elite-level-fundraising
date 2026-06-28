import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string; athleteId: string }> };

// GET /api/team/[slug]/contacts/coach/athlete/[athleteId]
// Staff only. Returns full contact list for one athlete.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug, athleteId } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public" || !isStaff(actor)) {
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
