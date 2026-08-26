import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/platform/audit";
import { resolveEvent, acknowledgeEvent } from "@/lib/platform/automation";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_STATUSES = new Set(["acknowledged", "resolved"]);

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

  let event;
  try {
    event = status === "resolved" ? await resolveEvent(id) : await acknowledgeEvent(id);
  } catch (err) {
    return NextResponse.json({ error: `Failed to update event: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  logAudit({
    actor: ADMIN_TOOL_ACTOR,
    action:        `automation.event_${status}`,
    entity_type:   "automation_event",
    entity_id:     id,
    campaign_slug: event.campaign_slug ?? null,
    summary:       `Automation event "${event.title}" marked ${status}`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json(event);
}
