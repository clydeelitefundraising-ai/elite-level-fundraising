import sharp from "sharp";

// Shared logo-image processing/storage helpers — used by every "upload a
// logo" route (team sponsor logos, admin sponsor logos, school logos) so
// they share one validation/resize/format policy instead of drifting.

export const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED: Record<string, { ext: string; contentType: string }> = {
  "image/jpeg":    { ext: "jpg",  contentType: "image/jpeg" },
  "image/png":     { ext: "png",  contentType: "image/png" },
  "image/webp":    { ext: "webp", contentType: "image/webp" },
  "image/svg+xml": { ext: "svg",  contentType: "image/svg+xml" },
};

export function allowedLogoMime(mime: string) {
  return ALLOWED[mime.toLowerCase()];
}

// Resizes to fit within maxW×maxH, re-encoding to the *same* format the
// file came in as (so PNG transparency survives — never forced to JPEG).
export async function processLogoImage(
  buf: Buffer,
  mime: string,
  maxW: number,
  maxH: number,
): Promise<{ body: Buffer; contentType: string; ext: string }> {
  const fmt = allowedLogoMime(mime);
  if (!fmt) throw new Error(`Unsupported file type: ${mime}. Accepted: JPEG, PNG, WebP, SVG.`);

  if (mime.toLowerCase() === "image/svg+xml") {
    return { body: buf, contentType: fmt.contentType, ext: fmt.ext };
  }

  const pipeline = sharp(buf).rotate().resize(maxW, maxH, { fit: "inside", withoutEnlargement: true });
  let body: Buffer;
  if (mime.toLowerCase() === "image/jpeg") {
    body = await pipeline.jpeg({ quality: 88 }).toBuffer();
  } else if (mime.toLowerCase() === "image/webp") {
    body = await pipeline.webp({ quality: 88 }).toBuffer();
  } else {
    body = await pipeline.png({ compressionLevel: 8 }).toBuffer();
  }
  return { body, contentType: fmt.contentType, ext: fmt.ext };
}

function storageHeaders(contentType: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": contentType,
    "Cache-Control": "max-age=3600",
  };
}

export async function uploadLogoToStorage(
  bucket: string,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: storageHeaders(contentType),
    body: body as unknown as BodyInit,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Storage upload failed: ${msg}`);
  }
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export function randomLogoPath(prefix: string, ext: string): string {
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}
