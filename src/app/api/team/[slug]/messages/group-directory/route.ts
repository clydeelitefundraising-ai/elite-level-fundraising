import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isCoachOnlyRole } from "@/lib/permissions";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string }> };

type RawAthleteRow = { id: string; name: string; event: string | null; class_year: string | null };
type RawCoachRow   = { id: string; name: string; role: string };

// Group Messaging G3A — the data source for group creation/Add People
// (GroupParticipantPicker, adapted in G3B), deliberately SEPARATE from
// /messages/directory: that endpoint only ever returns joined team_members
// rows, which is correct for Direct Messages (a DM recipient must be a
// real, message-capable identity) but wrong here — a coach must be able to
// assign ANY roster athlete to a group, joined or not. Returns the full
// active athletes roster (never team_members-filtered) plus a `joined`
// flag resolved server-side, and the legitimate team_coaches staff
// directory (excluding the calling coach's own id, same convention
// /messages/directory already uses). Deliberately never exposes an
// internal team_member_id — the server already resolves a roster athlete's
// joined identity internally wherever it's actually needed (activation,
// removal); the client has no legitimate use for it. Deliberately never
// includes parents (group assignment is athletes + staff only, per locked
// product decision — parents are always auto-included via family
// relationships, never directly selectable). Event/class_year are returned
// as plain roster metadata for search/display only — they never determine
// group membership; the coach still manually decides every assignment.
//
// Gated the same as group creation itself (coach-only, head_coach/
// assistant_coach) — this is roster+staff data for building a group, not
// general team directory data any authenticated actor should see.
export async function GET(
  _req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" || !isCoachOnlyRole(actor.session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [athleteRes, coachRes, joinedRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,event,class_year&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.athlete&athlete_id=not.is.null&select=athlete_id`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const athleteRows: RawAthleteRow[] = athleteRes.ok ? await athleteRes.json() : [];
  const coachRows: RawCoachRow[]     = coachRes.ok   ? await coachRes.json()   : [];
  const joinedIds = new Set<string>(
    (joinedRes.ok ? await joinedRes.json() : []).map((m: { athlete_id: string }) => m.athlete_id),
  );

  const athletes = athleteRows.map(a => ({
    id:         a.id,
    name:       a.name,
    event:      a.event,
    classYear:  a.class_year,
    joined:     joinedIds.has(a.id),
  }));
  const staff = coachRows
    .filter(c => c.id !== actor.session.id)
    .map(c => ({ id: c.id, name: c.name, role: c.role }));

  return NextResponse.json({ athletes, staff });
}
