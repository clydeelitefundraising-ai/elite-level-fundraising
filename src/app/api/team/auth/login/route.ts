import { NextRequest, NextResponse } from "next/server";
import { hashPassword, makeCoachCookie } from "@/lib/teamAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// 10 failed attempts per 15 minutes per IP.
// More lenient than admin — coaches may mistype passwords.
const LIMIT = { limit: 10, windowSeconds: 60 * 15 };

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function POST(req: NextRequest) {
  const key = rateLimitKey("coach-login", req);
  const rl  = checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { email, password, campaign_slug } = await req.json();

  if (!email?.trim() || !password) {
    // Input validation failure — not a credential attempt, do not count
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
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
    recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const coach = rows[0];
  const expectedHash = hashPassword(password, coach.salt);
  if (expectedHash !== coach.password_hash) {
    // Wrong password — credential failure
    recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

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
