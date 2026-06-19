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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const coach = await getCoachSession(slug);
  if (!coach) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, event, jersey_number, grad_year, profile_photo, goal_cents, contact_phone, contact_email } = await req.json();
  if (!name?.trim() || !event?.trim()) {
    return NextResponse.json({ error: "name and event are required" }, { status: 400 });
  }

  const body: Record<string, unknown> = {
    campaign_slug: slug,
    name: name.trim(),
    event: event.trim(),
  };
  if (jersey_number != null) body.jersey_number = jersey_number;
  if (grad_year != null) body.grad_year = grad_year;
  if (profile_photo?.trim()) body.profile_photo = profile_photo.trim();
  if (goal_cents != null) body.goal_cents = goal_cents;
  if (contact_phone?.trim()) body.contact_phone = contact_phone.trim();
  if (contact_email?.trim()) body.contact_email = contact_email.trim();

  const res = await fetch(`${BASE}/rest/v1/athletes`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to add athlete: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json(rows[0]);
}
