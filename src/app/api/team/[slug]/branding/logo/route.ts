import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { MAX_LOGO_BYTES, MAX_LOGO_DIMENSION, isAllowedLogoMimeType, buildLogoUpdatePayload } from "@/lib/theme/logoValidation";
import sharp from "sharp";

const BASE   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET = "team-branding-logos";

function storageHeaders(contentType: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": contentType,
    "Cache-Control": "max-age=3600",
  };
}

type RouteContext = { params: Promise<{ slug: string }> };

// Head-Coach-only, same storage pattern as sponsors/logo/route.ts (service-
// role REST upload to a Supabase Storage bucket, public URL returned) — but
// this route deliberately does NOT re-encode to JPEG the way that route
// does. A team/school logo commonly has a transparent background, so this
// normalizes to PNG (preserving alpha) instead.
//
// Independence from color branding is load-bearing, not incidental: this
// route only ever writes logo_url. It must never touch branding_customized
// — a coach uploading just a logo must not accidentally "activate" whatever
// historical placeholder colors happen to be sitting in primary_color/
// secondary_color for a team that never opted into custom colors.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can change the team logo." }, { status: 403 });
  }
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Only this team's Head Coach can change the team logo." }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("logo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "logo file required" }, { status: 400 });
  }

  if (!isAllowedLogoMimeType(file.type)) {
    return NextResponse.json({ error: "Logo must be a PNG, JPG, or WEBP image." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  let processed: Buffer;
  try {
    processed = await sharp(buf)
      .rotate()
      .resize(MAX_LOGO_DIMENSION, MAX_LOGO_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to process image" }, { status: 422 });
  }

  const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

  const uploadRes = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: storageHeaders("image/png"),
    body: processed as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return NextResponse.json({ error: `Storage upload failed: ${msg}` }, { status: 500 });
  }

  const logo_url = `${BASE}/storage/v1/object/public/${BUCKET}/${path}`;

  const payload = buildLogoUpdatePayload(logo_url);
  try {
    await updateCampaignSettings(slug, payload);
  } catch {
    return NextResponse.json({ error: "Logo uploaded but failed to save. Please try again." }, { status: 500 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "team_settings.branding_logo_updated",
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: `Updated team logo on ${slug}`,
    new_value: { logo_url },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, logo_url });
}
