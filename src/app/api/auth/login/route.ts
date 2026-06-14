import { NextRequest, NextResponse } from "next/server";
import { hashAccountPassword, makeAccountCookie } from "@/lib/accountAuth";
import { getAccountTeams } from "@/lib/accountSession";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";

const LIMIT = { limit: 10, windowSeconds: 60 * 15 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function POST(req: NextRequest) {
  const key = rateLimitKey("account-login", req);
  const rl  = checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later.", retryAfter: rl.retryAfter },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { email, password, rememberMe } = body;
  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=id,name,email,password_hash,salt&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json({ error: "Login failed." }, { status: 500 });

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const acct = rows[0];
  if (hashAccountPassword(password, acct.salt) !== acct.password_hash) {
    recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const teams = await getAccountTeams(acct.id);
  const cookieValue = makeAccountCookie(acct.id, acct.salt);

  const response = NextResponse.json({
    ok:        true,
    teamCount: teams.length,
    slug:      teams.length === 1 ? teams[0].campaign_slug : null,
  });

  const cookieOpts: Parameters<typeof response.cookies.set>[2] = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    path:     "/",
  };
  if (rememberMe) cookieOpts.maxAge = 60 * 60 * 24 * 30;

  response.cookies.set("elf_session", cookieValue, cookieOpts);

  return response;
}
