import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// Build a PostgREST ilike pattern from user input.
// Strips characters that could act as PostgREST wildcards (* and %).
function pat(q: string): string {
  const safe = q.trim().replace(/[*%\\]/g, "");
  return `*${encodeURIComponent(safe)}*`;
}

type Campaign = { campaign_slug: string; school_name: string; sport_name: string; primary_color: string };
type Athlete  = { id: string; name: string; event: string; campaign_slug: string };
type Coach    = { id: string; name: string; role: string; campaign_slug: string };
type Sponsor  = { id: string; name: string; tier: string; campaign_slug: string };

export async function GET(req: NextRequest) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ campaigns: [], athletes: [], coaches: [], sponsors: [] });
  }

  const p = pat(q);

  // Run all entity searches in parallel
  const [campaignRes, athleteRes, coachRes, sponsorRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/campaign_settings?or=(school_name.ilike.${p},sport_name.ilike.${p},mascot.ilike.${p})&select=campaign_slug,school_name,sport_name,primary_color&order=school_name.asc&limit=6`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/athletes?name=ilike.${p}&select=id,name,event,campaign_slug&order=name.asc&limit=6`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_coaches?or=(name.ilike.${p},email.ilike.${p})&select=id,name,role,campaign_slug&order=name.asc&limit=5`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/sponsors?name=ilike.${p}&select=id,name,tier,campaign_slug&order=name.asc&limit=5`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const campaigns: Campaign[] = campaignRes.ok ? await campaignRes.json() : [];
  const athletes:  Athlete[]  = athleteRes.ok  ? await athleteRes.json()  : [];
  const coaches:   Coach[]    = coachRes.ok    ? await coachRes.json()    : [];
  const sponsors:  Sponsor[]  = sponsorRes.ok  ? await sponsorRes.json()  : [];

  // Enrich athletes/coaches/sponsors with school names (one batch lookup)
  const slugSet = new Set<string>([
    ...athletes.map(a => a.campaign_slug),
    ...coaches.map(c => c.campaign_slug),
    ...sponsors.map(s => s.campaign_slug),
  ]);

  let schoolMap: Record<string, string> = {};
  if (slugSet.size > 0) {
    const inList = Array.from(slugSet).map(encodeURIComponent).join(",");
    const settingsRes = await fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=in.(${inList})&select=campaign_slug,school_name`,
      { headers: h(), cache: "no-store" },
    );
    if (settingsRes.ok) {
      const rows: { campaign_slug: string; school_name: string }[] = await settingsRes.json();
      schoolMap = Object.fromEntries(rows.map(r => [r.campaign_slug, r.school_name]));
    }
  }

  return NextResponse.json({
    campaigns,
    athletes:  athletes.map(a => ({ ...a, school_name: schoolMap[a.campaign_slug] ?? a.campaign_slug })),
    coaches:   coaches.map(c => ({ ...c, school_name: schoolMap[c.campaign_slug] ?? c.campaign_slug })),
    sponsors:  sponsors.map(s => ({ ...s, school_name: schoolMap[s.campaign_slug] ?? s.campaign_slug })),
  });
}
