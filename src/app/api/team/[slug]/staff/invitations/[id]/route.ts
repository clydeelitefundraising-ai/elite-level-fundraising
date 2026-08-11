import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageStaff } from "@/lib/permissions";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { revokeStaffInvitation } from "@/lib/staffInvite";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageStaff(actor) || actor.kind !== "coach" || actor.session.campaign_slug !== slug) {
    return NextResponse.json({ error: "Only this team's Head Coach can revoke invitations." }, { status: 403 });
  }

  const result = await revokeStaffInvitation(id, slug);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    action: "staff.invitation_revoked",
    entity_type: "team_staff_invitation",
    entity_id: id,
    campaign_slug: slug,
    summary: `Revoked invitation to ${result.invitation.email} on ${slug}`,
    new_value: { acting_head_coach_id: actor.session.id },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
