import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import type { ActorKey } from "@/lib/messages";
import { createReport, getReportsForCampaign, isValidReportReason, isValidTargetType } from "@/lib/moderation/reports";
import { logAuditEvent, type AuditActor } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string }> };

function toActorKey(actor: Exclude<Awaited<ReturnType<typeof getTeamActor>>, { kind: "public" }>): ActorKey {
  return actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
         actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
         { kind: "member", id: actor.session.id };
}

// Any authenticated team actor (coach, member, platform admin) of THIS
// campaign may file a report. Never resolvable by the reporter — see
// PATCH .../[id]/route.ts, which enforces isHeadCoach()/isPlatformAdmin()
// independently.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !isValidTargetType(body.targetType) || typeof body.targetId !== "string" || !isValidReportReason(body.reason)) {
    return NextResponse.json({ error: "targetType, targetId, and reason are required." }, { status: 400 });
  }
  if (body.targetType === "user" && !["coach", "member", "platform_admin"].includes(body.targetKind)) {
    return NextResponse.json({ error: "targetKind is required when reporting a user." }, { status: 400 });
  }

  const result = await createReport({
    campaignSlug: slug,
    reporter:     toActorKey(actor),
    reporterName: actor.session.name,
    targetType:   body.targetType,
    targetId:     body.targetId,
    targetKind:   body.targetType === "user" ? body.targetKind : null,
    reason:       body.reason,
    details:      typeof body.details === "string" ? body.details : null,
  });

  if (!result.ok) {
    if (result.reason === "target_not_found") return NextResponse.json({ error: "Reported item not found." }, { status: 404 });
    if (result.reason === "already_removed") return NextResponse.json({ error: "This content has already been removed by a moderator." }, { status: 409 });
    if (result.reason === "validation") return NextResponse.json({ error: result.message }, { status: 400 });
    return NextResponse.json({ error: "Failed to submit report." }, { status: 500 });
  }

  const auditActor: AuditActor =
    actor.kind === "coach"          ? { type: "coach", id: actor.session.id, name: actor.session.name } :
    actor.kind === "platform_admin" ? { type: "platform_admin", id: actor.session.platformAdminId, email: actor.session.email, name: actor.session.name } :
    { type: "member", id: actor.session.id, name: actor.session.name };
  logAuditEvent({
    actor: auditActor,
    action: "report.created",
    entity_type: "content_reports",
    entity_id: result.report.id,
    campaign_slug: slug,
    summary: `Reported ${body.targetType} for ${body.reason}`,
  });

  return NextResponse.json({ report: result.report }, { status: 201 });
}

// Head Coach moderation queue for THIS campaign only. Platform admins use
// the separate cross-campaign queue at /api/platform-admin/reports.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public" || !isHeadCoach(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reports = await getReportsForCampaign(slug);
  return NextResponse.json({ reports });
}
