import { NextRequest, NextResponse } from "next/server";
import { hashAccountPassword, makeAccountCookie } from "@/lib/accountAuth";
import { getAccountTeams } from "@/lib/accountSession";
import { checkRateLimit, clearRateLimitKey, compoundRateLimitKey, recordFailure, rateLimitKey } from "@/lib/rateLimit";

// Layered protection: a broad per-IP ceiling catches one attacker spraying
// many different accounts from one IP, while a narrower per-IP+email bucket
// protects one account without a shared network (school, household, mobile
// carrier NAT) locking out every other real user on it over a few honest
// typos. Neither check nor its response differs based on whether the email
// actually belongs to an account, so this cannot be used to enumerate
// accounts.
const BROAD_LIMIT  = { limit: 30, windowSeconds: 60 * 15 };
const NARROW_LIMIT = { limit: 10, windowSeconds: 60 * 15 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { email, password, rememberMe } = body;
  if (!email?.trim() || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const broadKey  = rateLimitKey("account-login", req);
  const narrowKey = compoundRateLimitKey("account-login-id", req, email);
  const [broadCheck, narrowCheck] = await Promise.all([
    checkRateLimit(broadKey, BROAD_LIMIT),
    checkRateLimit(narrowKey, NARROW_LIMIT),
  ]);
  if (!broadCheck.allowed || !narrowCheck.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later.", retryAfter: Math.max(broadCheck.retryAfter, narrowCheck.retryAfter) },
      { status: 429, headers: { "Retry-After": String(Math.max(broadCheck.retryAfter, narrowCheck.retryAfter)) } },
    );
  }

  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=id,name,email,password_hash,salt&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json({ error: "Login failed." }, { status: 500 });

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    await Promise.all([recordFailure(broadKey, BROAD_LIMIT), recordFailure(narrowKey, NARROW_LIMIT)]);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const acct = rows[0];
  if (hashAccountPassword(password, acct.salt) !== acct.password_hash) {
    await Promise.all([recordFailure(broadKey, BROAD_LIMIT), recordFailure(narrowKey, NARROW_LIMIT)]);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // Only the narrow (account-specific) bucket clears on success. The broad
  // per-IP bucket is intentionally left to expire on its own — clearing it
  // on any single success would let an attacker spraying many accounts from
  // one IP reset their own volumetric budget just by guessing one real
  // account correctly.
  await clearRateLimitKey(narrowKey);
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
