import { seasonWriteBlocked } from "@/lib/seasonWritable";
import { NextRequest, NextResponse } from "next/server";
import { getCoachFundraisers, upsertCoachParticipant } from "@/lib/platform/coachFundraising";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

// GET /api/admin/coach-fundraisers?slug=<slug>
// Lists every existing participation row for this campaign (joined with
// team_coaches name/role) — the admin UI merges this against the full
// coach roster (already fetched separately) to render checked/unchecked
// state per coach.
export async function GET(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json([]);
  const rows = await getCoachFundraisers(slug);
  return NextResponse.json(rows);
}

// POST /api/admin/coach-fundraisers
// Body: { campaign_slug, coach_id, active, goal_cents? }
// Select/deselect a coach as a fundraising participant + set their goal.
// Head-Coach/Platform-Admin-only surface (this /admin tool is gated by
// getAdminAccess() (Platform Admin or the legacy shared password), same as every other campaign-content admin
// route — there is no separate coach-facing settings surface for this in
// the current app). Boosters are rejected here AND in
// upsertCoachParticipant itself (defense in depth) — never activatable.
export async function POST(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { campaign_slug, coach_id, active, goal_cents } = body as {
    campaign_slug: string; coach_id: string; active: boolean; goal_cents?: number | null;
  };
  const seasonBlocked = await seasonWriteBlocked(campaign_slug);
  if (seasonBlocked) return seasonBlocked;

  if (!campaign_slug || !coach_id) {
    return NextResponse.json({ error: "campaign_slug and coach_id are required." }, { status: 400 });
  }

  const result = await upsertCoachParticipant(campaign_slug, coach_id, {
    active: active === true,
    goal_cents: typeof goal_cents === "number" ? goal_cents : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "This coach is not eligible to be a fundraising participant (boosters are excluded)." }, { status: 400 });
  }

  logAuditEvent({
    actor: adminAuditActor(access),
    action:        active ? "coach_fundraiser.activated" : "coach_fundraiser.deactivated",
    entity_type:   "coach_fundraiser",
    entity_id:     coach_id,
    campaign_slug,
    summary:       `${active ? "Activated" : "Deactivated"} coach fundraising participation for coach ${coach_id} on ${campaign_slug}`,
    new_value:     { coach_id, active, goal_cents: goal_cents ?? null },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json(result.row);
}
