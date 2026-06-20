import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

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

const VALID_STATUSES = ["contacted", "needs_follow_up", "resolved"] as const;
type ValidStatus = typeof VALID_STATUSES[number];

type RouteContext = { params: Promise<{ slug: string; athleteId: string }> };

// Insert a new outreach action row (append-only — no updates, no overwrites).
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug, athleteId } = await params;
  const actor = await getTeamActor(slug);
  // Separate public check so TypeScript narrows actor to coach | member before .session access
  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const { status, note } = body as { status: ValidStatus; note?: string };
  if (!status || !(VALID_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  // contacted_by is always the authenticated actor's display name.
  // coach_id is only set for coach actors (booster-members have no team_coaches row).
  const contactedBy = actor.session.name;
  const coachId     = actor.kind === "coach" ? actor.session.id : null;

  const row: Record<string, unknown> = {
    athlete_id:   athleteId,
    campaign_slug: slug,
    status,
    contacted_by: contactedBy,
  };
  if (coachId)       row.coach_id = coachId;
  if (note?.trim())  row.note     = note.trim();

  const res = await fetch(`${BASE}/rest/v1/athlete_outreach`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to save outreach: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json(rows[0]);
}

// Full outreach history for one athlete in this campaign (newest first).
// Staff-only — coach notes are never surfaced to athletes or parents.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug, athleteId } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/athlete_outreach?athlete_id=eq.${encodeURIComponent(athleteId)}&campaign_slug=eq.${encodeURIComponent(slug)}&order=created_at.desc`,
    { headers: h(), cache: "no-store" },
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch outreach history" }, { status: 500 });
  }

  return NextResponse.json(await res.json());
}
