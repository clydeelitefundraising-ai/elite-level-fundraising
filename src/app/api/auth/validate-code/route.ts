import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Code is required." }, { status: 400 });

  const codeRes = await fetch(
    `${BASE}/rest/v1/team_join_codes?code=eq.${encodeURIComponent(code)}&revoked=eq.false&select=id,campaign_slug,expires_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!codeRes.ok) return NextResponse.json({ error: "Validation failed." }, { status: 500 });

  const codeRows = await codeRes.json();
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    return NextResponse.json({ error: "Invalid or expired team code." }, { status: 404 });
  }

  const joinCode = codeRows[0];
  if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
    return NextResponse.json({ error: "This team code has expired." }, { status: 410 });
  }

  const slug = joinCode.campaign_slug as string;

  const [settingsRes, athletesRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=campaign_slug,school_name,mascot,sport_name,primary_color&limit=1`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,event&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const [settingsRows, athleteRows] = await Promise.all([
    settingsRes.ok ? settingsRes.json() : [],
    athletesRes.ok ? athletesRes.json() : [],
  ]);

  const settings = Array.isArray(settingsRows) && settingsRows.length > 0 ? settingsRows[0] : null;
  if (!settings) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  return NextResponse.json({
    campaign_slug: slug,
    school_name:   settings.school_name,
    mascot:        settings.mascot,
    sport_name:    settings.sport_name,
    primary_color: settings.primary_color,
    athletes:      Array.isArray(athleteRows) ? athleteRows : [],
  });
}
