import { NextRequest, NextResponse } from "next/server";
import { generateMemberSalt, makeMemberCookie } from "@/lib/memberAuth";
import { checkRateLimit, recordFailure, getClientIp } from "@/lib/rateLimit";
import { validateAthleteForCampaign } from "@/lib/platform/athletes";
import { syncParentIntoAthleteThreads } from "@/lib/messages";

// 20 failed attempts per hour per IP.
// Most lenient limit — members may try old or misremembered codes.
const LIMIT = { limit: 20, windowSeconds: 60 * 60 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const key = `rl:member-join:${slug}:${getClientIp(req)}`;
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const { code, name, role, phone, athlete_id } = body;

  if (!code?.trim()) {
    // Missing field — not a code attempt, do not count
    return NextResponse.json({ error: "Join code is required." }, { status: 400 });
  }
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  // Booster is intentionally excluded — Phase 1B removes booster from
  // public/team-code self-registration on every join endpoint, including
  // this legacy one (no UI routes here anymore, but it remains a reachable
  // public endpoint for old shared links). Boosters remain valid staff via
  // the Head-Coach-gated staff-invite flow only.
  if (role !== "athlete" && role !== "parent") {
    return NextResponse.json({ error: "Role must be athlete or parent." }, { status: 400 });
  }

  const upperCode = code.trim().toUpperCase();

  // Validate the join code against this campaign
  const codeRes = await fetch(
    `${BASE}/rest/v1/team_join_codes?code=eq.${encodeURIComponent(upperCode)}&campaign_slug=eq.${encodeURIComponent(slug)}&revoked=eq.false&select=id,expires_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!codeRes.ok) {
    // DB error — do not count against the rate limit
    return NextResponse.json({ error: "Join failed. Please try again." }, { status: 500 });
  }

  const codeRows = await codeRes.json();
  if (!Array.isArray(codeRows) || codeRows.length === 0) {
    // Code not found or revoked — count as a failed attempt
    await recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Invalid or expired join code." }, { status: 400 });
  }
  const joinCode = codeRows[0];
  if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) {
    // Code expired — count as a failed attempt
    await recordFailure(key, LIMIT);
    return NextResponse.json({ error: "This join code has expired." }, { status: 400 });
  }

  // athlete_id links a parent to their athlete, or an athlete to their roster entry.
  // Optional in Phase 1A — omitted athlete_id still joins normally. When
  // supplied, it must be a real athlete belonging to this campaign.
  if (athlete_id !== undefined && athlete_id !== null) {
    if (typeof athlete_id !== "string") {
      return NextResponse.json({ error: "Invalid athlete_id." }, { status: 400 });
    }
    const athlete = await validateAthleteForCampaign(athlete_id, slug);
    if (!athlete) {
      return NextResponse.json({ error: "Athlete not found for this team." }, { status: 404 });
    }
  }

  const salt = generateMemberSalt();

  const memberBody: Record<string, unknown> = {
    campaign_slug: slug,
    role,
    name: name.trim(),
    salt,
  };
  if (phone?.trim()) memberBody.phone = phone.trim();
  if (athlete_id && typeof athlete_id === "string") memberBody.athlete_id = athlete_id;

  const insertRes = await fetch(`${BASE}/rest/v1/team_members`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify(memberBody),
  });

  if (!insertRes.ok) {
    const msg = await insertRes.text();
    return NextResponse.json({ error: `Failed to create account: ${msg}` }, { status: 500 });
  }

  const members = await insertRes.json();
  const member = members[0];

  const cookieValue = makeMemberCookie(member.id, member.salt);

  const response = NextResponse.json({
    ok: true,
    campaign_slug: slug,
    member: { id: member.id, name: member.name, role: member.role },
  });

  response.cookies.set("team_member", cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Parent selected their athlete during signup — catch up any pre-existing
  // athlete↔coach thread the same way members/me's later-linking path does.
  // Best-effort — must never fail the join that already succeeded.
  if (role === "parent" && athlete_id && typeof athlete_id === "string") {
    try {
      await syncParentIntoAthleteThreads(athlete_id, slug);
    } catch (err) {
      console.error("[team/join] syncParentIntoAthleteThreads failed:", err);
    }
  }

  return response;
}
