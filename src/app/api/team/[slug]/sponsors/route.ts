import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff, isCoachOnly } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const VALID_TIERS = ["title", "platinum", "gold", "silver", "bronze", "community_partner"];

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  const staff = isStaff(actor);
  const visibilityFilter = staff ? "" : "&visible=eq.true";
  const res = await fetch(
    `${BASE}/rest/v1/sponsors?campaign_slug=eq.${encodeURIComponent(slug)}${visibilityFilter}&order=display_order.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json([]);
  const rows = await res.json();

  if (staff) {
    // Staff (coaches + boosters) see all fields including internal contact info
    return NextResponse.json(rows);
  }

  // Public and members: strip internal contact fields
  const publicRows = rows.map((s: Record<string, unknown>) => ({
    id:            s.id,
    name:          s.name,
    url:           s.url,
    tier:          s.tier,
    logo_url:      s.logo_url   ?? null,
    description:   s.description ?? null,
    display_order: s.display_order,
    visible:       s.visible,
  }));
  return NextResponse.json(publicRows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isCoachOnly(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    name, url, tier, description, logo_url, visible, display_order,
    sponsorship_amount_cents, contact_name, contact_email, contact_phone,
  } = await req.json();

  if (!name?.trim() || !url?.trim() || !VALID_TIERS.includes(tier)) {
    return NextResponse.json({ error: "name, url, and valid tier are required" }, { status: 400 });
  }

  const body: Record<string, unknown> = {
    campaign_slug:  slug,
    name:           name.trim(),
    url:            url.trim(),
    tier,
    visible:        visible !== false,
    display_order:  display_order ?? 0,
  };
  if (description?.trim())            body.description             = description.trim();
  if (logo_url?.trim())               body.logo_url                = logo_url.trim();
  if (sponsorship_amount_cents != null) body.sponsorship_amount_cents = sponsorship_amount_cents;
  if (contact_name?.trim())           body.contact_name            = contact_name.trim();
  if (contact_email?.trim())          body.contact_email           = contact_email.trim();
  if (contact_phone?.trim())          body.contact_phone           = contact_phone.trim();

  const res = await fetch(`${BASE}/rest/v1/sponsors`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to add sponsor: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json(rows[0]);
}
