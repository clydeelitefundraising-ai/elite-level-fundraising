import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { canManageStaff } from "@/lib/permissions";
import { getCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";
import { checkRateLimit, consumeRateLimit, rateLimitKey } from "@/lib/rateLimit";
import { sendStaffInvite } from "@/lib/email";
import { resendStaffInvitation } from "@/lib/staffInvite";

const LIMIT = { limit: 5, windowSeconds: 60 * 60 };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageStaff(actor) || (actor.kind !== "coach" && actor.kind !== "platform_admin") || actor.session.campaign_slug !== slug) {
    return NextResponse.json({ error: "Only this team's Head Coach can resend invitations." }, { status: 403 });
  }

  const key = rateLimitKey("staff-invite-resend", req);
  const rl = await checkRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many resend attempts. Please try again later.", retryAfter: rl.retryAfter }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  const result = await resendStaffInvitation(id, slug);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await consumeRateLimit(key, LIMIT);

  // Same preview-vs-production URL fix as /api/team/[slug]/staff/invite and
  // /api/auth/request-reset — see comment there for why.
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
      role: result.invitation.role,
      inviteUrl,
    });
    emailSent = true;
  } catch (err) {
    console.error("[staff/invitations/resend] sendStaffInvite failed:", err);
  }

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "staff.invitation_resent",
    entity_type: "team_staff_invitation",
    entity_id: id,
    campaign_slug: slug,
    summary: `Resent invitation to ${result.invitation.email} on ${slug}`,
    new_value: { email_sent: emailSent },
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, emailSent });
}
