import { NextRequest, NextResponse } from "next/server";
import { hashPassword, makeCoachCookie } from "@/lib/teamAuth";
import { checkRateLimit, clearRateLimitKey, compoundRateLimitKey, recordFailure, rateLimitKey } from "@/lib/rateLimit";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// Layered protection, same rationale as account-login: a broad per-IP
// ceiling catches one attacker spraying many different coach accounts from
// one IP, while a narrower per-IP+email bucket protects one account without
// a shared network locking out every other coach on it.
// More lenient than admin — coaches may mistype passwords.
const BROAD_LIMIT  = { limit: 30, windowSeconds: 60 * 15 };
const NARROW_LIMIT = { limit: 10, windowSeconds: 60 * 15 };

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function POST(req: NextRequest) {
  const { email, password, campaign_slug } = await req.json();

  if (!email?.trim() || !password) {
    // Input validation failure — not a credential attempt, do not count
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const broadKey  = rateLimitKey("coach-login", req);
  const narrowKey = compoundRateLimitKey("coach-login-id", req, email);
  const [broadCheck, narrowCheck] = await Promise.all([
    checkRateLimit(broadKey, BROAD_LIMIT),
    checkRateLimit(narrowKey, NARROW_LIMIT),
  ]);
  if (!broadCheck.allowed || !narrowCheck.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later.", retryAfter: Math.max(broadCheck.retryAfter, narrowCheck.retryAfter) },
      { status: 429, headers: { "Retry-After": String(Math.max(broadCheck.retryAfter, narrowCheck.retryAfter)) } },
    );
  }

  // If campaign_slug provided, scope the lookup — handles coaches on multiple campaigns
  const slugFilter = campaign_slug
    ? `&campaign_slug=eq.${encodeURIComponent(campaign_slug.trim())}`
    : "";

  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?email=eq.${encodeURIComponent(email.trim().toLowerCase())}${slugFilter}&limit=1`,
    { headers: supabaseHeaders(), cache: "no-store" },
  );

  if (!res.ok) {
    // DB error — do not count against the rate limit
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    // Unknown email — credential failure
    await Promise.all([recordFailure(broadKey, BROAD_LIMIT), recordFailure(narrowKey, NARROW_LIMIT)]);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const coach = rows[0];
  const expectedHash = hashPassword(password, coach.salt);
  if (expectedHash !== coach.password_hash) {
    // Wrong password — credential failure
    await Promise.all([recordFailure(broadKey, BROAD_LIMIT), recordFailure(narrowKey, NARROW_LIMIT)]);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  // Only the narrow (account-specific) bucket clears on success — see
  // account-login route for why the broad bucket is left to expire naturally.
  await clearRateLimitKey(narrowKey);
  const cookieValue = makeCoachCookie(coach.id, coach.salt);
  const response = NextResponse.json({
    ok: true,
    coach: {
      id: coach.id,
      name: coach.name,
      role: coach.role,
      campaign_slug: coach.campaign_slug,
    },
  });

  response.cookies.set("team_coach", cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
