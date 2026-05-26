import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const BUCKET = "team-files";

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type RouteContext = { params: Promise<{ slug: string; id: string }> };

// ── Download — no auth required; viewers can download
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;

  const rowRes = await fetch(
    `${BASE}/rest/v1/team_files?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=storage_path,name`,
    { headers: h() },
  );
  if (!rowRes.ok) return NextResponse.json({ error: "File not found." }, { status: 404 });
  const rows: { storage_path: string; name: string }[] = await rowRes.json();
  if (!rows.length) return NextResponse.json({ error: "File not found." }, { status: 404 });

  const { storage_path, name } = rows[0];

  const signRes = await fetch(
    `${BASE}/storage/v1/object/sign/${BUCKET}/${storage_path}`,
    {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ expiresIn: 1800 }),
    },
  );
  if (!signRes.ok) return NextResponse.json({ error: "Failed to generate download link." }, { status: 500 });

  const body = await signRes.json();
  const relativeUrl: string = body.signedURL ?? body.url ?? "";
  if (!relativeUrl) return NextResponse.json({ error: "Failed to generate download link." }, { status: 500 });

  const base = relativeUrl.startsWith("http") ? "" : BASE;
  const sep  = relativeUrl.includes("?") ? "&" : "?";
  const downloadUrl = `${base}${relativeUrl}${sep}download=${encodeURIComponent(name)}`;

  return NextResponse.redirect(downloadUrl);
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
