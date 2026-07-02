import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { getSponsorActivities, createSponsorActivity, SPONSOR_ACTIVITY_TYPES } from "@/lib/platform/sponsors";
import type { SponsorActivityType } from "@/lib/platform/sponsors";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_TYPES = new Set<string>(SPONSOR_ACTIVITY_TYPES);

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businessId = req.nextUrl.searchParams.get("business_id") ?? undefined;
  return NextResponse.json(await getSponsorActivities(businessId));
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const business_id = typeof body.business_id === "string" ? body.business_id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const activity_type: SponsorActivityType = typeof body.activity_type === "string" && VALID_TYPES.has(body.activity_type)
    ? body.activity_type as SponsorActivityType : "note";

  if (!business_id || !title) {
    return NextResponse.json({ error: "business_id and title are required." }, { status: 400 });
  }

  let activity;
  try {
    activity = await createSponsorActivity({
      business_id,
      activity_type,
      title,
      body: typeof body.body === "string" && body.body.trim() !== "" ? body.body.trim() : null,
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to create activity: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }

  logAudit({
    action:      "sponsor_business.activity_added",
    entity_type: "sponsor_activity",
    entity_id:   activity.id,
    summary:     `Added ${activity_type} activity: "${title}"`,
    new_value:   { business_id, activity_type, title },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json(activity);
}
