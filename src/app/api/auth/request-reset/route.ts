import { NextRequest, NextResponse, after } from "next/server";
import { generateInviteToken, hashInviteToken, tokenExpiresAt } from "@/lib/coachInvite";
import { checkRateLimit, rateLimitKey } from "@/lib/rateLimit";
import { sendPasswordReset } from "@/lib/email";

const LIMIT = { limit: 5, windowSeconds: 60 * 60 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Always returns a generic success message regardless of whether the email
// matches an account — same "don't leak which emails exist" posture as the
// login route's generic "Invalid email or password."
const GENERIC_RESPONSE = { ok: true, message: "If an account exists for that email, we've sent a password reset link." };

export async function POST(req: NextRequest) {
  const key = rateLimitKey("password-reset-request", req);
  const rl  = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  const email = (body?.email as string | undefined)?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const acctRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(email)}&select=id,name,email&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const acctRows = acctRes.ok ? await acctRes.json() : [];
  const account = Array.isArray(acctRows) && acctRows.length > 0 ? acctRows[0] : null;

  if (account) {
    const rawToken  = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const tokenRes  = await fetch(`${BASE}/rest/v1/account_reset_tokens`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        account_id: account.id,
        token_hash: tokenHash,
        expires_at: tokenExpiresAt(1),
      }),
    });
    if (!tokenRes.ok) {
      console.error(`[auth/request-reset] token insert failed (${tokenRes.status}):`, await tokenRes.text());
    } else {
      const appBase  = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
      const resetUrl = `${appBase}/reset-password/${rawToken}`;
      // Scheduled via after() rather than a bare fire-and-forget promise: once
      // this handler returns, Vercel may freeze the function before an
      // un-awaited fetch to Resend finishes — after() guarantees the callback
      // runs to completion post-response instead of racing a freeze. Can't
      // just await it inline: the "account not found" branch above does no
      // extra async work before returning, so awaiting here only when an
      // account exists would make response time a timing side-channel for
      // account enumeration.
      after(() =>
        sendPasswordReset({ to: account.email, name: account.name, resetUrl })
          .then(() => console.log(`[auth/request-reset] reset email dispatched to=${account.email}`))
          .catch(err => console.error("[auth/request-reset] email failed:", err)),
      );
    }
  }

  return NextResponse.json(GENERIC_RESPONSE);
}
