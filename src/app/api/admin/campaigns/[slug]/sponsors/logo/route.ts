import { NextRequest, NextResponse } from "next/server";
import { requireAdminCampaign } from "@/lib/adminCampaignAuth";
import { MAX_LOGO_BYTES, allowedLogoMime, processLogoImage, uploadLogoToStorage, randomLogoPath } from "@/lib/logoUpload";

export const dynamic = "force-dynamic";

const BUCKET = "sponsor-logos";

// Not scoped to a specific sponsor id — mirrors the team-portal upload route
// (src/app/api/team/[slug]/sponsors/logo/route.ts) so a logo can be picked
// and previewed before the sponsor record itself is created.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  const form = await req.formData();
  const file = form.get("logo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "logo file required" }, { status: 400 });
  }

  const mime = file.type.toLowerCase();
  if (!allowedLogoMime(mime)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Accepted: JPEG, PNG, WebP, SVG.` },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  let processed: { body: Buffer; contentType: string; ext: string };
  try {
    processed = await processLogoImage(buf, mime, 800, 400);
  } catch {
    return NextResponse.json({ error: "Failed to process image" }, { status: 422 });
  }

  const path = randomLogoPath(slug, processed.ext);

  try {
    const url = await uploadLogoToStorage(BUCKET, path, processed.body, processed.contentType);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Storage upload failed" }, { status: 500 });
  }
}
