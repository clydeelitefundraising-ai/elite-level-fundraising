import { NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { removeMessage } from "@/lib/moderation/messageModeration";
import { logAuditEvent, toAuditActor } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string; messageId: string }> };

// Head Coach (own campaign) or Platform Admin only. A member, or a coach
// who isn't the Head Coach, gets 401 before removeMessage() is ever
// called — matches the exact gating pattern already used for comment
// deletion/decision routes.
export async function POST(_req: Request, { params }: RouteCtx) {
  const { slug, messageId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await removeMessage(messageId, slug);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Message not found." }, { status: 404 });
    return NextResponse.json({ error: "Failed to remove message." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "message.moderation_removed",
    entity_type: "messages",
    entity_id: messageId,
    campaign_slug: slug,
    summary: `Message removed by moderator (${result.attachmentsRemoved} attachment(s) also removed)`,
  });

  return NextResponse.json({ ok: true, attachmentsRemoved: result.attachmentsRemoved });
}
