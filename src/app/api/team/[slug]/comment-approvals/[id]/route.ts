import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { approveComment, declineComment } from "@/lib/platform/comments";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

// Approve or decline a pending comment. Head-Coach-only for THIS campaign
// — see route.ts (GET) for why isHeadCoach() is the correct check.
// decided_by_coach_id is always actor.session.id (the team_coaches row —
// only a "coach" actor can ever be a Head Coach), never trusted from the
// request body. The campaign is taken from the URL, never the body, so a
// Head Coach of a different campaign cannot act on this comment even if
// they somehow learn its id.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // isHeadCoach narrows actor.kind to "coach" already, but TypeScript
  // can't infer that through the function boundary.
  if (actor.kind !== "coach") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || (body.action !== "approve" && body.action !== "decline")) {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'." }, { status: 400 });
  }

  const result = body.action === "approve"
    ? await approveComment(id, slug, actor.session.id)
    : await declineComment(id, slug, actor.session.id);

  if (!result.ok) {
    if (result.reason === "not_found")       return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    if (result.reason === "already_decided") return NextResponse.json({ error: "This comment has already been decided." }, { status: 409 });
  }

  return NextResponse.json(result);
}
