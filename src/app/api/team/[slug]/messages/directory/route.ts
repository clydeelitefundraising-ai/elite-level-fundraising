import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string }> };

/** Returns coaches + members for the compose recipient picker. */
export async function GET(
  _req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorCoachId = actor.kind === "coach" ? actor.session.id : null;

  const [coachRes, athleteRes, parentRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.athlete&select=id,name,role,athlete_id&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.parent&select=id,name,role,athlete_id&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const coaches: { id: string; name: string; role: string }[] =
    coachRes.ok ? await coachRes.json() : [];
  const athletes: { id: string; name: string; role: string; athlete_id: string | null }[] =
    athleteRes.ok ? await athleteRes.json() : [];
  const parents: { id: string; name: string; role: string; athlete_id: string | null }[] =
    parentRes.ok ? await parentRes.json() : [];

  // Exclude self from coach list
  const filteredCoaches = actorCoachId
    ? coaches.filter(c => c.id !== actorCoachId)
    : coaches;

  return NextResponse.json({ coaches: filteredCoaches, athletes, parents });
}
