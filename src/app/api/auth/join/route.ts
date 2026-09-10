import { NextRequest, NextResponse } from "next/server";
import { makeMemberCookie } from "@/lib/memberAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";
import { validateAthleteForCampaign, createLinkedAthleteMember } from "@/lib/platform/athletes";
import { createPendingRequest } from "@/lib/platform/parentAccessRequests";
import { resolveOrCreateAccount } from "@/lib/accountJoin";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import { getHeadCoachAccountIds } from "@/lib/pushRecipients";
import { dispatchApnsPush } from "@/lib/apns";

const LIMIT = { limit: 10, windowSeconds: 60 * 60 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const cookieOpts = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path:     "/",
  maxAge:   60 * 60 * 24 * 30,
};

export async function POST(req: NextRequest) {
  const key = rateLimitKey("account-join", req);
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { code, name, email, password, role, athlete_id } = body;

  if (!code?.trim())  return NextResponse.json({ error: "Team code is required." }, { status: 400 });
  if (!name?.trim())  return NextResponse.json({ error: "Name is required." }, { status: 400 });
  // Booster is intentionally excluded — Phase 1B removes booster from
  // public/team-code self-registration. Boosters remain valid staff, but
  // only via the Head-Coach-gated staff-invite flow (team/[slug]/staff).
  // Rejected here regardless of what the client sends, not just hidden
  // from the UI.
  if (role !== "athlete" && role !== "parent") {
    return NextResponse.json({ error: "Role must be athlete or parent." }, { status: 400 });
  }

  // Validate join code
  const upperCode = (code as string).trim().toUpperCase();
  const codeRes = await fetch(
    `${BASE}/rest/v1/team_join_codes?code=eq.${encodeURIComponent(upperCode)}&revoked=eq.false&select=id,campaign_slug,expires_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!codeRes.ok) return NextResponse.json({ error: "Join failed. Please try again." }, { status: 500 });

  const codeRows = await codeRes.json();
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    await recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Invalid or expired team code." }, { status: 400 });
  }

  const joinCode = codeRows[0];
  if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
    await recordFailure(key, LIMIT);
    return NextResponse.json({ error: "This team code has expired." }, { status: 400 });
  }

  const campaign_slug = joinCode.campaign_slug as string;

  // Athlete role: this endpoint is now only for "select yourself from the
  // roster" — the "not listed" case goes through /api/auth/join-request
  // instead and never reaches here. athlete_id is therefore REQUIRED for
  // role=athlete (never allow an athlete membership with athlete_id=null),
  // and always validated server-side against this exact campaign.
  //
  // Parent role: athlete_id is ALSO required (Phase 11a — Parent Access
  // Approval). A parent request names a specific child; team access is
  // never granted immediately here regardless — see the parent branch
  // below, which creates a pending parent_access_requests row instead of a
  // team_members row.
  if (role === "athlete" || role === "parent") {
    if (!athlete_id || typeof athlete_id !== "string") {
      const message = role === "athlete" ? "Please select your athlete from the roster." : "Please select your child from the roster.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const athlete = await validateAthleteForCampaign(athlete_id, campaign_slug);
    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
  }

  const accountResult = await resolveOrCreateAccount(req, { name, email, password });
  if (!accountResult.ok) {
    return NextResponse.json({ error: accountResult.error }, { status: accountResult.status });
  }
  const { accountId, newCookieValue } = accountResult;

  if (role === "athlete") {
    // athlete_id was validated above and is guaranteed non-null here.
    const linkResult = await createLinkedAthleteMember({
      campaignSlug: campaign_slug,
      athleteId:    athlete_id as string,
      accountId,
      name:         (name as string).trim(),
    });
    if (!linkResult.ok) {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
    const response = NextResponse.json({ ok: true, campaign_slug });
    if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);
    response.cookies.set("team_member", makeMemberCookie(linkResult.member.id, linkResult.member.salt), cookieOpts);
    return response;
  }

  // Parent: create a PENDING parent_access_requests row — never a live
  // team_members row. No team_member cookie is set; the parent has an
  // account (elf_session, set above) but no team access until a Head
  // Coach approves. See parentAccessRequests.ts for the full rationale.
  const result = await createPendingRequest({
    campaignSlug: campaign_slug,
    accountId,
    parentName:   (name as string).trim(),
    athleteId:    athlete_id as string,
  });

  if (!result.ok) {
    if (result.reason === "athlete_not_found") {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Fast path: this exact parent+child relationship is already live
  // (e.g. re-entering a code they already used) — log them straight in,
  // no new request needed.
  if (result.alreadyMember) {
    const memberRes = await fetch(
      `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(result.memberId)}&select=id,salt&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const memberRows = memberRes.ok ? await memberRes.json() : [];
    const member = memberRows[0];
    const response = NextResponse.json({ ok: true, campaign_slug, pending: false });
    if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);
    if (member) {
      response.cookies.set("team_member", makeMemberCookie(member.id, member.salt), cookieOpts);
    }
    return response;
  }

  // Fire-and-forget Head Coach notification for the new pending request —
  // same pattern as /api/auth/join-request. Never fails (or is allowed to
  // fail) the join that already succeeded above.
  if (!result.alreadyPending) {
    void (async () => {
      try {
        const teamId = await getTeamIdBySlug(campaign_slug);
        if (!teamId) return;
        await createNotification(teamId, {
          type: "request",
          title: "New Team Request",
          body: "A new parent access request needs review",
          reference_id: result.request.id,
          reference_url: `/team/${campaign_slug}/requests`,
        });
        const accountIds = await getHeadCoachAccountIds(campaign_slug);
        await dispatchApnsPush({
          accountIds,
          category: "requests",
          kind: "request",
          ctx: {},
          url: `/team/${campaign_slug}/requests`,
        });
      } catch (err) {
        console.error("[auth/join] parent request notification/push failed:", err);
      }
    })();
  }

  const response = NextResponse.json({ ok: true, campaign_slug, pending: true });
  if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);
  return response;
}
