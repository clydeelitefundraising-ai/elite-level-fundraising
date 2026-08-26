import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { updateFundUse, deleteFundUse } from "@/lib/supabase";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { title, description, icon, sort_order } = await req.json();
  await updateFundUse(id, { title, description, icon, sort_order });
  logAuditEvent({
    actor: ADMIN_TOOL_ACTOR,
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
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteFundUse(id);
  logAuditEvent({
    actor: ADMIN_TOOL_ACTOR,
    action:      "fund_use.deleted",
    entity_type: "fund_use",
    entity_id:   id,
    summary:     `Deleted fund use ${id}`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
