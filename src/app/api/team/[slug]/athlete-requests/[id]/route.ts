import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getAccountSession } from "@/lib/accountSession";
import { approveRequest, declineRequest } from "@/lib/platform/athleteRequests";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

// Approve or decline a pending athlete request. Head-Coach-only for THIS
// campaign — see route.ts (GET) for why isHeadCoach() is the correct check.
// decided_by_account_id records the elf_accounts id (not the team_coaches
// row id CoachSession carries), so this also requires a resolved account
// session — matching the spec's "authenticated account === Head Coach"
// framing exactly, and excluding any pre-Phase-21 coach who somehow still
// only has the legacy team_coach cookie with no linked account.
// The campaign is taken from the URL (trusted server/route context), never
// from the request body — so a Head Coach of a different campaign cannot
// act on this request even if they somehow learn its id, and nothing in
// the body (role, campaign, status, athlete id) is trusted without the
// server-side checks below.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const [actor, account] = await Promise.all([getTeamActor(slug), getAccountSession()]);
  if (!isHeadCoach(actor) || !account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || (body.action !== "approve" && body.action !== "decline")) {
    return NextResponse.json({ error: "action must be 'approve' or 'decline'." }, { status: 400 });
  }

  if (body.action === "decline") {
    const result = await declineRequest(
      { requestId: id, campaignSlug: slug, decidedByAccountId: account.id },
      typeof body.declineReason === "string" ? body.declineReason : undefined,
    );
    if (!result.ok) {
      if (result.reason === "not_found")       return NextResponse.json({ error: "Request not found." }, { status: 404 });
      if (result.reason === "already_decided") return NextResponse.json({ error: "This request has already been decided." }, { status: 409 });
      // internal_error — never expose raw DB/REST internals to the client.
      return NextResponse.json({ error: "Failed to decline this request. Please try again." }, { status: 500 });
    }
    logAuditEvent({
      action:        "athlete_request.declined",
      entity_type:   "pending_athlete_request",
      entity_id:     id,
      campaign_slug: slug,
      summary:       `Declined athlete join request for "${result.request.full_name}"`,
      ip_address:    ipOf(req),
      user_agent:    req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, request: result.request });
  }

  // action === "approve"
  const linkAthleteId = typeof body.linkAthleteId === "string" && body.linkAthleteId ? body.linkAthleteId : null;
  const decision = linkAthleteId
    ? { action: "link" as const, athleteId: linkAthleteId }
    : { action: "create" as const, overrideCollision: body.overrideCollision === true };

  const result = await approveRequest(
    { requestId: id, campaignSlug: slug, decidedByAccountId: account.id },
    decision,
  );

  if (!result.ok) {
    if (result.reason === "not_found")         return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (result.reason === "already_decided")   return NextResponse.json({ error: "This request has already been decided." }, { status: 409 });
    if (result.reason === "athlete_not_found") return NextResponse.json({ error: "Selected athlete not found on this team." }, { status: 404 });
    if (result.reason === "validation")        return NextResponse.json({ error: result.message }, { status: 400 });
    if (result.reason === "collision") {
      return NextResponse.json(
        { error: `An athlete named "${(result.collision as { existing: { name: string } }).existing.name}" already exists on this team.`, collision: result.collision },
        { status: 409 },
      );
    }
    if (result.reason === "partial_success") {
      // Athlete + membership were genuinely created/linked but the final
      // status update on the request row failed — log for manual
      // follow-up rather than exposing internals; the request is not
      // reverted to pending, so re-approving is deliberately blocked.
      console.error(
        `[athlete-requests] partial_success on approve: request=${id} athlete=${result.athleteId} member=${result.memberId} — needs manual pending_athlete_requests update`,
      );
      return NextResponse.json(
        { error: "The athlete was created, but finishing this request failed. Please contact support." },
        { status: 500 },
      );
    }
    // internal_error — never expose raw DB/REST internals to the client.
    return NextResponse.json({ error: "Failed to approve this request. Please try again." }, { status: 500 });
  }

  logAuditEvent({
    action:        "athlete_request.approved",
    entity_type:   "pending_athlete_request",
    entity_id:     id,
    campaign_slug: slug,
    summary:       `Approved athlete join request for "${result.request.full_name}" (athlete_id=${result.request.resulting_athlete_id})`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true, request: result.request });
}
