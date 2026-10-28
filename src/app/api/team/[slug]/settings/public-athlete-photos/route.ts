import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { getCampaignSettings, updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { getPublicPhotoRoster, inheritedPhotoExclusions } from "@/lib/athletePublicPhoto.server";
import {
  PUBLIC_PHOTO_CONFIRMATION_TEXT, PUBLIC_PHOTO_CONFIRMATION_VERSION, settingChangedBy,
} from "@/lib/publicAthletePhotos";

type RouteContext = { params: Promise<{ slug: string }> };

const FORBIDDEN = "Only this team's Head Coach can change public athlete photo settings.";
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const NOT_TURNED_ON = () => NextResponse.json(
  { error: "Couldn't check which athletes were hidden last season, so photos were not turned on. Please try again." },
  { status: 500 },
);

function serviceHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

// Phase T7 — Public Athlete Photos (Team Settings). Head-Coach-only, platform
// admins included via isHeadCoach (same pattern as settings/coach-fundraising).
// Off by default for every team (DB default). Turning it ON requires the Head
// Coach's media-permission confirmation (confirm: true + the current wording
// version); turning it OFF never does. Every change records who/when on the
// row and in audit_logs. The public photo route enforces the setting itself
// (lib/athletePublicPhoto.server.ts) — this route only changes it.
async function authorize(slug: string) {
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) {
    return { error: NextResponse.json({ error: FORBIDDEN }, { status: 403 }) } as const;
  }
  return { actor } as const;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const auth = await authorize(slug);
  if ("error" in auth) return auth.error;

  const [settings, athletes] = await Promise.all([getCampaignSettings(slug), getPublicPhotoRoster(slug)]);
  if (!settings) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (!athletes) return NextResponse.json({ error: "Failed to load the roster." }, { status: 500 });

  return NextResponse.json({
    enabled: settings.public_athlete_photos === true,
    // false until the Phase T7 migration has been applied — the UI then
    // explains the setting isn't available yet instead of failing to save.
    available: typeof settings.public_athlete_photos === "boolean",
    changed_at: settings.public_athlete_photos_changed_at ?? null,
    changed_by: settings.public_athlete_photos_changed_by ?? null,
    confirmation_version: PUBLIC_PHOTO_CONFIRMATION_VERSION,
    athletes,
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const auth = await authorize(slug);
  if ("error" in auth) return auth.error;
  const { actor } = auth;

  const body = await req.json().catch(() => null) as { enabled?: unknown; confirm?: unknown; confirmation_version?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required." }, { status: 400 });
  }
  const enabled = body.enabled;
  if (enabled && (body.confirm !== true || body.confirmation_version !== PUBLIC_PHOTO_CONFIRMATION_VERSION)) {
    return NextResponse.json(
      { error: "Please confirm your program has the media permissions needed to publish athlete photos." },
      { status: 400 },
    );
  }

  const current = await getCampaignSettings(slug);
  if (!current) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  // Already off: nothing to change (and recording a change here would mark
  // the season as configured, skipping the carry-over below).
  if (!enabled && current.public_athlete_photos !== true) {
    return NextResponse.json({
      ok: true, enabled: false,
      changed_at: current.public_athlete_photos_changed_at ?? null,
      changed_by: current.public_athlete_photos_changed_by ?? null,
    });
  }

  // First time this season: re-hide athletes hidden in an earlier season
  // BEFORE turning photos on. Only ever hides (never un-hides); any read or
  // write failure leaves the setting OFF — no window where a previously
  // hidden athlete's photo is public. Later enables keep the Head Coach's
  // own choices (the carry-over runs once per season).
  let carriedOver: string[] = [];
  if (enabled && !current.public_athlete_photos_changed_at) {
    const inherited = await inheritedPhotoExclusions(slug);
    if (!inherited) return NOT_TURNED_ON();
    const roster = await fetch(
      `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,public_photo_excluded`,
      { headers: serviceHeaders(), cache: "no-store" },
    ).then(r => (r.ok ? r.json() : null)).catch(() => null) as { id: string; public_photo_excluded: boolean | null }[] | null;
    if (!Array.isArray(roster)) return NOT_TURNED_ON();
    carriedOver = roster.filter(a => inherited.has(a.id) && a.public_photo_excluded !== true).map(a => a.id);
    if (carriedOver.length > 0) {
      const res = await fetch(
        `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&id=in.(${carriedOver.join(",")})`,
        { method: "PATCH", headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ public_photo_excluded: true }) },
      ).catch(() => null);
      if (!res?.ok) return NOT_TURNED_ON();
      logAuditEvent({
        actor: toAuditActor(actor),
        action: "team_settings.public_athlete_photos_exclusions_carried_over",
        entity_type: "campaign_settings",
        entity_id: slug,
        campaign_slug: slug,
        summary: `Kept ${carriedOver.length} athlete photo(s) hidden from an earlier season on ${slug}`,
        new_value: { public_photo_excluded: true, athlete_ids: carriedOver },
        ip_address: ipOf(req),
        user_agent: req.headers.get("user-agent"),
      });
    }
  }

  const changed_at = new Date().toISOString();
  const changed_by = settingChangedBy(actor.session.name, actor.kind);
  try {
    await updateCampaignSettings(slug, {
      public_athlete_photos: enabled,
      public_athlete_photos_changed_at: changed_at,
      public_athlete_photos_changed_by: changed_by,
    });
  } catch {
    return NextResponse.json({ error: "Failed to save the public athlete photo setting." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: enabled ? "team_settings.public_athlete_photos_enabled" : "team_settings.public_athlete_photos_disabled",
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: `${enabled ? "Enabled" : "Disabled"} public athlete photos on ${slug}`,
    new_value: enabled
      ? { public_athlete_photos: true, confirmation_version: PUBLIC_PHOTO_CONFIRMATION_VERSION, confirmation_text: PUBLIC_PHOTO_CONFIRMATION_TEXT }
      : { public_athlete_photos: false },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, enabled, changed_at, changed_by, carried_over: carriedOver });
}
