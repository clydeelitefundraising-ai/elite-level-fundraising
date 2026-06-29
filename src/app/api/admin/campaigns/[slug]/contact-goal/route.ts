import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

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

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

type RouteCtx = { params: Promise<{ slug: string }> };

// GET — return current team-default contact goal (athlete_id = null row)
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;

  const res = await fetch(
    `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=is.null&select=goal&limit=1`,
    { headers: h(), cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ goal: 10 });
  const rows: { goal: number }[] = await res.json();
  return NextResponse.json({ goal: rows[0]?.goal ?? 10 });
}

// PATCH — upsert team-default contact goal
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;

  const body = await req.json().catch(() => null);
  const goal = typeof body?.goal === "number" ? body.goal : parseInt(body?.goal, 10);
  if (!Number.isInteger(goal) || goal < 1 || goal > 999) {
    return NextResponse.json({ error: "Goal must be a positive integer between 1 and 999." }, { status: 400 });
  }

  // Try PATCH first (update existing row)
  const updateRes = await fetch(
    `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=is.null`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ goal, updated_at: new Date().toISOString() }),
    },
  );

  if (updateRes.ok) {
    const rows = await updateRes.json();
    if (Array.isArray(rows) && rows.length > 0) {
      return NextResponse.json({ ok: true, goal: rows[0].goal });
    }
  }

  // No row yet — insert
  const insertRes = await fetch(`${BASE}/rest/v1/fundraising_contact_goals`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({ campaign_slug: slug, athlete_id: null, goal }),
  });

  if (!insertRes.ok) {
    const msg = await insertRes.text();
    return NextResponse.json({ error: `Failed to save contact goal: ${msg}` }, { status: 500 });
  }
  const [created] = await insertRes.json();
  return NextResponse.json({ ok: true, goal: created.goal }, { status: 201 });
}
