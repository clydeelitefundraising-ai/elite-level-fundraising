import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  getThreadById,
  canManageGroupThread,
  addGroupParticipants,
  removeGroupParticipant,
  fetchMemberById,
  fetchCoachById,
  type ParticipantRef,
} from "@/lib/messages";

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
  const rawAthleteIds: unknown = body?.athleteIds;
  const rawStaffIds: unknown = body?.staffIds;
  const athleteIds = Array.isArray(rawAthleteIds) ? rawAthleteIds.filter((id): id is string => typeof id === "string") : [];
  const staffIds   = Array.isArray(rawStaffIds)   ? rawStaffIds.filter((id): id is string => typeof id === "string")   : [];

  if (athleteIds.length === 0 && staffIds.length === 0) {
    return NextResponse.json({ error: "Select at least one athlete or staff member to add." }, { status: 400 });
  }

  const [validatedMembers, validatedCoaches] = await Promise.all([
    Promise.all(athleteIds.map(id => fetchMemberById(id, slug))),
    Promise.all(staffIds.map(id => fetchCoachById(id, slug))),
  ]);
  if (validatedMembers.some(m => !m || m.role !== "athlete")) {
    return NextResponse.json({ error: "One or more selected athletes could not be found on this team." }, { status: 400 });
  }
  if (validatedCoaches.some(c => !c)) {
    return NextResponse.json({ error: "One or more selected staff could not be found on this team." }, { status: 400 });
  }

  await addGroupParticipants({ threadId, campaignSlug: slug, memberIds: athleteIds, coachIds: staffIds });
  return NextResponse.json({ ok: true });
}

// Remove exactly one directly-chosen athlete or staff participant.
// is_auto_included (family-mirrored) rows can't be removed directly here —
// see removeGroupParticipant()'s own doc comment in src/lib/messages.ts —
// and removing the last coach from a group is refused.
export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  const { slug, threadId } = await params;
  const loaded = await loadManageableGroup(slug, threadId);
  if (!loaded.ok) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }

  const body = await req.json().catch(() => null);
  const athleteId: unknown = body?.athleteId;
  const staffId: unknown = body?.staffId;

  if (typeof athleteId === "string" && typeof staffId === "string") {
    return NextResponse.json({ error: "Specify only one of athleteId or staffId." }, { status: 400 });
  }
  let ref: ParticipantRef;
  if (typeof athleteId === "string" && athleteId) {
    ref = { actor_type: "member", coach_id: null, member_id: athleteId, platform_admin_id: null };
  } else if (typeof staffId === "string" && staffId) {
    ref = { actor_type: "coach", coach_id: staffId, member_id: null, platform_admin_id: null };
  } else {
    return NextResponse.json({ error: "Specify athleteId or staffId." }, { status: 400 });
  }

  const result = await removeGroupParticipant(threadId, slug, ref);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
