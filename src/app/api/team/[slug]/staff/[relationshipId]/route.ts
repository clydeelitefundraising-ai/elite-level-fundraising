import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageStaff } from "@/lib/permissions";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { removeStaffRelationship } from "@/lib/staffInvite";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; relationshipId: string }> },
) {
  const { slug, relationshipId } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageStaff(actor) || (actor.kind !== "coach" && actor.kind !== "platform_admin") || actor.session.campaign_slug !== slug) {
    return NextResponse.json({ error: "Only this team's Head Coach can remove staff." }, { status: 403 });
  }

  // Second arg is only ever compared against a team_coaches.id for a
  // "cannot remove yourself" guard — a platform admin has no such row, so
  // passing their platformAdminId here is safe: it can never match a real
  // team_coaches.id, meaning that guard simply never fires for them
  // (correct — removing a staff row is never "removing yourself" for an
  // actor who isn't in team_coaches at all).
  const actingId = actor.kind === "coach" ? actor.session.id : actor.session.platformAdminId;
  const result = await removeStaffRelationship(relationshipId, slug, actingId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "staff.removed",
    entity_type: "team_coach",
    entity_id: relationshipId,
    campaign_slug: slug,
    summary: `Removed staff member ${relationshipId} from ${slug}`,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
