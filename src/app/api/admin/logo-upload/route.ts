import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import sharp from "sharp";

const BASE      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET    = "team-logos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowed MIME types → { file extension, content-type for storage }
const ALLOWED: Record<string, { ext: string; contentType: string }> = {
  "image/jpeg":    { ext: "jpg",  contentType: "image/jpeg"   },
  "image/png":     { ext: "png",  contentType: "image/png"    },
  "image/webp":    { ext: "webp", contentType: "image/webp"   },
  "image/svg+xml": { ext: "svg",  contentType: "image/svg+xml" },
};

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

  const mime = file.type.toLowerCase();
  const fmt  = ALLOWED[mime];
  if (!fmt) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Accepted: JPEG, PNG, WebP, SVG.` },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  let body:        Buffer;
  let contentType: string = fmt.contentType;
  let ext:         string = fmt.ext;

  if (mime === "image/svg+xml") {
    // SVGs are already vector — pass through without rasterising.
    body = buf;
  } else {
    // Raster formats: auto-rotate and cap at 512×512 preserving aspect ratio.
    try {
      const pipeline = sharp(buf).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true });

      if (mime === "image/jpeg") {
        body = await pipeline.jpeg({ quality: 88 }).toBuffer();
      } else if (mime === "image/webp") {
        body = await pipeline.webp({ quality: 88 }).toBuffer();
      } else {
        // PNG (and any unrecognised raster fallback)
        body = await pipeline.png({ compressionLevel: 8 }).toBuffer();
      }
    } catch {
      return NextResponse.json({ error: "Failed to process image." }, { status: 422 });
    }
  }

  const slug = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `logos/${slug}`;

  const uploadRes = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${path}`, {
    method:  "POST",
    headers: storageHeaders(contentType),
    body:    body as unknown as BodyInit,
  });

  if (!uploadRes.ok) {
    const msg = await uploadRes.text();
    return NextResponse.json({ error: `Storage upload failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ url: `${BASE}/storage/v1/object/public/${BUCKET}/${path}` });
}
