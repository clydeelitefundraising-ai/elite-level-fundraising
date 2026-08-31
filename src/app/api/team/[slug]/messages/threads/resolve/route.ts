import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { platformAdminRoleLabel } from "@/lib/permissions";
import { resolveOrCreateThreadForRecipient, parseResolveRequestBody, type ActorKey } from "@/lib/messages";

// Resolves or creates the canonical thread + required participants for a
// NEW conversation, WITHOUT inserting a message — the first step of the
// "new conversation with attachments" flow (see the approved design):
// resolve a real, authorized thread_id first, THEN sign/upload
// attachments against it, THEN send the actual message via the reply
// endpoint. Every text-only new-thread send keeps using the original
// one-shot POST /messages/threads unchanged; this endpoint exists only
// for the attachment-first case, where no message body may exist yet at
// the moment recipients/attachments are being chosen.
type RouteCtx = { params: Promise<{ slug: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteCtx,
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseResolveRequestBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { recipientActorType, recipientId } = parsed;

  const actorKey: ActorKey =
    actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
    actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
    { kind: "member", id: actor.session.id };
  const actorName = actor.session.name;
  const actorRole = actor.kind === "platform_admin" ? platformAdminRoleLabel() : actor.session.role;
  // Same computation as POST /messages/threads — a platform admin carries
  // head-coach-equivalent authority under their own identity.
  const actorIsHeadCoach =
    (actor.kind === "coach" && actor.session.role === "head_coach") ||
    actor.kind === "platform_admin";

  const outcome = await resolveOrCreateThreadForRecipient({
    slug,
    actor: actorKey,
    actorName,
    actorRole,
    actorIsHeadCoach,
    // Loose cast, matching the existing POST /messages/threads route's
    // own behavior — an invalid value falls through to
    // resolveOrCreateThreadForRecipient's "Recipient not found" 404
    // rather than being rejected here as a distinct error.
    recipientActorType: recipientActorType as "coach" | "member",
    recipientId,
    // No message exists yet — nothing to seed last_message_preview with.
    // The reply endpoint's normal updateThreadMeta call fixes this up
    // once a real message is actually sent into the thread.
    initialPreview: null,
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  // Deliberately minimal response — no message, no push, no
  // notification, no last_message_at/preview update. This endpoint's
  // only job is producing an authorized thread_id.
  return NextResponse.json({ thread_id: outcome.thread.id, reused: outcome.reused });
}
