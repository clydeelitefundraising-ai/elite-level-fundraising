import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import type { ActorKey } from "@/lib/messages";
import { deleteComment } from "@/lib/platform/comments";

type RouteCtx = { params: Promise<{ slug: string; id: string; commentId: string }> };

// Conservative first version (Phase 3B-2, explicit scope): delete only,
// no editing. Author may delete their own comment in any status; Head
// Coach may delete any comment for moderation cleanup. Authorization is
// re-checked server-side inside deleteComment() against the actual row —
// this route never trusts anything from the client except which id to
// act on.
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const { slug, commentId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };

  const result = await deleteComment(commentId, slug, actorKey, isHeadCoach(actor));
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
