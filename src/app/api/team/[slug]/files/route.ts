import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const VALID_TYPES = new Set(["pdf", "image", "doc", "other"]);

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, storagePath, fileType, sizeBytes } = await req.json();
  if (!name?.trim() || !storagePath || !VALID_TYPES.has(fileType)) {
    return NextResponse.json({ error: "Invalid file metadata." }, { status: 400 });
  }

  const res = await fetch(`${BASE}/rest/v1/team_files`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      name:          name.trim(),
      storage_path:  storagePath,
      file_type:     fileType,
      size_bytes:    sizeBytes ?? 0,
      uploaded_by:   actor.session.name,
      coach_id:      actor.kind === "coach" ? actor.session.id : null,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to save file record: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json(rows[0]);
}
