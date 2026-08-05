import { NextRequest, NextResponse } from "next/server";
import { getTeamActor } from "@/lib/permissions.server";
import { isStaff, canManageStaff } from "@/lib/permissions";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { checkRateLimit, consumeRateLimit, rateLimitKey } from "@/lib/rateLimit";
import {
  listTeamCoaches,
  listPendingInvitations,
  isStaffAssignableRole,
  createStaffAccountWithPassword,
  assignExistingAccountAsStaff,
  normalizeEmail,
} from "@/lib/staffInvite";

const CREATE_LIMIT = { limit: 15, windowSeconds: 60 * 60 };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (actor.kind === "public") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await listTeamCoaches(slug);
  const staffCanSeeEmail = isStaff(actor);
  const staff = rows.map(r => ({
    id: r.id,
    name: r.name,
    role: r.role,
    email: staffCanSeeEmail ? r.email : null,
    account_id: staffCanSeeEmail ? r.account_id : null,
    created_at: r.created_at,
  }));

  const pendingInvitations = canManageStaff(actor) ? await listPendingInvitations(slug) : [];

  return NextResponse.json({ staff, pendingInvitations, canManage: canManageStaff(actor) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);
  if (!canManageStaff(actor) || actor.kind !== "coach" || actor.session.campaign_slug !== slug) {
    return NextResponse.json({ error: "Only this team's Head Coach can manage staff." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { method, role } = body as { method?: string; role?: string };
  if (!isStaffAssignableRole(role)) {
    return NextResponse.json({ error: "Role must be Assistant Coach or Booster." }, { status: 400 });
  }

  const key = rateLimitKey("staff-create", req);
  const rl = await checkRateLimit(key, CREATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later.", retryAfter: rl.retryAfter }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  }

  if (method === "existing_account") {
    const { account_id } = body as { account_id?: string };
    if (!account_id?.trim()) return NextResponse.json({ error: "An account must be selected." }, { status: 400 });

    const result = await assignExistingAccountAsStaff(slug, account_id.trim(), role);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    await consumeRateLimit(key, CREATE_LIMIT);

    if (!result.alreadyAssigned) {
      logAuditEvent({
        action: "staff.existing_account_assigned",
        entity_type: "team_coach",
        entity_id: result.staff.id,
        campaign_slug: slug,
        summary: `Added existing account as ${role} on ${slug}`,
        new_value: { role, method: "existing_account", target_account_id: account_id.trim(), acting_head_coach_id: actor.session.id },
        ip_address: ipOf(req),
        user_agent: req.headers.get("user-agent"),
      });
    }
    return NextResponse.json({ ok: true, outcome: result.alreadyAssigned ? "already_assigned" : "assigned", staff: result.staff });
  }

  if (method === "temporary_password") {
    const { full_name, email, password } = body as { full_name?: string; email?: string; password?: string };
    if (!full_name?.trim()) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (!password || password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const result = await createStaffAccountWithPassword(slug, full_name, normalizeEmail(email), role, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, existingAccount: result.existingAccount }, { status: result.status });
    }
    await consumeRateLimit(key, CREATE_LIMIT);

    logAuditEvent({
      action: "staff.account_created",
      entity_type: "team_coach",
      entity_id: result.staff.id,
      campaign_slug: slug,
      summary: `Created ${role} account for ${normalizeEmail(email)} on ${slug}`,
      new_value: { role, method: "temporary_password", email: normalizeEmail(email), acting_head_coach_id: actor.session.id },
      ip_address: ipOf(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, outcome: "created", staff: result.staff });
  }

  return NextResponse.json({ error: "Invalid method." }, { status: 400 });
}
