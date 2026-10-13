import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import sharp from "sharp";

// Phase 2.2A — logo upload for ELF Community Partners. Reuses the
// validation/processing approach already proven by
// src/app/api/admin/logo-upload/route.ts (MIME allowlist, sharp
// resize/compress, 5MB cap, random filename) — but gated by the modern
// elf_accounts-backed getPlatformAdminSession(), never the legacy
// shared-password /admin cookie (verifyToken). Decoupled from any
// specific partner id, same shape as the existing team-sponsor logo
// upload (/api/team/[slug]/sponsors/logo): a caller uploads a logo and
// gets back a URL to include in a subsequent create/update POST/PATCH,
// which works whether the partner record exists yet or not (matches the
// "Add Sponsor" modal's own upload-before-save flow).
//
// SECURITY: deliberately does NOT allow image/svg+xml, unlike the legacy
// admin/logo-upload route it's otherwise modeled on. An SVG can embed
// <script>/event-handler content, and this bucket is public — a browser
// navigating directly to a stored SVG's URL would execute that script
// (stored XSS). Every raster format here is re-encoded through sharp
// (never a raw passthrough of client-supplied bytes), which strips any
// such payload by construction; there is no equivalent safe "re-encode"
// step for SVG, so the format is excluded entirely rather than trusting
// the client-supplied Content-Type/extension.
const BASE      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET    = "community-partner-logos";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED: Record<string, { ext: string; contentType: string }> = {
  "image/jpeg": { ext: "jpg",  contentType: "image/jpeg" },
  "image/png":  { ext: "png",  contentType: "image/png"  },
  "image/webp": { ext: "webp", contentType: "image/webp" },
};

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
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("logo");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "logo file required" }, { status: 400 });
  }

  const mime = file.type.toLowerCase();
  const fmt  = ALLOWED[mime];
  if (!fmt) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Accepted: JPEG, PNG, WebP.` },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });
  }

  const contentType: string = fmt.contentType;
  const ext:         string = fmt.ext;

  // Every accepted format is re-encoded through sharp — never a raw
  // passthrough of client-supplied bytes — so the stored object is always
  // genuine, re-rendered image data regardless of what the input claimed
  // to be.
  let body: Buffer;
  try {
    const pipeline = sharp(buf).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true });
    if (mime === "image/jpeg") {
      body = await pipeline.jpeg({ quality: 88 }).toBuffer();
    } else if (mime === "image/webp") {
      body = await pipeline.webp({ quality: 88 }).toBuffer();
    } else {
      body = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    }
  } catch {
    return NextResponse.json({ error: "Failed to process image." }, { status: 422 });
  }

  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

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
