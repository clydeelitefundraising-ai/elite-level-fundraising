import { NextRequest, NextResponse } from "next/server";
import { resolveJoinCode } from "@/lib/teamData";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code is required." }, { status: 400 });

  // Phase 5: shared with /join/[code] so manual entry and QR links can
  // never disagree about whether a code (including an archived
  // campaign's code) is currently usable.
  const resolved = await resolveJoinCode(code);
  if (resolved.status === "invalid") {
    return NextResponse.json({ error: "Invalid or expired team code." }, { status: 404 });
  }
  if (resolved.status === "archived") {
    return NextResponse.json({ error: "This team is no longer accepting new members." }, { status: 403 });
  }

  const athletesRes = await fetch(
    `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(resolved.campaignSlug)}&select=id,name,event&order=name.asc`,
    { headers: h(), cache: "no-store" },
  );
  const athleteRows = athletesRes.ok ? await athletesRes.json() : [];

  return NextResponse.json({
    ...resolved.settings,
    athletes: Array.isArray(athleteRows) ? athleteRows : [],
  });
}
