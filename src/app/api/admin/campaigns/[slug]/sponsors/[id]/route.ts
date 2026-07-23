import { NextRequest, NextResponse } from "next/server";
import { requireAdminCampaign, assertOwnedByCampaign } from "@/lib/adminCampaignAuth";
import { updateSponsor, deleteSponsor } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

const VALID_TIERS = ["title", "platinum", "gold", "silver", "bronze", "community_partner"];

type RouteCtx = { params: Promise<{ slug: string; id: string }> };

export async function PUT(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  if (!(await assertOwnedByCampaign("sponsors", id, slug))) {
    return NextResponse.json({ error: "Sponsor not found for this campaign." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if (body.tier !== undefined && !VALID_TIERS.includes(body.tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const passthrough = (key: string, transform?: (v: unknown) => unknown) => {
    if (body[key] !== undefined) patch[key] = transform ? transform(body[key]) : body[key];
  };
  passthrough("name", v => typeof v === "string" ? v.trim() : v);
  passthrough("url", v => typeof v === "string" ? v.trim() : v);
  passthrough("tier");
  passthrough("logo_url", v => (typeof v === "string" ? v.trim() : v) || null);
  passthrough("description", v => (typeof v === "string" ? v.trim() : v) || null);
  passthrough("visible");
  passthrough("display_order");
  passthrough("sponsorship_amount_cents");
  passthrough("contact_name", v => (typeof v === "string" ? v.trim() : v) || null);
  passthrough("contact_email", v => (typeof v === "string" ? v.trim() : v) || null);
  passthrough("contact_phone", v => (typeof v === "string" ? v.trim() : v) || null);

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  await updateSponsor(id, patch);

  logAuditEvent({
    action:      "sponsor.updated",
    entity_type: "sponsor",
    entity_id:   id,
    campaign_slug: slug,
    summary:     `Updated sponsor ${id} on ${slug} (via admin console)`,
    new_value:   patch,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  const { slug, id } = await params;
  const auth = await requireAdminCampaign(slug);
  if (!auth.ok) return auth.response;

  if (!(await assertOwnedByCampaign("sponsors", id, slug))) {
    return NextResponse.json({ error: "Sponsor not found for this campaign." }, { status: 404 });
  }

  await deleteSponsor(id);

  logAuditEvent({
    action:      "sponsor.deleted",
    entity_type: "sponsor",
    entity_id:   id,
    campaign_slug: slug,
    summary:     `Deleted sponsor ${id} from ${slug} (via admin console)`,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
