import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BASE}/rest/v1/team_orders?campaign_slug=eq.${encodeURIComponent(slug)}&status=neq.pending&select=*,items:team_order_items(id,product_name,variant_name,price_cents,quantity)&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json([]);
  return NextResponse.json(await res.json());
}
