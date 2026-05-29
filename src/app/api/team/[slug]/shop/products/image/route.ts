import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";
import sharp from "sharp";

const BASE   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET = "shop-images";
const MAX_BYTES = 10 * 1024 * 1024;

function storageHeaders(contentType: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType, "Cache-Control": "max-age=3600" };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("image");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "image file required" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  let processed: Buffer;
  try {
    processed = await sharp(buf)
      .rotate()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to process image" }, { status: 422 });
  }

  const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const uploadRes = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: storageHeaders("image/jpeg"),
    body: processed as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return NextResponse.json({ error: `Storage upload failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ url: `${BASE}/storage/v1/object/public/${BUCKET}/${path}` });
}
