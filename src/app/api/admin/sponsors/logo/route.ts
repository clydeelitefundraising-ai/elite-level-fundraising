import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { MAX_LOGO_BYTES, allowedLogoMime, processLogoImage, uploadLogoToStorage, randomLogoPath } from "@/lib/logoUpload";

const BUCKET = "sponsor-logos";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("logo");
  const slug = form.get("slug");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "logo file required" }, { status: 400 });
  }
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
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
