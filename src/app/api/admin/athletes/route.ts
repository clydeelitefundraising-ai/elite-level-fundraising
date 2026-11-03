import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getAthletes } from "@/lib/supabase";
import { createAthlete } from "@/lib/platform/athletes";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";

const DEFAULT_SLUG = "paradise-valley-track-field-live";

export async function GET(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const slug = req.nextUrl.searchParams.get("slug") ?? DEFAULT_SLUG;
  const athletes = await getAthletes(slug);
  return NextResponse.json(athletes);
}

export async function POST(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const { campaign_slug, name, event, class_year, overrideCollision } = await req.json();
  const slug = campaign_slug ?? DEFAULT_SLUG;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  if (!name?.trim() || !class_year?.trim()) {
    return NextResponse.json({ error: "name and class are required" }, { status: 400 });
  }

  let result;
  try {
    result = await createAthlete(
      { campaignSlug: slug, name, classYear: class_year, event },
      { overrideCollision: overrideCollision === true },
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add athlete." }, { status: 500 });
  }

  if (!result.ok && result.reason === "validation") {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  if (!result.ok && result.reason === "collision") {
    return NextResponse.json(
      {
        error:     `An athlete named "${result.collision.existing.name}" already exists on this team.`,
        collision: result.collision,
      },
      { status: 409 },
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: "Failed to add athlete." }, { status: 500 });
  }

  const athlete = result.athlete;
  const eventValue = event?.trim() || null;
  logAuditEvent({
    actor: adminAuditActor(access),
    action:        "athlete.added",
    entity_type:   "athlete",
    entity_id:     athlete?.id ?? undefined,
    campaign_slug: slug,
    summary:       `Added athlete "${name.trim()}" (${class_year.trim()}${eventValue ? `, ${eventValue}` : ""}) to ${slug}`,
    new_value:     { name: name.trim(), event: eventValue, class_year: class_year.trim(), campaign_slug: slug },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });
  return NextResponse.json(athlete);
}
