import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const VALID_STATUS = ["paid", "fulfilled", "cancelled"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { status, notes } = await req.json();
  const patch: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = status;
  }
  if (notes !== undefined) patch.notes = notes;

  const res = await fetch(
    `${BASE}/rest/v1/team_orders?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(patch) },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
