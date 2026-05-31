import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type Ctx = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, category, price_cents, cost_cents, image_url, visible, display_order, external_url } = await req.json();
  const patch: Record<string, unknown> = {};
  if (name?.trim())               patch.name          = name.trim();
  if (category?.trim())           patch.category      = category.trim();
  if (price_cents !== undefined)  patch.price_cents   = price_cents;
  if (cost_cents  !== undefined)  patch.cost_cents    = cost_cents;
  if (description !== undefined)  patch.description   = description;
  if (image_url   !== undefined)  patch.image_url     = image_url;
  if (visible     !== undefined)  patch.visible       = visible;
  if (display_order !== undefined) patch.display_order = display_order;
  if (external_url !== undefined) patch.external_url  = external_url;

  const res = await fetch(
    `${BASE}/rest/v1/team_products?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(patch) },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BASE}/rest/v1/team_products?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
