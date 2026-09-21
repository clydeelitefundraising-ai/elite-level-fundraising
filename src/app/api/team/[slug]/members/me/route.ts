import { NextRequest, NextResponse } from "next/server";
import { getMemberSession } from "@/lib/memberSession";
import { linkMemberToAthlete } from "@/lib/platform/athletes";
import { createPendingRequest } from "@/lib/platform/parentAccessRequests";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import { getHeadCoachAccountIds } from "@/lib/pushRecipients";
import { dispatchPush } from "@/lib/pushDispatch";

// Athlete role: unchanged immediate self-link (never went through
// approval — only a parent's relationship to a child requires Head Coach
// review, per Phase 11a). Parent role: creates a pending
// parent_access_requests row instead of activating the relationship —
// applies both to a parent's FIRST child (if they joined without
// selecting one) and to an ADDITIONAL child (multi-child support), since
// every athlete/team relationship is independently requestable/approvable.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const member = await getMemberSession(slug);
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.athlete_id || typeof body.athlete_id !== "string") {
    return NextResponse.json({ error: "athlete_id required" }, { status: 400 });
  }

  if (member.role === "athlete") {
    try {
      const result = await linkMemberToAthlete(member.id, body.athlete_id, slug);
      if (!result.ok) {
        return NextResponse.json({ error: "Athlete not found for this team" }, { status: 404 });
      }
    } catch (err) {
      return NextResponse.json({ error: `Update failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (member.role !== "parent") {
    return NextResponse.json({ error: "Only athletes or parents may link athlete access here." }, { status: 403 });
  }
  if (!member.account_id) {
    return NextResponse.json({ error: "Your account could not be resolved. Please sign in again." }, { status: 400 });
  }

  const result = await createPendingRequest({
    campaignSlug: slug,
    accountId:    member.account_id,
    parentName:   member.name,
    athleteId:    body.athlete_id,
  });

  if (!result.ok) {
    if (result.reason === "athlete_not_found") {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Already linked (e.g. re-submitting the same child) — nothing to do,
  // report success without creating a duplicate request.
  if (result.alreadyMember) {
    return NextResponse.json({ ok: true, pending: false });
  }

  if (!result.alreadyPending) {
    void (async () => {
      try {
        const teamId = await getTeamIdBySlug(slug);
        if (!teamId) return;
        await createNotification(teamId, {
          type: "request",
          title: "New Team Request",
          body: "A new parent access request needs review",
          reference_id: result.request.id,
          reference_url: `/team/${slug}/requests`,
        });
        const accountIds = await getHeadCoachAccountIds(slug);
        await dispatchPush({
          accountIds,
          category: "requests",
          kind: "request",
          ctx: {},
          url: `/team/${slug}/requests`,
        });
      } catch (err) {
        console.error("[members/me] parent request notification/push failed:", err);
      }
    })();
  }

  return NextResponse.json({ ok: true, pending: true });
}
