import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import sharp from "sharp";

const BASE      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET    = "athlete-photos";
const MAX_BYTES = 5 * 1024 * 1024;

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

function storageHeaders(contentType: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": contentType,
    "Cache-Control": "max-age=86400",
  };
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("logo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "logo file required" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  let processed: Buffer;
  try {
    processed = await sharp(buf)
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Failed to process image" }, { status: 422 });
  }

  const path = `logos/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;

  const uploadRes = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: storageHeaders("image/png"),
    body: processed as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ url: `${BASE}/storage/v1/object/public/${BUCKET}/${path}` });
}
