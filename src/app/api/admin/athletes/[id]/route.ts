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
  const { name, event, class_year } = await req.json();
  if (!name?.trim() || !class_year?.trim()) {
    return NextResponse.json({ error: "name and class are required" }, { status: 400 });
  }
  const eventValue = event?.trim() || null;
  try {
    await updateAthlete(id, { name: name.trim(), event: eventValue, class_year: class_year.trim() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update athlete." }, { status: 500 });
  }
  logAuditEvent({
    action:      "athlete.updated",
    entity_type: "athlete",
    entity_id:   id,
    summary:     `Updated athlete ${id}: name="${name.trim()}", class="${class_year.trim()}", event="${eventValue ?? ""}"`,
    new_value:   { name: name.trim(), event: eventValue, class_year: class_year.trim() },
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
