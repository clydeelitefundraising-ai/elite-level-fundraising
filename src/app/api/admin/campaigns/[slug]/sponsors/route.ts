import { NextRequest, NextResponse } from "next/server";
import { requireAdminCampaign } from "@/lib/adminCampaignAuth";
import { addSponsor, type SponsorRow } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const VALID_TIERS = ["title", "platinum", "gold", "silver", "bronze", "community_partner"];

function restHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type RouteCtx = { params: Promise<{ slug: string }> };

// GET — full sponsor list for this campaign (unlike the public-facing
// getSponsors(), this intentionally includes hidden sponsors + internal
// contact/amount fields — this is the management view).
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  const res = await fetch(
    `${BASE}/rest/v1/sponsors?campaign_slug=eq.${encodeURIComponent(slug)}&order=display_order.asc,created_at.asc`,
    { headers: restHeaders(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to load sponsors." }, { status: 500 });
  const sponsors: SponsorRow[] = await res.json();
  return NextResponse.json(sponsors);
}

// POST — create a sponsor. campaign_slug always comes from the URL, never
// the request body, so an admin session can't be tricked into writing a
// sponsor under a different campaign than the one it's authorized against.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.url?.trim() || !VALID_TIERS.includes(body?.tier)) {
    return NextResponse.json({ error: "name, url, and a valid tier are required" }, { status: 400 });
  }

  const sponsor = await addSponsor({
    campaign_slug: slug,
    name: body.name.trim(),
    url: body.url.trim(),
    tier: body.tier,
    logo_url: body.logo_url?.trim() || null,
    description: body.description?.trim() || null,
    visible: typeof body.visible === "boolean" ? body.visible : true,
    display_order: typeof body.display_order === "number" ? body.display_order : 0,
    sponsorship_amount_cents: typeof body.sponsorship_amount_cents === "number" ? body.sponsorship_amount_cents : null,
    contact_name: body.contact_name?.trim() || null,
    contact_email: body.contact_email?.trim() || null,
    contact_phone: body.contact_phone?.trim() || null,
  });

  logAuditEvent({
    action:        "sponsor.added",
    entity_type:   "sponsor",
    entity_id:     sponsor?.id,
    campaign_slug: slug,
    summary:       `Added ${body.tier} sponsor "${body.name.trim()}" to ${slug} (via admin console)`,
    new_value:     sponsor,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json(sponsor, { status: 201 });
}
