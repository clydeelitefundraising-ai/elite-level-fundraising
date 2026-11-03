import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { organizationIdParam } from "@/lib/organizationCenter";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// A package is changed or removed only within the school it belongs to:
// both the package id AND ?organizationId=<uuid> must match, so a package
// id can never reach another school's packages.
function scope(id: string, orgId: string) {
  return `id=eq.${encodeURIComponent(id)}&organization_id=eq.${orgId}`;
}

// PUT /api/admin/organization/sponsor-packages/<id>?organizationId=<uuid>
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  const { id } = await params;
  const orgId = organizationIdParam(req.nextUrl.searchParams.get("organizationId"));
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });
  const { name, tier, description, amount_cents, sort_order } = (await req.json().catch(() => ({}))) as {
    name?: string; tier?: string; description?: string; amount_cents?: number; sort_order?: number;
  };

  const res = await fetch(`${BASE}/rest/v1/sponsor_packages?${scope(id, orgId)}&select=id`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({ name, tier, description, amount_cents, sort_order }),
  });

  if (!res.ok) return NextResponse.json({ error: "Update failed." }, { status: 500 });
  if ((await res.json()).length === 0) return NextResponse.json({ error: "Package not found for this school." }, { status: 404 });
  logAuditEvent({
    actor:       adminAuditActor(access),
    action:      "sponsor_package.updated",
    entity_type: "sponsor_packages",
    entity_id:   id,
    summary:     "Sponsor package updated",
    new_value:   { organization_id: orgId, name, tier, amount_cents, sort_order },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/organization/sponsor-packages/<id>?organizationId=<uuid>
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  const { id } = await params;
  const orgId = organizationIdParam(req.nextUrl.searchParams.get("organizationId"));
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });

  const res = await fetch(`${BASE}/rest/v1/sponsor_packages?${scope(id, orgId)}&select=id`, {
    method:  "DELETE",
    headers: h({ Prefer: "return=representation" }),
  });

  if (!res.ok) return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  if ((await res.json()).length === 0) return NextResponse.json({ error: "Package not found for this school." }, { status: 404 });
  logAuditEvent({
    actor:       adminAuditActor(access),
    action:      "sponsor_package.deleted",
    entity_type: "sponsor_packages",
    entity_id:   id,
    summary:     "Sponsor package deleted",
    new_value:   { organization_id: orgId },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
