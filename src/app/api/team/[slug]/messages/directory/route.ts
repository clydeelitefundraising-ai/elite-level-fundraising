import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { resolvePhotoUrl, type RawCoachInfo, type RawMemberInfo } from "@/lib/messages";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string }> };

const COACH_SELECT  = "id,name,role,elf_accounts!account_id(profile_photo_url)";
const MEMBER_SELECT = "id,name,role,athlete_id,athletes!athlete_id(profile_photo),elf_accounts!account_id(profile_photo_url)";

type RawCoachRow  = RawCoachInfo  & { id: string };
type RawMemberRow = RawMemberInfo & { id: string };

/** Returns coaches + members for the compose recipient picker, with photo
 *  URLs resolved via the same shared rule used for message participants
 *  (resolvePhotoUrl) — extends the existing single-request selects rather
 *  than adding new per-recipient lookups. */
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
      `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=${COACH_SELECT}&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.athlete&select=${MEMBER_SELECT}&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.parent&select=${MEMBER_SELECT}&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const coachRows: RawCoachRow[]   = coachRes.ok   ? await coachRes.json()   : [];
  const athleteRows: RawMemberRow[] = athleteRes.ok ? await athleteRes.json() : [];
  const parentRows: RawMemberRow[]  = parentRes.ok  ? await parentRes.json()  : [];

  const coaches = coachRows
    .filter(c => c.id !== actorCoachId)
    .map(c => ({ id: c.id, name: c.name, role: c.role, photo_url: resolvePhotoUrl(c, null) }));
  const athletes = athleteRows.map(m => ({ id: m.id, name: m.name, role: m.role, athlete_id: m.athlete_id, photo_url: resolvePhotoUrl(null, m) }));
  const parents  = parentRows.map(m  => ({ id: m.id, name: m.name, role: m.role, athlete_id: m.athlete_id, photo_url: resolvePhotoUrl(null, m) }));

  return NextResponse.json({ coaches, athletes, parents });
}
