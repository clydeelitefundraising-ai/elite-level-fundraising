import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

type Ctx = { params: Promise<{ slug: string; productId: string }> };

// POST — add a variant to a product
export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug, productId } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify product belongs to this slug
  const checkRes = await fetch(
    `${BASE}/rest/v1/team_products?id=eq.${encodeURIComponent(productId)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows = checkRes.ok ? await checkRes.json() : [];
  if (!rows.length) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const { name, price_delta } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const res = await fetch(`${BASE}/rest/v1/team_product_variants`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({ product_id: productId, name: name.trim(), price_delta: price_delta ?? 0 }),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed to add variant" }, { status: 500 });
  const created = await res.json();
  return NextResponse.json(created[0]);
}

// DELETE — remove a variant (by variant id in query param)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { slug, productId } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const variantId = req.nextUrl.searchParams.get("variantId");
  if (!variantId) return NextResponse.json({ error: "variantId required" }, { status: 400 });

  const res = await fetch(
    `${BASE}/rest/v1/team_product_variants?id=eq.${encodeURIComponent(variantId)}&product_id=eq.${encodeURIComponent(productId)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to delete variant" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
