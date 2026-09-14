import { NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isThreadBlockedForActor, type ActorKey } from "@/lib/messages";

type RouteCtx = { params: Promise<{ slug: string; threadId: string }> };

// Lets the client know, on load (not just right after clicking Block in
// the same session), whether this thread is currently unusable due to a
// block relationship — so the composer can be disabled with the neutral
// "Messaging is unavailable" state even after a page refresh or on a
// device that wasn't the one that placed the block.
export async function GET(_req: Request, { params }: RouteCtx) {
  const { slug, threadId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const blocked = await isThreadBlockedForActor(threadId, slug, actorKey);
  return NextResponse.json({ blocked });
}
