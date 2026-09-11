import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isHeadCoach } from "@/lib/permissions.server";
import { getCoachFundraisers, upsertCoachParticipant } from "@/lib/platform/coachFundraising";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";

type RouteContext = { params: Promise<{ slug: string }> };

// Team-App-side, Head-Coach-only counterpart to the Platform Admin's
// existing /api/admin/coach-fundraisers route — both call into the SAME
// shared lib (src/lib/platform/coachFundraising.ts), never a second copy
// of the eligibility/participation logic. getCoachFundraisers()/
// upsertCoachParticipant() are already campaign_slug-scoped internally
// (every query filters by the slug from this route's own URL param, never
// a client-supplied campaign), so a Head Coach of one campaign cannot
// read or act on another campaign's participants by guessing an id — the
// route param IS the campaign scope.
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can view coach fundraising participants." }, { status: 403 });
  }

  const rows = await getCoachFundraisers(slug);
  return NextResponse.json(rows);
}

// POST body: { coach_id, active, goal_cents? }
// Select/deselect a coach as a fundraising participant + set their goal.
// Boosters are rejected by upsertCoachParticipant() itself (eligibility
// check against team_coaches.role) — never activatable regardless of
// caller, same defense-in-depth already relied on by the admin route.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only this team's Head Coach can manage coach fundraising participants." }, { status: 403 });
  }
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Only this team's Head Coach can manage coach fundraising participants." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { coach_id, active, goal_cents } = body as {
    coach_id: string; active: boolean; goal_cents?: number | null;
  };
  if (!coach_id) {
    return NextResponse.json({ error: "coach_id is required." }, { status: 400 });
  }

  const result = await upsertCoachParticipant(slug, coach_id, {
    active: active === true,
    goal_cents: typeof goal_cents === "number" ? goal_cents : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "This coach is not eligible to be a fundraising participant (boosters are excluded)." }, { status: 400 });
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action:        active ? "coach_fundraiser.activated" : "coach_fundraiser.deactivated",
    entity_type:   "coach_fundraiser",
    entity_id:     coach_id,
    campaign_slug: slug,
    summary:       `${active ? "Activated" : "Deactivated"} coach fundraising participation for coach ${coach_id} on ${slug} (via Head Coach settings)`,
    new_value:     { coach_id, active, goal_cents: goal_cents ?? null },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json(result.row);
}
