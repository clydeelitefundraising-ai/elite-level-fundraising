import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";
import { createPendingRequest } from "@/lib/platform/athleteRequests";
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

// "I don't see my name" — the not-listed athlete path. Creates/reuses an
// ELF account and a pending_athlete_requests row ONLY. Never creates an
// athletes row, never creates a team_members row, never grants team access
// — that only happens if/when a Head Coach approves via
// PATCH /api/team/[slug]/athlete-requests/[id].
export async function POST(req: NextRequest) {
  const key = rateLimitKey("account-join-request", req);
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { code, name, classYear, event, email, password } = body;

  if (!code?.trim())      return NextResponse.json({ error: "Team code is required." }, { status: 400 });
  if (!name?.trim())      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  if (!classYear?.trim()) return NextResponse.json({ error: "Class/year is required." }, { status: 400 });

  const upperCode = (code as string).trim().toUpperCase();
  const codeRes = await fetch(
    `${BASE}/rest/v1/team_join_codes?code=eq.${encodeURIComponent(upperCode)}&revoked=eq.false&select=id,campaign_slug,expires_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!codeRes.ok) return NextResponse.json({ error: "Request failed. Please try again." }, { status: 500 });

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

  const accountResult = await resolveOrCreateAccount(req, { name, email, password });
  if (!accountResult.ok) {
    return NextResponse.json({ error: accountResult.error }, { status: accountResult.status });
  }
  const { accountId, newCookieValue } = accountResult;

  const result = await createPendingRequest({
    campaignSlug: campaign_slug,
    accountId,
    fullName:     name,
    classYear,
    event,
  });

  if (!result.ok) {
    if (result.reason === "duplicate_pending") {
      const response = NextResponse.json({ error: "You already have a pending request for this team." }, { status: 409 });
      if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);
      return response;
    }
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // Phase 10: canonical notification row + native push for a new pending
  // athlete/parent request — Head Coach's actionable queue. Fire-and-forget,
  // after the request itself has already been successfully created above;
  // a failure here must never fail (or roll back) the request that already
  // exists. Comment-moderation's pending-approval queue is a completely
  // separate system (platform/comments.ts) and deliberately gets neither a
  // notification row nor push here — out of scope for V1 per product
  // decision.
  void (async () => {
    try {
      const teamId = await getTeamIdBySlug(campaign_slug);
      if (!teamId) return;
      await createNotification(teamId, {
        type: "request",
        title: "New Team Request",
        body: "A new team request needs review",
        reference_id: result.request.id,
        reference_url: `/team/${campaign_slug}/requests`,
      });
      // Head-Coach-only at the push layer — the inbox row above stays
      // visible to all staff (existing, preserved coach-inbox behavior,
      // same as every other type), this filter applies only to who
      // actually gets a native push.
      const accountIds = await getHeadCoachAccountIds(campaign_slug);
      await dispatchApnsPush({
        accountIds,
        category: "requests",
        kind: "request",
        ctx: {},
        url: `/team/${campaign_slug}/requests`,
      });
    } catch (err) {
      console.error("[join-request] notification/push failed:", err);
    }
  })();

  const response = NextResponse.json({ ok: true, campaign_slug, request: result.request });
  if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);
  return response;
}
