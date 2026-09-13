import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import type { ActorKey } from "@/lib/messages";
import { blockUser, getBlockedByMe } from "@/lib/moderation/blocks";
import { logAuditEvent, type AuditActor } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string }> };

function toActorKey(actor: Exclude<Awaited<ReturnType<typeof getTeamActor>>, { kind: "public" }>): ActorKey {
  return actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
         actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
         { kind: "member", id: actor.session.id };
}

function toAuditActorOf(actor: Exclude<Awaited<ReturnType<typeof getTeamActor>>, { kind: "public" }>): AuditActor {
  return actor.kind === "coach"          ? { type: "coach", id: actor.session.id, name: actor.session.name } :
         actor.kind === "platform_admin" ? { type: "platform_admin", id: actor.session.platformAdminId, email: actor.session.email, name: actor.session.name } :
         { type: "member", id: actor.session.id, name: actor.session.name };
}

// Any authenticated team actor may block another actor. Self-block and
// cross-campaign targets are rejected in lib/moderation/blocks.ts /
// implicitly here (blockedId is only ever resolved within this
// campaign's own team_coaches/team_members/platform_admins rows by the
// caller — the client supplies an id it already saw rendered inside this
// team's own UI, and blockUser() does not accept a campaign_slug other
// than the one this route is scoped to).
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !["coach", "member", "platform_admin"].includes(body.blockedKind) || typeof body.blockedId !== "string") {
    return NextResponse.json({ error: "blockedKind and blockedId are required." }, { status: 400 });
  }

  const result = await blockUser(slug, toActorKey(actor), body.blockedKind, body.blockedId);
  if (!result.ok) {
    if (result.reason === "self_block") return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
    return NextResponse.json({ error: "Failed to block user." }, { status: 500 });
  }

  if (!("already_blocked" in result)) {
    logAuditEvent({
      actor: toAuditActorOf(actor),
      action: "block.created",
      entity_type: "user_blocks",
      entity_id: result.block.id,
      campaign_slug: slug,
      summary: `Blocked ${body.blockedKind}`,
    });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocks = await getBlockedByMe(slug, toActorKey(actor));
  return NextResponse.json({ blocks });
}
