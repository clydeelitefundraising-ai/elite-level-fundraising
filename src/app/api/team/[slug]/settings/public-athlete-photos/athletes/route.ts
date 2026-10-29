import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { isAthleteId } from "@/lib/athleteSpotlight";

type RouteContext = { params: Promise<{ slug: string }> };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FORBIDDEN = "Only this team's Head Coach can change public athlete photo settings.";

function headers(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

// Phase T7 — hide (or show again) ONE athlete's photo on the team's public
// fundraising pages while Public Athlete Photos is on: the per-athlete
// exception for an athlete without publication permission. Head-Coach-only
// (platform admins included), completed seasons read-only, audit-logged.
// Only ever writes athletes.public_photo_excluded of an athlete on THIS team.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) {
    return NextResponse.json({ error: FORBIDDEN }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { athlete_id?: unknown; excluded?: unknown } | null;
  if (!body || typeof body.athlete_id !== "string" || !isAthleteId(body.athlete_id) || typeof body.excluded !== "boolean") {
    return NextResponse.json({ error: "athlete_id and excluded (boolean) are required." }, { status: 400 });
  }
  const { athlete_id, excluded } = body as { athlete_id: string; excluded: boolean };

  const scope = `id=eq.${encodeURIComponent(athlete_id)}&campaign_slug=eq.${encodeURIComponent(slug)}`;
  const found = await fetch(`${BASE}/rest/v1/athletes?${scope}&select=id,name&limit=1`, { headers: headers(), cache: "no-store" })
    .then(r => (r.ok ? r.json() : null)).catch(() => null) as { id: string; name: string }[] | null;
  if (!found) return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });
  if (found.length === 0) return NextResponse.json({ error: "Athlete not found on this team." }, { status: 404 });

  const res = await fetch(`${BASE}/rest/v1/athletes?${scope}`, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ public_photo_excluded: excluded }),
  }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Failed to save. Please try again." }, { status: 500 });

  logAuditEvent({
    actor: toAuditActor(actor),
    action: excluded ? "team_settings.public_athlete_photo_hidden" : "team_settings.public_athlete_photo_shown",
    entity_type: "athlete",
    entity_id: athlete_id,
    campaign_slug: slug,
    summary: `${excluded ? "Hid" : "Showed"} ${found[0].name}'s photo on public fundraising pages (${slug})`,
    new_value: { public_photo_excluded: excluded },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, athlete_id, excluded });
}
