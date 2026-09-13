import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { resolveReport, getAllReports } from "@/lib/moderation/reports";
import { logAuditEvent } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ id: string }> };

const VALID_STATUSES = ["reviewing", "actioned", "dismissed"] as const;

// Platform admin may resolve a report from ANY campaign — the report's
// own campaign_slug is looked up first (rather than trusted from the
// client) so the audit log entry is attributed to the correct team.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "status must be one of reviewing, actioned, dismissed." }, { status: 400 });
  }

  const all = await getAllReports();
  const existing = all.find(r => r.id === id);
  if (!existing) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const result = await resolveReport(
    id, existing.campaign_slug,
    { kind: "platform_admin", id: admin.platformAdminId },
    body.status,
    typeof body.resolutionNote === "string" ? body.resolutionNote : null,
  );

  if (!result.ok) {
    return NextResponse.json({ error: "Failed to resolve report." }, { status: 500 });
  }

  logAuditEvent({
    actor: { type: "platform_admin", id: admin.platformAdminId, email: admin.email, name: admin.name },
    action: "report.resolved",
    entity_type: "content_reports",
    entity_id: id,
    campaign_slug: existing.campaign_slug,
    summary: `Report marked ${body.status} (cross-campaign queue)`,
  });

  return NextResponse.json({ report: result.report });
}
