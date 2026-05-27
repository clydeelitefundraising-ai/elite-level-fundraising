import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET  = "team-files";
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME: Record<string, "pdf" | "image" | "doc"> = {
  "application/pdf":    "pdf",
  "image/png":          "image",
  "image/jpeg":         "image",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
};

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fileName, fileSize, mimeType } = await req.json();
  if (!fileName || !fileSize || !mimeType) {
    return NextResponse.json({ error: "fileName, fileSize, and mimeType are required." }, { status: 400 });
  }
  if (fileSize > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 25 MB limit." }, { status: 400 });
  }
  if (!ALLOWED_MIME[mimeType]) {
    return NextResponse.json({ error: "File type not allowed. Use PDF, PNG, JPG, DOC, or DOCX." }, { status: 400 });
  }

  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const storagePath = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/storage/v1/object/upload/sign/${BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Storage error: ${msg}` }, { status: 500 });
  }

  const body = await res.json();
  const relativeUrl: string = body.signedURL ?? body.url ?? "";
  if (!relativeUrl) {
    return NextResponse.json({ error: "No signed URL returned from storage." }, { status: 500 });
  }

  return NextResponse.json({
    signedUploadUrl: relativeUrl.startsWith("http") ? relativeUrl : `${BASE}${relativeUrl}`,
    storagePath,
    fileType: ALLOWED_MIME[mimeType],
  });
}
