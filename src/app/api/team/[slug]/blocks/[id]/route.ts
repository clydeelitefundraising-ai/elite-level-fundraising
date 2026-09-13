import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import type { ActorKey } from "@/lib/messages";
import { getBlockedByMe, unblockUser } from "@/lib/moderation/blocks";
import { logAuditEvent, type AuditActor } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

function toActorKey(actor: Exclude<Awaited<ReturnType<typeof getTeamActor>>, { kind: "public" }>): ActorKey {
  return actor.kind === "coach"          ? { kind: "coach",          id: actor.session.id } :
         actor.kind === "platform_admin" ? { kind: "platform_admin", id: actor.session.platformAdminId } :
         { kind: "member", id: actor.session.id };
}

// Unblock — only the original blocker may remove their own block. `id`
// is the user_blocks row id (returned by GET .../blocks), looked up
// against THIS actor's own block list before deleting, so one actor can
// never unblock a relationship that isn't theirs.
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actorKey = toActorKey(actor);
  const mine = await getBlockedByMe(slug, actorKey);
  const target = mine.find(b => b.id === id);
  if (!target) return NextResponse.json({ error: "Block not found." }, { status: 404 });

  const result = await unblockUser(slug, actorKey, target.blocked_kind, target.blocked_id);
  if (!result.ok) return NextResponse.json({ error: "Failed to unblock user." }, { status: 500 });

  const auditActor: AuditActor =
    actor.kind === "coach"          ? { type: "coach", id: actor.session.id, name: actor.session.name } :
    actor.kind === "platform_admin" ? { type: "platform_admin", id: actor.session.platformAdminId, email: actor.session.email, name: actor.session.name } :
    { type: "member", id: actor.session.id, name: actor.session.name };
  logAuditEvent({
    actor: auditActor,
    action: "block.removed",
    entity_type: "user_blocks",
    entity_id: id,
    campaign_slug: slug,
    summary: `Unblocked ${target.blocked_kind}`,
  });

  return NextResponse.json({ ok: true });
}
