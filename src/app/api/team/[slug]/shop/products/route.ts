import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  const visFilter = coach ? "" : "&visible=eq.true";
  const res = await fetch(
    `${BASE}/rest/v1/team_products?campaign_slug=eq.${encodeURIComponent(slug)}${visFilter}&select=*,variants:team_product_variants(id,name,price_delta)&order=display_order.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json([]);
  return NextResponse.json(await res.json());
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, category, price_cents, cost_cents, image_url, visible, display_order } = await req.json();
  if (!name?.trim() || !price_cents || price_cents < 0) {
    return NextResponse.json({ error: "name and price_cents are required" }, { status: 400 });
  }

  const body: Record<string, unknown> = {
    campaign_slug: slug,
    name:          name.trim(),
    category:      category?.trim() || "general",
    price_cents:   price_cents,
    visible:       visible !== false,
    display_order: display_order ?? 0,
  };
  if (description?.trim()) body.description  = description.trim();
  if (image_url?.trim())   body.image_url    = image_url.trim();
  if (cost_cents != null)  body.cost_cents   = cost_cents;

  const res = await fetch(`${BASE}/rest/v1/team_products`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create product: ${msg}` }, { status: 500 });
  }
  const rows = await res.json();
  return NextResponse.json({ ...rows[0], variants: [] });
}
