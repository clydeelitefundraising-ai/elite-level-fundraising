import { seasonWriteBlockedFor } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { updateSponsor, deleteSponsor } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { id } = await params;
  const seasonBlocked = await seasonWriteBlockedFor("sponsors", id);
  if (seasonBlocked) return seasonBlocked;
  const { name, url, tier } = await req.json();
  await updateSponsor(id, { name, url, tier });
  logAuditEvent({
    actor: adminAuditActor(access),
    action:      "sponsor.updated",
    entity_type: "sponsor",
    entity_id:   id,
    summary:     `Updated sponsor ${id}: "${name}", ${tier}`,
    new_value:   { name, url, tier },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { id } = await params;
  const seasonBlocked = await seasonWriteBlockedFor("sponsors", id);
  if (seasonBlocked) return seasonBlocked;
  await deleteSponsor(id);
  logAuditEvent({
    actor: adminAuditActor(access),
    action:      "sponsor.deleted",
    entity_type: "sponsor",
    entity_id:   id,
    summary:     `Deleted sponsor ${id}`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
