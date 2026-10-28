import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { getCampaignSettings, updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { getPublicPhotoRoster } from "@/lib/athletePublicPhoto.server";
import {
  PUBLIC_PHOTO_CONFIRMATION_TEXT, PUBLIC_PHOTO_CONFIRMATION_VERSION, settingChangedBy,
} from "@/lib/publicAthletePhotos";

type RouteContext = { params: Promise<{ slug: string }> };

const FORBIDDEN = "Only this team's Head Coach can change public athlete photo settings.";

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

  return NextResponse.json({ ok: true, enabled, changed_at, changed_by });
}
