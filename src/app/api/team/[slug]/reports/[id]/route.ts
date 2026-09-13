import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { resolveReport } from "@/lib/moderation/reports";
import { logAuditEvent, toAuditActor } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

const VALID_STATUSES = ["reviewing", "actioned", "dismissed"] as const;

// Resolve a report scoped to THIS campaign. Head Coach only here — the
// platform-admin cross-campaign equivalent is
// /api/platform-admin/reports/[id], which is not campaign_slug-scoped.
// A member/booster (isHeadCoach() false) can never reach this.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "status must be one of reviewing, actioned, dismissed." }, { status: 400 });
  }

  const result = await resolveReport(
    id, slug,
    actor.kind === "coach" ? { kind: "coach", id: actor.session.id } : { kind: "platform_admin", id: actor.session.platformAdminId },
    body.status,
    typeof body.resolutionNote === "string" ? body.resolutionNote : null,
  );

  if (!result.ok) {
    if (result.reason === "not_found") return NextResponse.json({ error: "Report not found." }, { status: 404 });
    return NextResponse.json({ error: "Failed to resolve report." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "report.resolved",
    entity_type: "content_reports",
    entity_id: id,
    campaign_slug: slug,
    summary: `Report marked ${body.status}`,
  });

  return NextResponse.json({ report: result.report });
}
