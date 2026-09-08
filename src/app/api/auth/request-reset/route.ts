import { NextRequest, NextResponse, after } from "next/server";
import { consumeRateLimit, rateLimitKey, identifierRateLimitKey } from "@/lib/rateLimit";
import { generateResetToken, hashResetToken, resetTokenExpiresAt, hashNormalizedEmail } from "@/lib/passwordReset";
import { sendPasswordReset } from "@/lib/email";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

const IP_LIMIT    = { limit: 10, windowSeconds: 60 * 60 };
const EMAIL_LIMIT = { limit: 3,  windowSeconds: 60 * 60 };

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Identical regardless of whether the email matches an account, whether the
// reset email send succeeds, or whether the request is merely rate-limited
// past the point of being processed — never let this route's response
// distinguish those cases from one another.
const NEUTRAL_RESPONSE = {
  ok:      true,
  message: "If an account exists for that email, we've sent password reset instructions.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { email } = body as { email?: string };
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();

  // Both limits are checked before any account lookup, and both are keyed
  // off values that exist whether or not the email matches a real account
  // (the client IP, and a hash of the submitted email) — so a rate-limited
  // response never reveals account existence.
  const ipKey = rateLimitKey("password-reset-request", req);
  const ipRl  = await consumeRateLimit(ipKey, IP_LIMIT);
  if (!ipRl.allowed) {
    return NextResponse.json(NEUTRAL_RESPONSE, { status: 200 });
  }

  const emailKey = identifierRateLimitKey("password-reset-request-email", hashNormalizedEmail(normalizedEmail));
  const emailRl  = await consumeRateLimit(emailKey, EMAIL_LIMIT);
  if (!emailRl.allowed) {
    return NextResponse.json(NEUTRAL_RESPONSE, { status: 200 });
  }

  try {
    const acctRes = await fetch(
      `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(normalizedEmail)}&select=id,name&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const acctRows = acctRes.ok ? await acctRes.json() : [];
    const account  = Array.isArray(acctRows) && acctRows.length > 0 ? (acctRows[0] as { id: string; name: string }) : null;

    if (account) {
      // Invalidate any previously issued, still-unused tokens for this
      // account before issuing a new one — only one live reset link should
      // ever exist for an account at a time.
      await fetch(
        `${BASE}/rest/v1/password_reset_tokens?account_id=eq.${encodeURIComponent(account.id)}&used_at=is.null`,
        {
          method:  "PATCH",
          headers: h({ Prefer: "return=minimal" }),
          body:    JSON.stringify({ used_at: new Date().toISOString() }),
        },
      );

      const rawToken   = generateResetToken();
      const tokenHash  = hashResetToken(rawToken);
      const expiresAt  = resetTokenExpiresAt();

      const insertRes = await fetch(`${BASE}/rest/v1/password_reset_tokens`, {
        method:  "POST",
        headers: h({ Prefer: "return=minimal" }),
        body:    JSON.stringify({ account_id: account.id, token_hash: tokenHash, expires_at: expiresAt }),
      });

      if (insertRes.ok) {
        const appBase  = process.env.NEXT_PUBLIC_APP_URL ?? "";
        const resetUrl = `${appBase}/reset-password/${rawToken}`;

        // Deferred via Next.js's after() (not a bare fire-and-forget
        // `void sendPasswordReset(...)`) for the same reason as the
        // announcements route's push dispatch: this app runs on Vercel's
        // standard Node.js serverless runtime, which can freeze a
        // function's execution the moment its response is sent. An
        // un-awaited promise racing that freeze could silently drop the
        // outbound Resend call. after() runs the callback after the
        // response is sent while keeping the invocation alive until it
        // finishes — and, as a deliberate side effect here, it also
        // removes the account-exists path's only remaining large timing
        // cost (the external email API call) from the awaited response,
        // closing the observable timing gap against the account-absent
        // path. Never log the raw token — only that a send was attempted.
        after(async () => {
          try {
            await sendPasswordReset({ to: normalizedEmail, name: account.name, resetUrl });
          } catch (err) {
            console.error("[request-reset] sendPasswordReset failed:", err);
          }
        });

        logAuditEvent({
          actor:        { type: "system", note: "password_reset_requested" },
          action:       "auth.password_reset_requested",
          entity_type:  "elf_account",
          entity_id:    account.id,
          summary:      "Password reset requested",
          ip_address:   ipOf(req),
          user_agent:   req.headers.get("user-agent"),
        });
      } else {
        console.error("[request-reset] failed to store reset token, status:", insertRes.status);
      }
    }
  } catch (err) {
    console.error("[request-reset] unexpected error:", err);
  }

  return NextResponse.json(NEUTRAL_RESPONSE, { status: 200 });
}
