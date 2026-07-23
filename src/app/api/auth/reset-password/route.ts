import { NextRequest, NextResponse } from "next/server";
import { hashInviteToken } from "@/lib/coachInvite";
import { generateAccountSalt, hashAccountPassword, makeAccountCookie } from "@/lib/accountAuth";
import { checkRateLimit, rateLimitKey } from "@/lib/rateLimit";

const LIMIT = { limit: 10, windowSeconds: 60 * 60 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function POST(req: NextRequest) {
  const key = rateLimitKey("password-reset-confirm", req);
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  const token    = (body?.token as string | undefined)?.trim();
  const password = body?.password as string | undefined;
  if (!token) return NextResponse.json({ error: "Token is required." }, { status: 400 });
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const tokenHash = hashInviteToken(token);
  const tokenRes = await fetch(
    `${BASE}/rest/v1/account_reset_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,account_id,expires_at,used_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!tokenRes.ok) return NextResponse.json({ error: "Reset failed. Please try again." }, { status: 500 });

  const tokenRows = await tokenRes.json();
  if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
    return NextResponse.json({ error: "This reset link is invalid." }, { status: 400 });
  }
  const tokenRow = tokenRows[0] as { id: string; account_id: string; expires_at: string; used_at: string | null };

  if (tokenRow.used_at) {
    return NextResponse.json({ error: "This reset link has already been used." }, { status: 400 });
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "This reset link has expired. Request a new one." }, { status: 400 });
  }

  const salt          = generateAccountSalt();
  const password_hash = hashAccountPassword(password, salt);

  const updateRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(tokenRow.account_id)}`,
    { method: "PATCH", headers: h({ Prefer: "return=representation" }), body: JSON.stringify({ password_hash, salt }) },
  );
  if (!updateRes.ok) return NextResponse.json({ error: "Failed to reset password." }, { status: 500 });
  const updateRows = await updateRes.json();
  const account = updateRows[0];
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  await fetch(
    `${BASE}/rest/v1/account_reset_tokens?id=eq.${encodeURIComponent(tokenRow.id)}`,
    { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ used_at: new Date().toISOString() }) },
  );

  const response = NextResponse.json({ ok: true });
  response.cookies.set("elf_session", makeAccountCookie(account.id, salt), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    path:     "/",
    maxAge:   60 * 60 * 24 * 30,
  });
  return response;
}
