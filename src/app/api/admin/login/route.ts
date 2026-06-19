import { NextRequest, NextResponse } from "next/server";
import { getAdminToken } from "@/lib/adminAuth";
import { checkRateLimit, clearRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";

// 5 failed attempts per 15 minutes per IP.
// Tight limit — admins know their password; this endpoint controls all schools.
const LIMIT = { limit: 5, windowSeconds: 60 * 15 };

export async function POST(req: NextRequest) {
  const key = rateLimitKey("admin-login", req);
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many failed attempts. Please try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const { password } = await req.json();
  const token = getAdminToken();

  if (!token) {
    // Server misconfiguration — do not count against the rate limit
    return NextResponse.json({ error: "Admin not configured." }, { status: 500 });
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || password !== expected) {
    await recordFailure(key, LIMIT);
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  await clearRateLimit(req, "admin-login");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("elf_admin", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
