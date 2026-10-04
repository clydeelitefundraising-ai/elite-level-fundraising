import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import {
  createGroupThread,
  validateGroupName,
  fetchMemberById,
  fetchCoachById,
} from "@/lib/messages";

type RouteCtx = { params: Promise<{ slug: string }> };

// Group Messaging G1 — coach-created named group. Deliberately a separate
// route from the existing singular-recipient /messages/threads (DM)
// endpoint, not a generalization of it: the authorization shape (coach-only
// creation, multiple athlete/staff participants, a required name) is
// meaningfully different from DM creation, and /messages/threads's
// recipient/block/reuse logic (resolveOrCreateThreadForRecipient) is
// explicitly DM-only and untouched by this route.
//
// Locked G1 scope: creation is restricted to a REAL team_coaches row with
// role head_coach or assistant_coach — never booster, never a member
// (athlete/parent), never public, and (deliberate, reported scope
// decision) never a platform admin either, even though platform admins get
// head-coach-equivalent authority almost everywhere else in this app.
// Extending group management to platform admins would mean generalizing
// every new participant/creator identity in this file from "coach" to a
// 3-way union for a case the locked product decision never asked for —
// left for a future phase if actually needed, rather than expanding scope
// here. See the G1 report for the full rationale.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" || (actor.session.role !== "head_coach" && actor.session.role !== "assistant_coach")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const nameResult = validateGroupName(body?.name);
  if (!nameResult.ok) {
    return NextResponse.json({ error: nameResult.error }, { status: 400 });
  }

  const rawAthleteIds: unknown = body?.athleteIds;
  const rawStaffIds: unknown = body?.staffIds;
  const athleteIds = Array.isArray(rawAthleteIds) ? rawAthleteIds.filter((id): id is string => typeof id === "string") : [];
  const staffIds   = Array.isArray(rawStaffIds)   ? rawStaffIds.filter((id): id is string => typeof id === "string")   : [];

  if (athleteIds.length === 0 && staffIds.length === 0) {
    return NextResponse.json({ error: "Select at least one athlete or staff member." }, { status: 400 });
  }

  // Every id is validated against THIS campaign — never trusted from the
  // client as already scoped. A cross-team id (athlete or staff) fails the
  // whole creation rather than silently being dropped, so a coach never
  // gets a group with fewer members than they thought they selected.
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

  const result = await createGroupThread({
    slug,
    creatorCoachId: actor.session.id,
    creatorName:    actor.session.name,
    creatorRole:    actor.session.role,
    name:           nameResult.name,
    memberIds:      athleteIds,
    coachIds:       staffIds,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.thread, { status: 201 });
}
