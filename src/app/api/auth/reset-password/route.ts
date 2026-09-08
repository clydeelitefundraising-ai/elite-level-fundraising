import { NextRequest, NextResponse } from "next/server";
import { hashResetToken } from "@/lib/passwordReset";
import { generateAccountSalt, hashAccountPassword } from "@/lib/accountAuth";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Never distinguish "token never existed" from "already used" from
// "expired" from "account lookup failed" — a single generic message avoids
// leaking anything about the token or the account it belonged to.
const INVALID_OR_EXPIRED = "This password reset link is invalid or has expired.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  // Deliberately destructured as only { token, password } — the type below
  // has no other fields, so passing email/accountId/memberId/coachId from
  // the client is structurally impossible to honor even if sent.
  const { token, password } = body as { token?: string; password?: string };
  if (!token?.trim()) return NextResponse.json({ error: "Token is required." }, { status: 400 });
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const tokenHash = hashResetToken(token.trim());

  const tokenRes = await fetch(
    `${BASE}/rest/v1/password_reset_tokens?token_hash=eq.${encodeURIComponent(tokenHash)}&select=id,account_id,expires_at,used_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!tokenRes.ok) return NextResponse.json({ error: INVALID_OR_EXPIRED }, { status: 400 });

  const tokenRows = await tokenRes.json();
  if (!Array.isArray(tokenRows) || tokenRows.length === 0) {
    return NextResponse.json({ error: INVALID_OR_EXPIRED }, { status: 400 });
  }
  const tokenRow = tokenRows[0] as { id: string; account_id: string; expires_at: string; used_at: string | null };

  if (tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: INVALID_OR_EXPIRED }, { status: 400 });
  }

  // Atomically claim the token before touching the account — identical
  // race-safe pattern to coach-activate's `used_at=is.null` conditional
  // PATCH, so a double-submit resolves to exactly one winner.
  const claimRes = await fetch(
    `${BASE}/rest/v1/password_reset_tokens?id=eq.${encodeURIComponent(tokenRow.id)}&used_at=is.null`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify({ used_at: new Date().toISOString() }),
    },
  );
  if (!claimRes.ok) return NextResponse.json({ error: INVALID_OR_EXPIRED }, { status: 400 });
  const claimedRows = await claimRes.json();
  if (!Array.isArray(claimedRows) || claimedRows.length === 0) {
    return NextResponse.json({ error: INVALID_OR_EXPIRED }, { status: 400 });
  }

  // The account is resolved solely from the successfully claimed token row
  // — never from anything in the request body.
  const accountId = claimedRows[0].account_id as string;

  const newSalt = generateAccountSalt();
  const newHash = hashAccountPassword(password, newSalt);

  const updateRes = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(accountId)}`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ password_hash: newHash, salt: newSalt }),
    },
  );
  if (!updateRes.ok) return NextResponse.json({ error: "Password reset failed." }, { status: 500 });

  // Invalidate every other outstanding, unused reset token for this account
  // — a completed reset should retire any other links still in flight.
  await fetch(
    `${BASE}/rest/v1/password_reset_tokens?account_id=eq.${encodeURIComponent(accountId)}&used_at=is.null`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ used_at: new Date().toISOString() }),
    },
  );

  logAuditEvent({
    actor:        { type: "system", note: "password_reset_completed" },
    action:       "auth.password_reset_completed",
    entity_type:  "elf_account",
    entity_id:    accountId,
    summary:      "Password reset completed",
    ip_address:   ipOf(req),
    user_agent:   req.headers.get("user-agent"),
  });

  // Rotating the salt above already invalidates every existing elf_session
  // cookie for this account (the cookie is sha256(accountId + salt +
  // PEPPER) — see accountAuth.ts), so there is nothing else to revoke.
  // Explicitly clear the cookie on THIS response too and do not issue a new
  // one — the user must log in again with their new password.
  const response = NextResponse.json({ ok: true });
  response.cookies.set("elf_session", "", { path: "/", maxAge: 0 });
  return response;
}
