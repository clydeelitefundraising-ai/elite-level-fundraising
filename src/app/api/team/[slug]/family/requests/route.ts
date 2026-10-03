import { NextRequest, NextResponse, after } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getAccountSession } from "@/lib/accountSession";
import { createPendingRequest } from "@/lib/platform/parentAccessRequests";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import { getHeadCoachAccountIds } from "@/lib/pushRecipients";
import { dispatchPush } from "@/lib/pushDispatch";

type RouteCtx = { params: Promise<{ slug: string }> };

// Family Relationships Phase D — "My Athletes" / Link Another (or My First)
// Athlete, for an ALREADY-authenticated account already on this team.
// Deliberately NOT /api/auth/join: that endpoint is onboarding (account
// creation, join-code redemption, rate-limited for anonymous abuse) and has
// no "I'm already logged in and already a member of this exact team" path.
// This endpoint only ever creates ONE parent_access_requests row, for the
// CALLER'S OWN account, reusing createPendingRequest() exactly as
// /api/auth/join's parent branch already does — same validation, same
// already_pending/already_member/declined-reuse semantics, same C1
// concurrency protection, none of it duplicated here.
//
// Identity is resolved via getAccountSession() directly, NEVER from
// getTeamActor()'s session object — a coach-kind actor's session carries no
// account_id at all (see accountSession.ts's toCoachActor, which omits it),
// so relying on actor.session.id here would silently break every
// coach-as-parent case. getTeamActor() is used ONLY to confirm this account
// has standing (coach or member) on this exact campaign before allowing a
// request — it never contributes the account_id used below.
export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;

  const [actor, account] = await Promise.all([getTeamActor(slug), getAccountSession()]);
  // A legacy team_coach/team_member-cookie-only session (no elf_session) has
  // no account_id to resolve family data with at all — this account-based
  // feature simply isn't available to it, same limitation Phase C2 already
  // has. Never trust anything from the client for identity/authorization.
  if (actor.kind === "public" || !account) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const athleteId = body?.athleteId;
  if (!athleteId || typeof athleteId !== "string") {
    return NextResponse.json({ error: "Please select an athlete." }, { status: 400 });
  }

  // campaignSlug comes from the URL only; athleteId is validated against
  // THIS exact campaign inside createPendingRequest() (via
  // validateAthleteForCampaign) — a cross-campaign athlete id fails safely
  // here with no extra code needed.
  const result = await createPendingRequest({
    campaignSlug: slug,
    accountId:    account.id,
    parentName:   account.name,
    athleteId,
  });

  if (!result.ok) {
    if (result.reason === "athlete_not_found") {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  if (result.alreadyMember) {
    return NextResponse.json({ status: "already_member", memberId: result.memberId });
  }
  if (result.alreadyPending) {
    return NextResponse.json({ status: "already_pending" });
  }

  // New request created — notify the Head Coach(es). createPendingRequest()
  // itself never does this (confirmed: no notification/push code anywhere
  // in parentAccessRequests.ts) — /api/auth/join's parent branch owns this
  // dispatch today, so it's replicated here rather than extracted, to avoid
  // touching that frozen file. Deferred via after() for the same Vercel
  // serverless-freeze reason documented there — never allowed to fail a
  // request that already succeeded above.
  after(async () => {
    try {
      const teamId = await getTeamIdBySlug(slug);
      if (!teamId) return;
      const accountIds = await getHeadCoachAccountIds(slug);
      await createNotification(teamId, {
        type: "request",
        title: "New Team Request",
        body: "A new parent access request needs review",
        reference_id: result.request.id,
        reference_url: `/team/${slug}/requests`,
      });
      await dispatchPush({
        accountIds,
        category: "requests",
        kind: "request",
        ctx: {},
        url: `/team/${slug}/requests`,
      });
    } catch (err) {
      console.error("[family/requests] notification/push failed:", err);
    }
  });

  return NextResponse.json({ status: "created", requestId: result.request.id });
}
