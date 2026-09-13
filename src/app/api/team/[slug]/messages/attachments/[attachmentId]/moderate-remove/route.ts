import { NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { removeAttachment } from "@/lib/moderation/messageModeration";
import { logAuditEvent, toAuditActor } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string; attachmentId: string }> };

// Independent attachment removal (message body stays intact) — Head
// Coach (own campaign) or Platform Admin only.
export async function POST(_req: Request, { params }: RouteCtx) {
  const { slug, attachmentId } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await removeAttachment(attachmentId, slug);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    return NextResponse.json({ error: "Failed to remove attachment." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "attachment.moderation_removed",
    entity_type: "message_attachments",
    entity_id: attachmentId,
    campaign_slug: slug,
    summary: "Attachment removed by moderator",
  });

  return NextResponse.json({ ok: true });
}
