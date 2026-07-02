import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { getActivities, createActivity, CRM_ACTIVITY_TYPES } from "@/lib/platform/crm";
import type { CrmActivityType } from "@/lib/platform/crm";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_TYPES = new Set<string>(CRM_ACTIVITY_TYPES);

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = req.nextUrl.searchParams.get("contact_id") ?? undefined;
  return NextResponse.json(await getActivities(contactId));
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const contact_id = typeof body.contact_id === "string" ? body.contact_id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const activity_type: CrmActivityType = typeof body.activity_type === "string" && VALID_TYPES.has(body.activity_type)
    ? body.activity_type as CrmActivityType : "note";

  if (!contact_id || !title) {
    return NextResponse.json({ error: "contact_id and title are required." }, { status: 400 });
  }

  let activity;
  try {
    activity = await createActivity({
      contact_id,
      activity_type,
      title,
      body: typeof body.body === "string" && body.body.trim() !== "" ? body.body.trim() : null,
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to create activity: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }

  logAudit({
    action:      "crm.activity_added",
    entity_type: "coach_crm_activity",
    entity_id:   activity.id,
    summary:     `Added ${activity_type} activity: "${title}"`,
    new_value:   { contact_id, activity_type, title },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json(activity);
}
