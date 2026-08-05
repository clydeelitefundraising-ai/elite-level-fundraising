import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { getAccountSession } from "@/lib/accountSession";
import { canManageStaff } from "@/lib/permissions";
import { getCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { checkRateLimit, consumeRateLimit, rateLimitKey } from "@/lib/rateLimit";
import { sendStaffInvite } from "@/lib/email";
import { createStaffInvitation, isStaffAssignableRole } from "@/lib/staffInvite";

const LIMIT = { limit: 10, windowSeconds: 60 * 60 };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageStaff(actor) || actor.kind !== "coach" || actor.session.campaign_slug !== slug) {
    return NextResponse.json({ error: "Only this team's Head Coach can invite staff." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { full_name, email, role } = body as { full_name?: string; email?: string; role?: string };

  if (!full_name?.trim()) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (!isStaffAssignableRole(role)) return NextResponse.json({ error: "Role must be Assistant Coach or Booster." }, { status: 400 });

  const key = rateLimitKey("staff-invite-send", req);
  const rl = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many invitations sent. Please try again later.", retryAfter: rl.retryAfter }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  // invited_by_account_id references elf_accounts, not team_coaches — the
  // acting Head Coach's account id, not their team_coaches row id (which
  // is all TeamActor's coach session carries). Nullable for the rare
  // legacy coach who was never linked to an elf_accounts row.
  const account = await getAccountSession();
  const result = await createStaffInvitation(slug, full_name, email, role, account?.id ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (result.outcome === "existing_account") {
    // No write happened — do not consume the rate-limit budget for a lookup
    // that only revealed account existence to an already-authorized Head
    // Coach acting within their own team.
    return NextResponse.json({ ok: true, outcome: "existing_account", account: result.account });
  }

  await consumeRateLimit(key, LIMIT);

  // NEXT_PUBLIC_APP_URL is a NEXT_PUBLIC_* var baked in at build time — only
  // trust it in production. On preview, always link back to whichever
  // deployment actually handled this request, or the link points at
  // production instead of the preview that issued it. Same fix already
  // applied to /api/auth/request-reset for the identical class of bug.
  const appBase = process.env.VERCEL_ENV === "production"
    ? (process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin)
    : new URL(req.url).origin;
  const inviteUrl = `${appBase}/staff-invite/${result.rawToken}`;

  let emailSent = false;
  try {
    const settings = await getCampaignSettings(slug).catch(() => null);
    const teamName = settings ? `${settings.school_name} ${settings.mascot} ${settings.sport_name}`.trim() : slug;
    await sendStaffInvite({
      to: result.invitation.email,
      inviteeName: result.invitation.full_name,
      teamName,
      inviterName: actor.session.name,
      role,
      inviteUrl,
    });
    emailSent = true;
  } catch (err) {
    console.error("[staff/invite] sendStaffInvite failed:", err);
  }

  logAuditEvent({
    action: "staff.invited",
    entity_type: "team_staff_invitation",
    entity_id: result.invitation.id,
    campaign_slug: slug,
    summary: `Invited ${result.invitation.email} as ${role} on ${slug}`,
    new_value: { role, email: result.invitation.email, acting_head_coach_id: actor.session.id, email_sent: emailSent },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, outcome: "invitation_sent", invitation: result.invitation, emailSent });
}
