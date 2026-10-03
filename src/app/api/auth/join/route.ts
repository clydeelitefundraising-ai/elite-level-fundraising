import { NextRequest, NextResponse, after } from "next/server";
import { makeMemberCookie } from "@/lib/memberAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";
import { validateAthleteForCampaign, createLinkedAthleteMember } from "@/lib/platform/athletes";
import {
  normalizeParentAthleteIds, submitParentAthleteRequests, type ParentJoinAthleteResult,
} from "@/lib/platform/parentJoinRequest";
import { resolveOrCreateAccount } from "@/lib/accountJoin";
import { getTeamIdBySlug, createNotification } from "@/lib/notifications";
import { getHeadCoachAccountIds } from "@/lib/pushRecipients";
import { dispatchPush } from "@/lib/pushDispatch";

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

  const { code, name, email, password, role, athlete_id, athleteIds: rawAthleteIds } = body;

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
  // Unchanged by Family Relationships Phase C2 — multi-select applies only
  // to the parent role below.
  if (role === "athlete") {
    if (!athlete_id || typeof athlete_id !== "string") {
      return NextResponse.json({ error: "Please select your athlete from the roster." }, { status: 400 });
    }
    const athlete = await validateAthleteForCampaign(athlete_id, campaign_slug);
    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
  }

  // Parent role (Family Relationships Phase C2): one or more children.
  // athleteIds (preferred, new) or the legacy singular athlete_id (still
  // fully supported) — normalizeParentAthleteIds() decides precedence and
  // rejects a malformed submission outright, never silently falling back.
  // Each id is independently validated against this exact campaign inside
  // createPendingRequest() below (via validateAthleteForCampaign) — never
  // pre-validated here as an all-or-nothing batch, so one bad id can never
  // block its valid siblings. Team access is never granted immediately
  // regardless of how many ids are valid — see the parent branch below,
  // which creates one pending parent_access_requests row per athlete,
  // never a live team_members row directly.
  let parentAthleteIds: string[] = [];
  if (role === "parent") {
    const normalized = normalizeParentAthleteIds({ athleteIds: rawAthleteIds, athlete_id });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    parentAthleteIds = normalized.athleteIds;
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

  // Parent (Family Relationships Phase C2): one independent
  // parent_access_requests row PER selected athlete — never a live
  // team_members row directly, and never one row holding an athlete array.
  // Processed sequentially (not Promise.all) via the existing, unmodified
  // createPendingRequest() — one athlete failing (not found, cross-campaign,
  // a transient error) never rolls back or blocks its siblings. See
  // parentJoinRequest.ts for the full per-athlete result mapping.
  const results = await submitParentAthleteRequests(parentAthleteIds, {
    campaignSlug: campaign_slug,
    accountId,
    parentName:   (name as string).trim(),
  });

  const createdResults = results.filter(
    (r): r is Extract<ParentJoinAthleteResult, { status: "created" }> => r.status === "created",
  );
  // At most one "already_member" result is possible in practice — Phase C1's
  // partial unique index guarantees a single team_members row per
  // account+campaign, so every already-approved relationship for this
  // parent on this team shares the same memberId.
  const alreadyMemberResult = results.find(
    (r): r is Extract<ParentJoinAthleteResult, { status: "already_member" }> => r.status === "already_member",
  );

  // Legacy "pending" field, generalized: false only when EVERY selected
  // athlete already has live approved access (the original single-athlete
  // alreadyMember fast path) — true whenever at least one still needs Head
  // Coach review. Preserved for any caller still reading this field; new
  // UI should read `results` directly.
  const pending = results.some(r => r.status === "created" || r.status === "already_pending");

  let response: NextResponse;
  if (alreadyMemberResult) {
    // Fast path: at least one requested relationship is already live, so
    // this account already has a team_members row for this campaign
    // (Phase C1 guarantees at most one) — reuse the exact same cookie-
    // setting behavior the original single-athlete alreadyMember path had.
    const memberRes = await fetch(
      `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(alreadyMemberResult.memberId)}&select=id,salt&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const memberRows = memberRes.ok ? await memberRes.json() : [];
    const member = memberRows[0];
    response = NextResponse.json({ ok: true, campaign_slug, pending, results });
    if (member) {
      response.cookies.set("team_member", makeMemberCookie(member.id, member.salt), cookieOpts);
    }
  } else {
    response = NextResponse.json({ ok: true, campaign_slug, pending, results });
  }
  if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);

  // Head Coach notification for each NEWLY created pending request — same
  // pattern (and same after()/freeze-race rationale) as the original
  // single-athlete code, just once per created request instead of exactly
  // once. Never fails (or is allowed to fail) the join that already
  // succeeded above. Re-submitted already-pending/already-member athletes
  // never generate a duplicate notification, matching prior behavior.
  if (createdResults.length > 0) {
    after(async () => {
      try {
        const teamId = await getTeamIdBySlug(campaign_slug);
        if (!teamId) return;
        const accountIds = await getHeadCoachAccountIds(campaign_slug);
        for (const created of createdResults) {
          await createNotification(teamId, {
            type: "request",
            title: "New Team Request",
            body: "A new parent access request needs review",
            reference_id: created.requestId,
            reference_url: `/team/${campaign_slug}/requests`,
          });
          await dispatchPush({
            accountIds,
            category: "requests",
            kind: "request",
            ctx: {},
            url: `/team/${campaign_slug}/requests`,
          });
        }
      } catch (err) {
        console.error("[auth/join] parent request notification/push failed:", err);
      }
    });
  }

  return response;
}
