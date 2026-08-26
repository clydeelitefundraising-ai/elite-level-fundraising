import { NextRequest, NextResponse } from "next/server";
import { makeAccountCookie } from "@/lib/accountAuth";
import { checkRateLimit, recordFailure, rateLimitKey } from "@/lib/rateLimit";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { acceptStaffInvitation } from "@/lib/staffInvite";

const LIMIT = { limit: 10, windowSeconds: 60 * 60 };

export async function POST(req: NextRequest) {
  const key = rateLimitKey("staff-invite-accept", req);
  const rl = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later.", retryAfter: rl.retryAfter }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { token, password } = body as { token?: string; password?: string };
  if (!token?.trim()) return NextResponse.json({ error: "Token is required." }, { status: 400 });

  const result = await acceptStaffInvitation(token.trim(), password);
  if (!result.ok) {
    if (result.status === 400) await recordFailure(key, LIMIT);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  logAuditEvent({
    actor: { type: "system", note: "staff_invite_self_accept" },
    action: "staff.invitation_accepted",
    entity_type: "team_staff_invitation",
    campaign_slug: result.campaignSlug,
    summary: `Invitation accepted for ${result.campaignSlug}`,
    new_value: { existing_account: result.existingAccount },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  const response = NextResponse.json({ ok: true, existingAccount: result.existingAccount, campaignSlug: result.campaignSlug });

  // Only a brand-new account gets an auto-session — an existing account
  // holder must log in with their existing password, same convention as
  // coach-activate.
  if (result.newAccountId && result.newAccountSalt) {
    response.cookies.set("elf_session", makeAccountCookie(result.newAccountId, result.newAccountSalt), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return response;
}
