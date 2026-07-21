import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isCoachOnly } from "@/lib/permissions.server";

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

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isCoachOnly(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    name, url, tier, description, logo_url, visible, display_order,
    sponsorship_amount_cents, contact_name, contact_email, contact_phone,
  } = await req.json();

  const patch: Record<string, unknown> = {};
  if (name?.trim())                        patch.name                      = name.trim();
  if (url?.trim())                         patch.url                       = url.trim();
  if (tier && VALID_TIERS.includes(tier))  patch.tier                      = tier;
  if (description  !== undefined)          patch.description               = description;
  if (logo_url     !== undefined)          patch.logo_url                  = logo_url;
  if (visible      !== undefined)          patch.visible                   = visible;
  if (display_order !== undefined)         patch.display_order             = display_order;
  if (sponsorship_amount_cents !== undefined) patch.sponsorship_amount_cents = sponsorship_amount_cents;
  if (contact_name  !== undefined)         patch.contact_name              = contact_name;
  if (contact_email !== undefined)         patch.contact_email             = contact_email;
  if (contact_phone !== undefined)         patch.contact_phone             = contact_phone;

  const res = await fetch(
    `${BASE}/rest/v1/sponsors?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to update sponsor" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isCoachOnly(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BASE}/rest/v1/sponsors?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to delete sponsor" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
