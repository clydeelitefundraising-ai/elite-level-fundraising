import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getTeamIdBySlug, getNotificationIdForAnnouncement, markNotificationSeen, type ActorFilter } from "@/lib/notifications";

type RouteContext = { params: Promise<{ slug: string; id: string }> };

// Phase 9: viewport-triggered automatic Seen marking. The client sends
// only the announcement id (via the URL) — viewer identity and team
// context are both derived server-side, never trusted from the request
// body. Resolves the announcement's linked notification (team-scoped —
// see getNotificationIdForAnnouncement) and writes through the same
// canonical markNotificationSeen the existing tap-to-read path uses, so
// there is exactly one Seen-writing mechanism, idempotent via the
// existing DB UNIQUE constraints.
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;

  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teamId = await getTeamIdBySlug(slug);
  if (!teamId) return NextResponse.json({ error: "team not found" }, { status: 404 });

  const notificationId = await getNotificationIdForAnnouncement(id, teamId);
  if (!notificationId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const actorFilter: ActorFilter =
    actor.kind === "coach"          ? { kind: "coach", id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id, role: actor.session.role, athlete_id: actor.session.athlete_id };

  const result = await markNotificationSeen(actorFilter, notificationId, teamId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error === "Not found" ? 404 : 500 });
  }
  return NextResponse.json({ ok: true });
}
