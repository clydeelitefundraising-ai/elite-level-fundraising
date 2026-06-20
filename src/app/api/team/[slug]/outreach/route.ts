import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// Returns current outreach state for every athlete in this campaign.
// Sources from athlete_outreach_current (DISTINCT ON view — latest row per athlete).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/athlete_outreach_current?campaign_slug=eq.${encodeURIComponent(slug)}`,
    { headers: h(), cache: "no-store" },
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch outreach" }, { status: 500 });
  }

  return NextResponse.json(await res.json());
}
