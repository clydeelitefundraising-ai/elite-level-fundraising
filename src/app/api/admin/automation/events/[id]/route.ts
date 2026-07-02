import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_STATUSES = new Set(["open", "acknowledged", "resolved"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { status } = await req.json() as { status?: string };

  if (!status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { status };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();

  const res = await fetch(`${BASE}/rest/v1/automation_events?id=eq.${encodeURIComponent(id)}`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify(patch),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to update event: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  const event = rows[0];
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  logAuditEvent({
    action:      `automation.event_${status}`,
    entity_type: "automation_event",
    entity_id:   id,
    campaign_slug: event.campaign_slug ?? null,
    summary:     `Automation event "${event.title as string}" marked ${status}`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json(event);
}
