import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET = "team-files";

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type RouteContext = { params: Promise<{ slug: string; id: string }> };

// ── Download — no auth required; viewers can download.
// Proxied through the server so the team-files bucket stays private and
// no Supabase signed-URL token round-trip is needed (avoids JWT path
// mismatch errors that occur with some Supabase storage versions).
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;

  // 1. Look up the file record — scoped to slug for isolation
  const rowRes = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=storage_path,name&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!rowRes.ok) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const rows: { storage_path: string; name: string }[] = await rowRes.json();
  if (!rows.length) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const { storage_path, name } = rows[0];

  // 2. Fetch the file from private storage using the service role key
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const fileRes = await fetch(
    `${BASE}/storage/v1/object/${BUCKET}/${storage_path}`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    },
  );

  if (!fileRes.ok) {
    return NextResponse.json({ error: "File not available." }, { status: fileRes.status });
  }

  // 3. Stream the file to the browser with download headers
  const contentType = fileRes.headers.get("Content-Type") ?? "application/octet-stream";
  const safeFilename = encodeURIComponent(name).replace(/%20/g, "+");

  return new NextResponse(fileRes.body, {
    headers: {
      "Content-Type":        contentType,
      "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`,
      "Cache-Control":       "private, max-age=1800",
    },
  });
}

// ── Rename — any coach
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const res = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ name: name.trim() }) },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to rename file." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── Delete — head coach only
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (coach.role !== "head_coach") {
    return NextResponse.json({ error: "Only head coaches can delete files." }, { status: 403 });
  }

  // Fetch storage path
  const rowRes = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=storage_path`,
    { headers: h() },
  );
  if (!rowRes.ok) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const rows: { storage_path: string }[] = await rowRes.json();
  if (!rows.length) return NextResponse.json({ error: "File not found." }, { status: 404 });

  // Delete from storage (best-effort)
  await fetch(`${BASE}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: h(),
    body: JSON.stringify({ prefixes: [rows[0].storage_path] }),
  });

  // Delete DB row
  const dbRes = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!dbRes.ok) return NextResponse.json({ error: "Failed to delete file record." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
