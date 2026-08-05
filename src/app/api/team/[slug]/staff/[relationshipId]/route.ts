import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageStaff } from "@/lib/permissions";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { removeStaffRelationship } from "@/lib/staffInvite";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; relationshipId: string }> },
) {
  const { slug, relationshipId } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageStaff(actor) || actor.kind !== "coach" || actor.session.campaign_slug !== slug) {
    return NextResponse.json({ error: "Only this team's Head Coach can remove staff." }, { status: 403 });
  }

  const result = await removeStaffRelationship(relationshipId, slug, actor.session.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    action: "staff.removed",
    entity_type: "team_coach",
    entity_id: relationshipId,
    campaign_slug: slug,
    summary: `Removed staff member ${relationshipId} from ${slug}`,
    new_value: { acting_head_coach_id: actor.session.id },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
