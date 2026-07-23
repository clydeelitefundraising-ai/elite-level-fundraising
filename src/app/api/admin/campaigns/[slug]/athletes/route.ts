import { NextRequest, NextResponse } from "next/server";
import { requireAdminCampaign } from "@/lib/adminCampaignAuth";
import { getAthletes, addAthlete } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ slug: string }> };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function restHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// GET — roster for this campaign, each row annotated with whether a real
// account is linked (team_members.athlete_id) — read-only visibility into
// the existing claimed/unclaimed roster concept, no new capability.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  const [athletes, linksRes] = await Promise.all([
    getAthletes(slug),
    fetch(`${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=not.is.null&select=athlete_id`, { headers: restHeaders(), cache: "no-store" }),
  ]);

  const linkedCounts: Record<string, number> = {};
  if (linksRes.ok) {
    const rows: { athlete_id: string }[] = await linksRes.json();
    for (const r of rows) linkedCounts[r.athlete_id] = (linkedCounts[r.athlete_id] ?? 0) + 1;
  }

  const withLinks = athletes.map(a => ({ ...a, linked_accounts: linkedCounts[a.id] ?? 0 }));
  return NextResponse.json(withLinks);
}

// POST — create an athlete. campaign_slug always comes from the URL, never
// the request body (same reasoning as the sponsors route: an admin session
// scoped to one campaign's URL must never be able to write into another).
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.class_year?.trim()) {
    return NextResponse.json({ error: "name and class are required" }, { status: 400 });
  }

  let athlete;
  try {
    athlete = await addAthlete({
      campaign_slug: slug,
      name: body.name.trim(),
      event: body.event?.trim() || null,
      class_year: body.class_year.trim(),
      contact_phone: null,
      contact_email: null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to add athlete." }, { status: 500 });
  }

  logAuditEvent({
    action:        "athlete.added",
    entity_type:   "athlete",
    entity_id:     athlete?.id,
    campaign_slug: slug,
    summary:       `Added athlete "${body.name.trim()}" to ${slug} (via admin console)`,
    new_value:     athlete,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json(athlete, { status: 201 });
}
