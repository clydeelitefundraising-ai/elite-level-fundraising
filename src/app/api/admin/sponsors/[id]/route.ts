import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { updateSponsor, deleteSponsor } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { name, url, tier } = await req.json();
  await updateSponsor(id, { name, url, tier });
  logAuditEvent({
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
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteSponsor(id);
  logAuditEvent({
    action:      "sponsor.deleted",
    entity_type: "sponsor",
    entity_id:   id,
    summary:     `Deleted sponsor ${id}`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
