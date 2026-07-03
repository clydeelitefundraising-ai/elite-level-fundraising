import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getAthletes, addAthlete } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

const DEFAULT_SLUG = "paradise-valley-track-field-live";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug") ?? DEFAULT_SLUG;
  const athletes = await getAthletes(slug);
  return NextResponse.json(athletes);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { campaign_slug, name, event, class_year } = await req.json();
  const slug = campaign_slug ?? DEFAULT_SLUG;
  if (!name?.trim() || !event?.trim()) {
    return NextResponse.json({ error: "name and event are required" }, { status: 400 });
  }
  const athlete = await addAthlete({
    campaign_slug: slug, name: name.trim(), event: event.trim(),
    class_year: class_year?.trim() || null, contact_phone: null, contact_email: null,
  });
  logAuditEvent({
    action:        "athlete.added",
    entity_type:   "athlete",
    entity_id:     athlete?.id ?? undefined,
    campaign_slug: slug,
    summary:       `Added athlete "${name.trim()}" (${event.trim()}) to ${slug}`,
    new_value:     { name: name.trim(), event: event.trim(), class_year: class_year ?? null, campaign_slug: slug },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });
  return NextResponse.json(athlete);
}
