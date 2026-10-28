import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { getCampaignSettings, updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import {
  BANNER_BUCKET, MAX_BANNER_BYTES, MAX_BANNER_WIDTH, MIN_BANNER_HEIGHT, MIN_BANNER_WIDTH,
  bannerPathPrefix, isAllowedBannerMimeType, ownedBannerPath,
} from "@/lib/teamOverview";
import sharp from "sharp";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type RouteContext = { params: Promise<{ slug: string }> };

const FORBIDDEN = "Only this team's Head Coach can change the team banner.";

function storageHeaders(contentType?: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(contentType ? { "Content-Type": contentType, "Cache-Control": "max-age=31536000" } : {}),
  };
}

async function authorize(slug: string) {
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor) || (actor.kind !== "coach" && actor.kind !== "platform_admin")) {
    return { error: NextResponse.json({ error: FORBIDDEN }, { status: 403 }) } as const;
  }
  return { actor } as const;
}

/** Best-effort removal of the team's previous banner object. Only ever
 *  touches a path under this team's own banner prefix (ownedBannerPath);
 *  a failure leaves an orphaned file, never a broken page. */
async function deleteOldBanner(slug: string, oldUrl: string | null | undefined) {
  const path = ownedBannerPath(oldUrl, BASE, slug);
  if (!path) return;
  await fetch(`${BASE}/storage/v1/object/${BANNER_BUCKET}/${path}`, { method: "DELETE", headers: storageHeaders() }).catch(() => {});
}

// Phase T6 — Team -> Overview banner image. Head-Coach-only (platform
// admins included via isHeadCoach), completed seasons read-only. Same
// storage pattern as branding/logo/route.ts (service-role REST upload to
// the existing public team-branding-logos bucket), under
// `<slug>/banner/` with an unguessable file name — a new upload never
// overwrites an existing object. Re-encoded to WebP: strips metadata
// (including GPS from phone photos) and keeps the page fast.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const auth = await authorize(slug);
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("banner");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  if (!isAllowedBannerMimeType(file.type)) {
    return NextResponse.json({ error: "Banner must be a JPG, PNG or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_BANNER_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 8 MB)." }, { status: 413 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BANNER_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 8 MB)." }, { status: 413 });
  }

  let processed: Buffer;
  try {
    const img = sharp(buf, { limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    const sideways = (meta.orientation ?? 1) >= 5;
    const width = (sideways ? meta.height : meta.width) ?? 0;
    const height = (sideways ? meta.width : meta.height) ?? 0;
    if (width < MIN_BANNER_WIDTH || height < MIN_BANNER_HEIGHT) {
      return NextResponse.json(
        { error: `Image is too small — use one at least ${MIN_BANNER_WIDTH}×${MIN_BANNER_HEIGHT} pixels (a wide landscape photo works best).` },
        { status: 422 },
      );
    }
    processed = await img
      .rotate()
      .resize(MAX_BANNER_WIDTH, MAX_BANNER_WIDTH, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "That file couldn't be read as an image." }, { status: 422 });
  }

  const before = await getCampaignSettings(slug);
  const path = `${bannerPathPrefix(slug)}${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
  const uploadRes = await fetch(`${BASE}/storage/v1/object/${BANNER_BUCKET}/${path}`, {
    method: "POST",
    headers: storageHeaders("image/webp"),
    body: processed as unknown as BodyInit,
  });
  if (!uploadRes.ok) {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  const team_banner_url = `${BASE}/storage/v1/object/public/${BANNER_BUCKET}/${path}`;
  try {
    await updateCampaignSettings(slug, { team_banner_url });
  } catch {
    await deleteOldBanner(slug, team_banner_url);
    return NextResponse.json({ error: "Banner uploaded but failed to save. Please try again." }, { status: 500 });
  }
  if (before?.team_banner_url && before.team_banner_url !== team_banner_url) {
    await deleteOldBanner(slug, before.team_banner_url);
  }

  logAuditEvent({
    actor: toAuditActor(auth.actor),
    action: "team_overview.banner_updated",
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: `Updated team banner on ${slug}`,
    new_value: { team_banner_url },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, team_banner_url });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const seasonBlocked = await seasonWriteBlocked(slug);
  if (seasonBlocked) return seasonBlocked;
  const auth = await authorize(slug);
  if ("error" in auth) return auth.error;

  const before = await getCampaignSettings(slug);
  try {
    await updateCampaignSettings(slug, { team_banner_url: null });
  } catch {
    return NextResponse.json({ error: "Failed to remove the banner. Please try again." }, { status: 500 });
  }
  await deleteOldBanner(slug, before?.team_banner_url);

  logAuditEvent({
    actor: toAuditActor(auth.actor),
    action: "team_overview.banner_removed",
    entity_type: "campaign_settings",
    entity_id: slug,
    campaign_slug: slug,
    summary: `Removed team banner on ${slug}`,
    new_value: { team_banner_url: null },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, team_banner_url: null });
}
