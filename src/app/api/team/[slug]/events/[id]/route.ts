import { NextRequest, NextResponse } from "next/server";
import { getCoachSession } from "@/lib/teamSession";
import { isHeadCoachRole } from "@/lib/permissions";

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

const VALID_TYPES = new Set(["practice", "meet", "fundraiser", "team"]);

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, event_date, event_time, location, type } = await req.json();

  const patch: Record<string, unknown> = {};
  if (title?.trim())          patch.title      = title.trim();
  if (event_date)             patch.event_date  = event_date;
  if (event_time !== undefined) patch.event_time = event_time?.trim() ?? "";
  if (location   !== undefined) patch.location   = location?.trim() ?? "";
  if (VALID_TYPES.has(type))  patch.type        = type;

  const res = await fetch(
    `${BASE}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHeadCoachRole(coach.role)) {
    return NextResponse.json({ error: "Only head coaches can delete events." }, { status: 403 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/calendar_events?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
