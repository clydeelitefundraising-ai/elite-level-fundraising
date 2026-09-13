import { NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { removeAttachment, resolveCampaignSlugForAttachment } from "@/lib/moderation/messageModeration";
import { logAuditEvent } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ attachmentId: string }> };

export async function POST(_req: Request, { params }: RouteCtx) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { attachmentId } = await params;
  const campaignSlug = await resolveCampaignSlugForAttachment(attachmentId);
  if (!campaignSlug) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });

  const result = await removeAttachment(attachmentId, campaignSlug);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    return NextResponse.json({ error: "Failed to remove attachment." }, { status: 500 });
  }

  logAuditEvent({
    actor: { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
    action: "attachment.moderation_removed",
    entity_type: "message_attachments",
    entity_id: attachmentId,
    campaign_slug: campaignSlug,
    summary: "Attachment removed by Platform Admin",
  });

  return NextResponse.json({ ok: true });
}
