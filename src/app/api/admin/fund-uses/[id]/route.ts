import { seasonWriteBlockedFor } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { updateFundUse, deleteFundUse } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { id } = await params;
  const seasonBlocked = await seasonWriteBlockedFor("fund_uses", id);
  if (seasonBlocked) return seasonBlocked;
  const { title, description, icon, sort_order } = await req.json();
  await updateFundUse(id, { title, description, icon, sort_order });
  logAuditEvent({
    actor: adminAuditActor(access),
    action:      "fund_use.updated",
    entity_type: "fund_use",
    entity_id:   id,
    summary:     `Updated fund use ${id}: "${title}"`,
    new_value:   { title, description, icon, sort_order },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { id } = await params;
  const seasonBlocked = await seasonWriteBlockedFor("fund_uses", id);
  if (seasonBlocked) return seasonBlocked;
  await deleteFundUse(id);
  logAuditEvent({
    actor: adminAuditActor(access),
    action:      "fund_use.deleted",
    entity_type: "fund_use",
    entity_id:   id,
    summary:     `Deleted fund use ${id}`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
