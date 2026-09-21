import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isHeadCoach } from "@/lib/permissions";
import { getAccountSession } from "@/lib/accountSession";
import { approveRequest, declineRequest } from "@/lib/platform/parentAccessRequests";
import { getCampaignSettings } from "@/lib/supabase";
import { dispatchPush } from "@/lib/pushDispatch";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

// Approve or decline a pending parent access request. Head-Coach-only for
// THIS campaign — same reasoning as athlete-requests/[id]/route.ts.
// decided_by_account_id records the elf_accounts id, so this also requires
// a resolved account session. Campaign is taken from the URL, never the
// body — a Head Coach of a different campaign cannot act on this request
// even if they somehow learn its id.
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const [actor, account] = await Promise.all([getTeamActor(slug), getAccountSession()]);
  if (!isHeadCoach(actor) || !account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // isHeadCoach narrows to "coach" | "platform_admin" already, but
  // TypeScript can't infer that through the function boundary — narrow
  // explicitly for toAuditActor() below.
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
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
      return NextResponse.json({ error: "Failed to decline this request. Please try again." }, { status: 500 });
    }
    logAuditEvent({
      actor:         toAuditActor(actor),
      action:        "parent_access_request.declined",
      entity_type:   "parent_access_request",
      entity_id:     id,
      campaign_slug: slug,
      summary:       `Declined parent access request for account ${result.request.account_id}`,
      ip_address:    ipOf(req),
      user_agent:    req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, request: result.request });
  }

  // action === "approve"
  const result = await approveRequest({ requestId: id, campaignSlug: slug, decidedByAccountId: account.id });

  if (!result.ok) {
    if (result.reason === "not_found")       return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (result.reason === "already_decided") return NextResponse.json({ error: "This request has already been decided." }, { status: 409 });
    return NextResponse.json({ error: "Failed to approve this request. Please try again." }, { status: 500 });
  }

  logAuditEvent({
    actor:         toAuditActor(actor),
    action:        "parent_access_request.approved",
    entity_type:   "parent_access_request",
    entity_id:     id,
    campaign_slug: slug,
    summary:       `Approved parent access request for account ${result.request.account_id} (member_id=${result.memberId})`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  // Fire-and-forget push to the newly-approved parent. Best-effort, and
  // deliberately account-device-based (not the team-scoped in-app
  // notifications table) — the parent had no team membership to see a
  // team-scoped notification with until this exact moment.
  void (async () => {
    try {
      const settings = await getCampaignSettings(slug);
      const teamLabel = settings ? [settings.school_name, settings.sport_name].filter(Boolean).join(" ") : undefined;
      await dispatchPush({
        accountIds: [result.request.account_id],
        category:   "requests",
        kind:       "request_approved",
        ctx:        { teamLabel },
        url:        `/team/${slug}/home`,
      });
    } catch (err) {
      console.error("[parent-access-requests] approval push failed:", err);
    }
  })();

  return NextResponse.json({ ok: true, request: result.request });
}
