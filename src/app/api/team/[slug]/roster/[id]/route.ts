import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff, isHeadCoach } from "@/lib/permissions.server";
import { validateAthleteForCampaign, deleteAthleteWithMessagingCleanup } from "@/lib/platform/athletes";
import { logAuditEvent, toAuditActor, ipOf } from "@/lib/auditLog";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

type RouteContext = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, event, class_year, jersey_number, grad_year, profile_photo, goal_cents, contact_phone, contact_email } = await req.json();

  const patch: Record<string, unknown> = {};
  if (name?.trim())   patch.name  = name.trim();
  if (event?.trim())  patch.event = event.trim();
  // Allow explicit null to clear optional fields
  if (class_year     !== undefined) patch.class_year     = class_year;
  if (jersey_number  !== undefined) patch.jersey_number  = jersey_number;
  if (grad_year      !== undefined) patch.grad_year      = grad_year;
  if (profile_photo  !== undefined) patch.profile_photo  = profile_photo;
  if (goal_cents     !== undefined) patch.goal_cents     = goal_cents;
  if (contact_phone  !== undefined) patch.contact_phone  = contact_phone;
  if (contact_email  !== undefined) patch.contact_email  = contact_email;

  const res = await fetch(
    `${BASE}/rest/v1/athletes?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify(patch),
    },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to update athlete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { slug, id } = await params;
  const actor = await getTeamActor(slug);
  if (!isStaff(actor)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHeadCoach(actor)) {
    return NextResponse.json({ error: "Only head coaches can delete athletes." }, { status: 403 });
  }

  // isHeadCoach is true only for "coach" (role=head_coach) or
  // "platform_admin" — TypeScript can't infer that through the function
  // boundary; narrowed explicitly for toAuditActor() below.
  if (actor.kind !== "coach" && actor.kind !== "platform_admin") {
    return NextResponse.json({ error: "Only head coaches can delete athletes." }, { status: 403 });
  }

  // Read the athlete first (for the audit summary's name, and to confirm
  // it actually belongs to this campaign) before deleting — same campaign
  // scoping the old raw DELETE query enforced.
  const athlete = await validateAthleteForCampaign(id, slug);
  if (!athlete) return NextResponse.json({ error: "Athlete not found" }, { status: 404 });

  // G3A review correction: messaging access (any active group
  // participant/auto-included family identity tied to this athlete's
  // roster assignments) is now cleaned up BEFORE the athlete row itself is
  // deleted — see deleteAthleteWithMessagingCleanup()'s own comment for why
  // the ordering matters and what happens if cleanup fails.
  const result = await deleteAthleteWithMessagingCleanup(id, slug);
  if (!result.ok) {
    return NextResponse.json({ error: "Failed to delete athlete" }, { status: 500 });
  }

  const athleteName = athlete.name;

  logAuditEvent({
    actor: toAuditActor(actor),
    action: "athlete.deleted",
    entity_type: "athlete",
    entity_id: id,
    campaign_slug: slug,
    summary: `Deleted athlete "${athleteName}" from ${slug}`,
    ip_address: ipOf(req),
    user_agent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
