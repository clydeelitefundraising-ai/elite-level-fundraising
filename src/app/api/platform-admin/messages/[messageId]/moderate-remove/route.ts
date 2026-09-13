import { NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { removeMessage, resolveCampaignSlugForMessage } from "@/lib/moderation/messageModeration";
import { logAuditEvent } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ messageId: string }> };

// Cross-campaign equivalent of the team-scoped route — the campaign a
// message belongs to is resolved server-side (never trusted from the
// client), since a Platform Admin's session isn't locked to one team.
export async function POST(_req: Request, { params }: RouteCtx) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId } = await params;
  const campaignSlug = await resolveCampaignSlugForMessage(messageId);
  if (!campaignSlug) return NextResponse.json({ error: "Message not found." }, { status: 404 });

  const result = await removeMessage(messageId, campaignSlug);
  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Message not found." }, { status: 404 });
    return NextResponse.json({ error: "Failed to remove message." }, { status: 500 });
  }

  logAuditEvent({
    actor: { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
    action: "message.moderation_removed",
    entity_type: "messages",
    entity_id: messageId,
    campaign_slug: campaignSlug,
    summary: `Message removed by Platform Admin (${result.attachmentsRemoved} attachment(s) also removed)`,
  });

  return NextResponse.json({ ok: true, attachmentsRemoved: result.attachmentsRemoved });
}
