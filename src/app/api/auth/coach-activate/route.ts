import { NextRequest, NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/coachInvite";
import { generateAccountSalt, hashAccountPassword, makeAccountCookie } from "@/lib/accountAuth";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { token, password } = body as { token?: string; password?: string };
  if (!token?.trim()) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const tokenHash = hashInviteToken(token.trim());

  // Look up the token
  const tokenRes = await fetch(
    `${BASE}/rest/v1/coach_invite_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,coach_id,expires_at,used_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!tokenRes.ok) return NextResponse.json({ error: "Validation failed." }, { status: 500 });

  const tokenRows = await tokenRes.json();
  if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
    return NextResponse.json({ error: "This invite link is invalid." }, { status: 400 });
  }
  const tokenRow = tokenRows[0] as { id: string; coach_id: string; expires_at: string; used_at: string | null };

  if (tokenRow.used_at) {
    return NextResponse.json({ error: "This invite link has already been used." }, { status: 400 });
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invite link has expired. Ask your administrator for a new one." }, { status: 400 });
  }

  // Atomically claim the token BEFORE doing any account work: PATCH with
  // `used_at=is.null` in the WHERE clause means only one concurrent
  // request can ever match this row and get it back in the response. A
  // double-submit (or two people racing the same link) now resolves to
  // exactly one winner here — the loser gets a clean "already used" error
  // instead of racing through account creation/linking too. Tradeoff: if
  // account creation fails *after* this point, the token stays consumed
  // (no retry) — acceptable per-token, since an admin can issue a fresh
  // invite via the existing "Send Invite" flow; strictly better than the
  // previous mark-used-last ordering, which left the race open for the
  // link-existing-account path (no unique constraint there to catch it).
  const claimRes = await fetch(
    `${BASE}/rest/v1/coach_invite_tokens?id=eq.${encodeURIComponent(tokenRow.id)}&used_at=is.null`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify({ used_at: new Date().toISOString() }),
    },
  );
  if (!claimRes.ok) return NextResponse.json({ error: "Validation failed." }, { status: 500 });
  const claimedRows = await claimRes.json();
  if (!Array.isArray(claimedRows) || claimedRows.length === 0) {
    return NextResponse.json({ error: "This invite link has already been used." }, { status: 400 });
  }

  // Fetch the coach
  const coachRes = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(tokenRow.coach_id)}&select=id,name,email,campaign_slug&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!coachRes.ok) return NextResponse.json({ error: "Failed to look up coach." }, { status: 500 });
  const coachRows = await coachRes.json();
  if (!Array.isArray(coachRows) || coachRows.length === 0) {
    return NextResponse.json({ error: "Coach account not found." }, { status: 404 });
  }
  const coach = coachRows[0] as { id: string; name: string; email: string; campaign_slug: string };

  // Check for existing elf_account with this email
  const existingRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(coach.email.toLowerCase())}&select=id,salt&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const existingRows = existingRes.ok ? await existingRes.json() : [];
  const existingAccount = Array.isArray(existingRows) && existingRows.length > 0
    ? (existingRows[0] as { id: string; salt: string })
    : null;

  let accountId: string;
  let newCookieValue: string | null = null;

  if (existingAccount) {
    // Link without creating a new account or setting a session
    // (coach must log in with their existing password)
    accountId = existingAccount.id;
  } else {
    // Need a password to create the account
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    const salt          = generateAccountSalt();
    const password_hash = hashAccountPassword(password, salt);

    const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
      method:  "POST",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify({ email: coach.email.toLowerCase(), name: coach.name, password_hash, salt }),
    });
    if (!acctRes.ok) {
      const msg = await acctRes.text();
      if (msg.includes("23505") || msg.includes("unique")) {
        return NextResponse.json(
          { error: "An account with this email already exists. Please log in instead." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Account creation failed." }, { status: 500 });
    }
    const acctRows  = await acctRes.json();
    const newAcct   = acctRows[0] as { id: string; salt: string };
    accountId       = newAcct.id;
    newCookieValue  = makeAccountCookie(newAcct.id, newAcct.salt);
  }

  // Link account_id on the coach row
  await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(coach.id)}`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ account_id: accountId }),
    },
  );

  const response = NextResponse.json({
    ok:              true,
    existingAccount: !!existingAccount,
    campaignSlug:    coach.campaign_slug,
  });

  if (newCookieValue) {
    response.cookies.set("elf_session", newCookieValue, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "strict",
      path:     "/",
      maxAge:   60 * 60 * 24 * 30,
    });
  }

  return response;
}
