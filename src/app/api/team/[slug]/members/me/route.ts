import { NextRequest, NextResponse } from "next/server";
import { getMemberSession } from "@/lib/memberSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const member = await getMemberSession(slug);
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.athlete_id || typeof body.athlete_id !== "string") {
    return NextResponse.json({ error: "athlete_id required" }, { status: 400 });
  }
  const { athlete_id } = body;

  // Verify athlete belongs to this campaign — prevents cross-team linkage
  const checkRes = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(athlete_id)}&campaign_slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!checkRes.ok) return NextResponse.json({ error: "Failed to verify athlete" }, { status: 500 });
  const rows = await checkRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Athlete not found for this team" }, { status: 404 });
  }

  const updateRes = await fetch(
    `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(member.id)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ athlete_id }),
    },
  );
  if (!updateRes.ok) {
    const msg = await updateRes.text();
    return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
