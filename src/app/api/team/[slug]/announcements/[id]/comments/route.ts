import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import type { ActorKey } from "@/lib/messages";
import {
  createComment, getVisibleComments, notifyHeadCoachesOfPendingComment,
} from "@/lib/platform/comments";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

// Any authenticated team actor (coach or member) of THIS campaign may
// comment — matches the existing Team Updates read gate exactly
// (requireTeamMembership()/announcements have no recipient_scope-based
// READ restriction today; recipient_scope only targets push notifications
// — confirmed by audit, not assumed). Public/unauthenticated is the only
// exclusion.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorKey: ActorKey = actor.kind === "coach"
    ? { kind: "coach",  id: actor.session.id }
    : { kind: "member", id: actor.session.id };
  const headCoach = isHeadCoach(actor);

  const comments = await getVisibleComments(id, slug, actorKey, headCoach);
  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const actorKey: ActorKey = actor.kind === "coach"
    ? { kind: "coach",  id: actor.session.id }
    : { kind: "member", id: actor.session.id };
  const headCoach = isHeadCoach(actor);

  // author_name/author_role are the durable snapshot identity (see the
  // migration's header comment for why) — always resolved server-side
  // from the session, never from the request body.
  const result = await createComment({
    campaignSlug:      slug,
    announcementId:    id,
    actor:             actorKey,
    isHeadCoachAuthor: headCoach,
    authorName:        actor.session.name,
    authorRole:        actor.session.role,
    body:              body.body,
  });

  if (!result.ok) {
    if (result.reason === "announcement_not_found") {
      return NextResponse.json({ error: "Announcement not found." }, { status: 404 });
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Fire-and-forget — a failed push must never fail the comment submission
  // itself. Only fires for comments that actually need moderation; a
  // Head-Coach-authored (auto-approved) comment never triggers this.
  if (result.comment.status === "pending") {
    void notifyHeadCoachesOfPendingComment(slug, result.announcementTitle).catch(() => {});
  }

  return NextResponse.json({ comment: result.comment }, { status: 201 });
}
