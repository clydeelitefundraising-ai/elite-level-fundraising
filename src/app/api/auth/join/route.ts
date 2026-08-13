import { NextRequest, NextResponse } from "next/server";
import { makeMemberCookie, generateMemberSalt } from "@/lib/memberAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";
import { validateAthleteForCampaign, createLinkedAthleteMember } from "@/lib/platform/athletes";
import { resolveOrCreateAccount } from "@/lib/accountJoin";
import { syncParentIntoAthleteThreads } from "@/lib/messages";

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
  // Parent role: athlete_id remains optional, unchanged from before —
  // parents may link their athlete later via PATCH members/me.
  if (role === "athlete") {
    if (!athlete_id || typeof athlete_id !== "string") {
      return NextResponse.json({ error: "Please select your athlete from the roster." }, { status: 400 });
    }
    const athlete = await validateAthleteForCampaign(athlete_id, campaign_slug);
    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
  } else if (athlete_id !== undefined && athlete_id !== null) {
    if (typeof athlete_id !== "string") {
      return NextResponse.json({ error: "Invalid athlete_id." }, { status: 400 });
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

  const response = NextResponse.json({ ok: true, campaign_slug });
  if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);

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
    response.cookies.set("team_member", makeMemberCookie(linkResult.member.id, linkResult.member.salt), cookieOpts);
    return response;
  }

  // Parent (and any future non-athlete role): unchanged raw insert path —
  // no pre-existing member row is expected here either, so there's nothing
  // for createLinkedAthleteMember's "already a member" branch to help with.
  const memberSalt = generateMemberSalt();
  const memberBody: Record<string, unknown> = {
    campaign_slug,
    role,
    name:       (name as string).trim(),
    salt:       memberSalt,
    account_id: accountId,
  };
  if (athlete_id && typeof athlete_id === "string") memberBody.athlete_id = athlete_id;

  const memberRes = await fetch(`${BASE}/rest/v1/team_members`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify(memberBody),
  });

  if (!memberRes.ok) {
    const msg = await memberRes.text();
    return NextResponse.json({ error: `Failed to join team: ${msg}` }, { status: 500 });
  }

  const memberRows = await memberRes.json();
  const member     = memberRows[0];
  const memberCookieValue = makeMemberCookie(member.id as string, member.salt as string);
  response.cookies.set("team_member", memberCookieValue, cookieOpts);

  // Parent selected their athlete during signup — catch up any pre-existing
  // athlete↔coach thread the same way members/me's later-linking path does.
  // Best-effort — must never fail the join that already succeeded.
  if (role === "parent" && athlete_id && typeof athlete_id === "string") {
    try {
      await syncParentIntoAthleteThreads(athlete_id, campaign_slug);
    } catch (err) {
      console.error("[auth/join] syncParentIntoAthleteThreads failed:", err);
    }
  }

  return response;
}
