import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

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

// PATCH — revoke a join code by id (coach-only)
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the code belongs to this campaign before revoking
  const res = await fetch(
    `${BASE}/rest/v1/team_join_codes?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ revoked: true }),
    },
  );

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to revoke code: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
