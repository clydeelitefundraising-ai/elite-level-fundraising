import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadById,
  canManageGroupThread,
  addGroupParticipants,
  removeGroupParticipant,
  removeRosterAthleteFromGroup,
  fetchCoachById,
  type ParticipantRef,
} from "@/lib/messages";
import { validateAthleteForCampaign } from "@/lib/platform/athletes";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

async function loadManageableGroup(slug: string, threadId: string) {
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" || (actor.session.role !== "head_coach" && actor.session.role !== "assistant_coach")) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  const role = actor.session.role as "head_coach" | "assistant_coach";
  const coachId = actor.session.id;

  const thread = await getThreadById(threadId, slug);
  if (!thread || thread.thread_type !== "group") {
    return { ok: false as const, status: 404, error: "Group not found." };
  }

  if (!canManageGroupThread(role, coachId, thread)) {
    return { ok: false as const, status: 403, error: "Unauthorized" };
  }

  return { ok: true as const };
}

// Add one or more athletes/staff to an existing group. Reactivates a
// previously soft-removed participant rather than creating a duplicate
// identity, and re-synchronizes family inclusion from the thread's full
// current athlete-seed set (addGroupParticipants — src/lib/messages.ts),
// so a parent required again by this or any other still-active athlete is
// reactivated too. Every id is validated against THIS campaign before use.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug, threadId } = await params;
  const loaded = await loadManageableGroup(slug, threadId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const body = await req.json().catch(() => null);

  // G3A: same retirement as group creation — athleteIds (team_members.id)
  // is rejected outright rather than silently reinterpreted as roster ids.
  if (Array.isArray(body?.athleteIds)) {
    return NextResponse.json(
      { error: "athleteIds is no longer supported for adding group participants. Use rosterAthleteIds." },
      { status: 400 },
    );
  }

  const rawRosterAthleteIds: unknown = body?.rosterAthleteIds;
  const rawStaffIds: unknown = body?.staffIds;
  const rosterAthleteIds = Array.isArray(rawRosterAthleteIds) ? rawRosterAthleteIds.filter((id): id is string => typeof id === "string") : [];
  const staffIds         = Array.isArray(rawStaffIds)         ? rawStaffIds.filter((id): id is string => typeof id === "string")         : [];

  if (rosterAthleteIds.length === 0 && staffIds.length === 0) {
    return NextResponse.json({ error: "Select at least one athlete or staff member to add." }, { status: 400 });
  }

  const [validatedAthletes, validatedCoaches] = await Promise.all([
    Promise.all(rosterAthleteIds.map(id => validateAthleteForCampaign(id, slug))),
    Promise.all(staffIds.map(id => fetchCoachById(id, slug))),
  ]);
  if (validatedAthletes.some(a => !a)) {
    return NextResponse.json({ error: "One or more selected athletes could not be found on this team." }, { status: 400 });
  }
  if (validatedCoaches.some(c => !c)) {
    return NextResponse.json({ error: "One or more selected staff could not be found on this team." }, { status: 400 });
  }

  await addGroupParticipants({ threadId, campaignSlug: slug, rosterAthleteIds, coachIds: staffIds });
  return NextResponse.json({ ok: true });
}

// Remove exactly one directly-chosen roster athlete or staff participant.
// is_auto_included (family-mirrored) rows can't be removed directly here —
// see removeGroupParticipant()'s own doc comment in src/lib/messages.ts —
// and removing the last coach from a group is refused.
//
// G3A: athleteId (team_members.id) is retired in favor of rosterAthleteId
// (athletes.id) — a roster-only athlete has no team_members.id at all, so
// the old shape could never have expressed removing one in the first
// place. staffId is unchanged.
export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  const { slug, threadId } = await params;
  const loaded = await loadManageableGroup(slug, threadId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.athleteId === "string") {
    return NextResponse.json(
      { error: "athleteId is no longer supported for removing a group participant. Use rosterAthleteId." },
      { status: 400 },
    );
  }

  const rosterAthleteId: unknown = body?.rosterAthleteId;
  const staffId: unknown = body?.staffId;

  if (typeof rosterAthleteId === "string" && typeof staffId === "string") {
    return NextResponse.json({ error: "Specify only one of rosterAthleteId or staffId." }, { status: 400 });
  }

  if (typeof rosterAthleteId === "string" && rosterAthleteId) {
    const athlete = await validateAthleteForCampaign(rosterAthleteId, slug);
    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found on this team." }, { status: 400 });
    }
    const result = await removeRosterAthleteFromGroup(threadId, slug, rosterAthleteId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof staffId === "string" && staffId) {
    const ref: ParticipantRef = { actor_type: "coach", coach_id: staffId, member_id: null, platform_admin_id: null };
    const result = await removeGroupParticipant(threadId, slug, ref);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Specify rosterAthleteId or staffId." }, { status: 400 });
}
