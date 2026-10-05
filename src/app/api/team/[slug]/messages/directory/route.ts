import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { resolvePhotoUrl, linkAthleteRosterToMembers, type RawCoachInfo, type RawMemberInfo } from "@/lib/messages";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string }> };

const COACH_SELECT  = "id,name,role,elf_accounts!account_id(profile_photo_url)";
const MEMBER_SELECT = "id,name,role,athlete_id,athletes!athlete_id(profile_photo),elf_accounts!account_id(profile_photo_url)";
// G3C bugfix — athlete entries are now built from the FULL athletes roster
// (campaign-scoped), not from team_members at all; this select is unrelated
// to MEMBER_SELECT's joined-only shape.
const ATHLETE_ROSTER_SELECT = "id,name,event,class_year,profile_photo";

type RawCoachRow   = RawCoachInfo  & { id: string };
type RawMemberRow  = RawMemberInfo & { id: string };
type RawAthleteMemberRow = { id: string; athlete_id: string | null; role: string; campaign_slug: string };
type RawRosterAthleteRow = { id: string; name: string; event: string | null; class_year: string | null; profile_photo: string | null };

/** Returns the full roster + staff + parents for the DM compose recipient
 *  picker. Coach/parent branches are UNCHANGED — joined team_members only,
 *  same as before. The ATHLETE branch is G3C's bugfix: a roster athlete who
 *  has never joined ELF must still be VISIBLE (so a coach doesn't see an
 *  empty roster merely because nobody has joined yet), but is never
 *  message-capable — `teamMemberId` (the only valid DM recipient_id) is
 *  null for them, computed server-side via linkAthleteRosterToMembers()'s
 *  strict athletes.id <-> team_members.athlete_id join (never by name). */
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

  const [coachRes, rosterRes, athleteMemberRes, parentRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=${COACH_SELECT}&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=${ATHLETE_ROSTER_SELECT}&order=name.asc`,
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

  const coachRows: RawCoachRow[]          = coachRes.ok         ? await coachRes.json()         : [];
  const rosterRows: RawRosterAthleteRow[] = rosterRes.ok        ? await rosterRes.json()        : [];
  const athleteMemberRows: RawMemberRow[] = athleteMemberRes.ok ? await athleteMemberRes.json() : [];
  const parentRows: RawMemberRow[]        = parentRes.ok        ? await parentRes.json()        : [];

  const coaches = coachRows
    .filter(c => c.id !== actorCoachId)
    .map(c => ({ id: c.id, name: c.name, role: c.role, photo_url: resolvePhotoUrl(c, null) }));
  const parents = parentRows.map(m => ({ id: m.id, name: m.name, role: m.role, athlete_id: m.athlete_id, photo_url: resolvePhotoUrl(null, m) }));

  // athlete_id is already guaranteed non-null for an athlete-role
  // team_members row by createLinkedAthleteMember() (src/lib/platform/athletes.ts)
  // — the only writer of such a row — but linkAthleteRosterToMembers() still
  // treats a null defensively (skips it) rather than assuming that holds.
  const athleteMemberLinks: RawAthleteMemberRow[] = athleteMemberRows.map(m => ({
    id: m.id, athlete_id: m.athlete_id, role: m.role, campaign_slug: slug,
  }));
  const membershipByAthleteId = new Map(
    linkAthleteRosterToMembers(slug, rosterRows.map(r => r.id), athleteMemberLinks)
      .map(link => [link.athleteId, link]),
  );
  const athleteMemberByAthleteId = new Map(athleteMemberRows.filter(m => m.athlete_id).map(m => [m.athlete_id as string, m]));

  const athletes = rosterRows.map(r => {
    const link = membershipByAthleteId.get(r.id);
    const teamMemberId = link?.teamMemberId ?? null;
    const joined = link?.joined ?? false;
    // Joined: same photo priority as every other identity in this
    // endpoint (resolvePhotoUrl — account photo first, then roster photo).
    // Unjoined: no account/member row exists at all, so the roster's own
    // profile_photo (if any) is the only possible photo.
    const photo_url = joined
      ? resolvePhotoUrl(null, athleteMemberByAthleteId.get(r.id) ?? null)
      : r.profile_photo;
    return {
      athleteId:    r.id,
      teamMemberId,
      name:         r.name,
      event:        r.event,
      classYear:    r.class_year,
      joined,
      photo_url,
    };
  });

  return NextResponse.json({ coaches, athletes, parents });
}
