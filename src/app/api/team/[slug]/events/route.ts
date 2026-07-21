import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";
import { sendPushToTeam } from "@/lib/push";

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, event_date, event_time, location, type } = await req.json();
  if (!title?.trim() || !event_date) {
    return NextResponse.json({ error: "title and event_date are required" }, { status: 400 });
  }

  const safeType = VALID_TYPES.has(type) ? type : "team";

  const res = await fetch(`${BASE}/rest/v1/calendar_events`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      title:      title.trim(),
      event_date,
      event_time: event_time?.trim() ?? "",
      location:   location?.trim() ?? "",
      type:       safeType,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create event: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  void sendPushToTeam(slug, {
    title: `Event Added: ${title.trim()}`,
    body:  [event_date, location?.trim()].filter(Boolean).join(" · "),
    url:   `/team/${slug}/calendar`,
  });
  return NextResponse.json(rows[0]);
}
