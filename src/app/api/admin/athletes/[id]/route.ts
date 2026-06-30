import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { updateAthlete, deleteAthlete } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { name, event } = await req.json();
  await updateAthlete(id, { name, event });
  logAuditEvent({
    action:      "athlete.updated",
    entity_type: "athlete",
    entity_id:   id,
    summary:     `Updated athlete ${id}: name="${name}", event="${event}"`,
    new_value:   { name, event },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteAthlete(id);
  logAuditEvent({
    action:      "athlete.deleted",
    entity_type: "athlete",
    entity_id:   id,
    summary:     `Deleted athlete ${id}`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
