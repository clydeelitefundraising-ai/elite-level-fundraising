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

const VALID_CATEGORIES = new Set([
  "schedule", "fundraiser", "travel", "meet-info", "team-alert", "team",
]);
const VALID_PRIORITIES = new Set(["normal", "high", "pinned"]);

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, body, category, priority } = await req.json();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title?.trim())                        patch.title    = title.trim();
  if (body !== undefined)                   patch.body     = body?.trim() ?? "";
  if (VALID_CATEGORIES.has(category))       patch.category = category;
  if (VALID_PRIORITIES.has(priority))       patch.priority = priority;

  const res = await fetch(
    `${BASE}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to update announcement" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (coach.role !== "head_coach") {
    return NextResponse.json({ error: "Only head coaches can delete announcements." }, { status: 403 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/announcements?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
