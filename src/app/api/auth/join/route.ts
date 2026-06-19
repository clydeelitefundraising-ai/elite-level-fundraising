import { NextRequest, NextResponse } from "next/server";
import { generateAccountSalt, hashAccountPassword, makeAccountCookie, parseAccountId, verifyAccountCookie } from "@/lib/accountAuth";
import { generateMemberSalt, makeMemberCookie } from "@/lib/memberAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";

const LIMIT = { limit: 10, windowSeconds: 60 * 60 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

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
  if (!["athlete", "parent", "booster"].includes(role)) {
    return NextResponse.json({ error: "Role must be athlete, parent, or booster." }, { status: 400 });
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

  // Check if caller already has an elf_session (existing account joins another team)
  let accountId: string | null = null;
  let newCookieValue: string | null = null;

  const existingCookie = req.cookies.get("elf_session")?.value;
  if (existingCookie) {
    const parsedId = parseAccountId(existingCookie);
    if (parsedId) {
      const acctRes = await fetch(
        `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(parsedId)}&select=id,salt&limit=1`,
        { headers: h(), cache: "no-store" },
      );
      if (acctRes.ok) {
        const acctRows = await acctRes.json();
        if (Array.isArray(acctRows) && acctRows.length > 0) {
          const a = acctRows[0];
          if (verifyAccountCookie(existingCookie, a.id, a.salt)) {
            accountId = a.id as string;
          }
        }
      }
    }
  }

  // Create account if not already logged in
  if (!accountId) {
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }
    if (!password || (password as string).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const salt          = generateAccountSalt();
    const password_hash = hashAccountPassword(password as string, salt);

    const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
      method:  "POST",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify({
        email:         (email as string).trim().toLowerCase(),
        password_hash,
        salt,
        name:          (name as string).trim(),
      }),
    });

    if (!acctRes.ok) {
      const msg = await acctRes.text();
      if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
        return NextResponse.json(
          { error: "An account with that email already exists. Please log in instead." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Account creation failed. Please try again." }, { status: 500 });
    }

    const acctRows = await acctRes.json();
    const acct     = acctRows[0];
    accountId      = acct.id as string;
    newCookieValue = makeAccountCookie(acct.id as string, acct.salt as string);
  }

  // Create team_members row
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
  const cookieOpts = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path:     "/",
    maxAge:   60 * 60 * 24 * 30,
  };

  const response = NextResponse.json({ ok: true, campaign_slug });
  if (newCookieValue) response.cookies.set("elf_session", newCookieValue, cookieOpts);
  response.cookies.set("team_member", memberCookieValue, cookieOpts);
  return response;
}
