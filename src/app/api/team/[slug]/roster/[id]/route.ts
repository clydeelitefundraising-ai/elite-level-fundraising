import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

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
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, event, jersey_number, grad_year, profile_photo, goal_cents } = await req.json();

  const patch: Record<string, unknown> = {};
  if (name?.trim())   patch.name  = name.trim();
  if (event?.trim())  patch.event = event.trim();
  // Allow explicit null to clear optional fields
  if (jersey_number  !== undefined) patch.jersey_number  = jersey_number;
  if (grad_year      !== undefined) patch.grad_year      = grad_year;
  if (profile_photo  !== undefined) patch.profile_photo  = profile_photo;
  if (goal_cents     !== undefined) patch.goal_cents     = goal_cents;

  const res = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to update athlete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (coach.role !== "head_coach") {
    return NextResponse.json({ error: "Only head coaches can delete athletes." }, { status: 403 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to delete athlete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
