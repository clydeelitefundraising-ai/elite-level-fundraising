// @deprecated — this is the old account-less join path (name + optional
// phone, no email/password, no elf_accounts row ever created). Superseded by
// the unified /api/auth/join (Phase A22: Identity & Account Modernization),
// which /join/[code]'s JoinView.tsx and /enter-code's EnterCodeView.tsx both
// call instead as of that phase. Nothing in the app calls this route anymore
// (confirmed via grep). Left in place, not deleted, only because a handful of
// pre-A22 users may still have this as their only session mechanism — see
// getTeamActor's legacy-cookie fallback branch in permissions.server.ts,
// which this route's team_member-cookie-only sessions still depend on and
// which was deliberately left untouched for backward compatibility.
import { NextRequest, NextResponse } from "next/server";
import { generateMemberSalt, makeMemberCookie } from "@/lib/memberAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";

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

  const key = rateLimitKey(`member-join:${slug}`, req);
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
  if (role !== "athlete" && role !== "parent" && role !== "booster") {
    return NextResponse.json({ error: "Role must be athlete, parent, or booster." }, { status: 400 });
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

  const salt = generateMemberSalt();

  const memberBody: Record<string, unknown> = {
    campaign_slug: slug,
    role,
    name: name.trim(),
    salt,
  };
  if (phone?.trim()) memberBody.phone = phone.trim();
  // athlete_id links a parent to their athlete, or an athlete to their roster entry
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

  return response;
}
