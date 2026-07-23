import { NextRequest, NextResponse } from "next/server";
import { requireAdminCampaign, assertOwnedByCampaign } from "@/lib/adminCampaignAuth";
import { updateAthlete, deleteAthlete } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  if (!(await assertOwnedByCampaign("athletes", id, slug))) {
    return NextResponse.json({ error: "Athlete not found for this campaign." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.name?.trim() || !body?.class_year?.trim()) {
    return NextResponse.json({ error: "name and class are required" }, { status: 400 });
  }
  const eventValue = body.event?.trim() || null;

  try {
    await updateAthlete(id, { name: body.name.trim(), event: eventValue, class_year: body.class_year.trim() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to update athlete." }, { status: 500 });
  }

  logAuditEvent({
    action:      "athlete.updated",
    entity_type: "athlete",
    entity_id:   id,
    campaign_slug: slug,
    summary:     `Updated athlete ${id} on ${slug} (via admin console)`,
    new_value:   { name: body.name.trim(), event: eventValue, class_year: body.class_year.trim() },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  if (!(await assertOwnedByCampaign("athletes", id, slug))) {
    return NextResponse.json({ error: "Athlete not found for this campaign." }, { status: 404 });
  }

  // No cascading guard here — matches the legacy admin surface's existing
  // delete behavior. Donation records store their own athlete_name/amount_cents
  // snapshot independent of the athletes row, so historical fundraiser totals
  // are unaffected; a deleted athlete's donations simply lose their live
  // athlete_id linkage, same as today.
  await deleteAthlete(id);

  logAuditEvent({
    action:      "athlete.deleted",
    entity_type: "athlete",
    entity_id:   id,
    campaign_slug: slug,
    summary:     `Deleted athlete ${id} from ${slug} (via admin console)`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
