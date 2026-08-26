import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { approveComment, declineComment } from "@/lib/platform/comments";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

// Approve or decline a pending comment. Head-Coach-equivalent-only for
// THIS campaign — see route.ts (GET) for why isHeadCoach() is the correct
// check (true for the real Head Coach AND a platform admin acting under
// their own identity). decided_by_coach_id / decided_by_platform_admin_id
// is always derived from the resolved actor, never trusted from the
// request body. The campaign is taken from the URL, never the body, so a
// Head-Coach-equivalent of a different campaign cannot act on this
// comment even if they somehow learn its id.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // isHeadCoach is true only for "coach" (role=head_coach) or
  // "platform_admin" — TypeScript can't infer that through the function
  // boundary, so this narrows explicitly for the decidedBy id below.
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || (body.action !== "approve" && body.action !== "decline")) {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'." }, { status: 400 });
  }

  const decidedBy = actor.kind === "coach"
    ? { kind: "coach" as const, id: actor.session.id }
    : { kind: "platform_admin" as const, id: actor.session.platformAdminId };

  const result = body.action === "approve"
    ? await approveComment(id, slug, decidedBy)
    : await declineComment(id, slug, decidedBy);

  if (!result.ok) {
    if (result.reason === "not_found")       return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    if (result.reason === "already_decided") return NextResponse.json({ error: "This comment has already been decided." }, { status: 409 });
  }

  return NextResponse.json(result);
}
