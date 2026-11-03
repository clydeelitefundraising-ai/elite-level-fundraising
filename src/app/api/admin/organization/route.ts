import { NextRequest, NextResponse } from "next/server";
import { getAdminAccess, adminUnauthorized, adminAuditActor } from "@/lib/adminAccess";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { organizationIdParam, pickEditableOrgFields } from "@/lib/organizationCenter";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Organization Center — one EXPLICIT school per request (organizationId).
// The old "first organizations row" lookup (limit=1) is gone: with many
// schools it edited an arbitrary one. Unknown or missing ids are refused;
// this route never creates a school.

// GET /api/admin/organization?organizationId=<uuid>
export async function GET(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const orgId = organizationIdParam(req.nextUrl.searchParams.get("organizationId"));
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });

  const res = await fetch(`${BASE}/rest/v1/organizations?id=eq.${orgId}&select=*&limit=1`, { headers: h(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Couldn't load the school." }, { status: 500 });
  const rows = await res.json();
  if (!rows[0]) return NextResponse.json({ error: "School not found." }, { status: 404 });
  return NextResponse.json({ org: rows[0] });
}

// PUT /api/admin/organization   { organizationId, ...profile or defaults fields }
export async function PUT(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const orgId = organizationIdParam(body?.organizationId);
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });
  const picked = pickEditableOrgFields(body);
  if (!picked.ok) return NextResponse.json({ error: picked.error }, { status: 400 });

  const res = await fetch(`${BASE}/rest/v1/organizations?id=eq.${orgId}&select=id,school_name`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({ ...picked.patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) return NextResponse.json({ error: "Save failed." }, { status: 500 });
  const rows = await res.json() as { id: string; school_name: string }[];
  if (!rows[0]) return NextResponse.json({ error: "School not found." }, { status: 404 });

  logAuditEvent({
    actor:       adminAuditActor(access),
    action:      "organization.update",
    entity_type: "organization",
    entity_id:   orgId,
    summary:     `Organization Center: updated ${picked.fields.length} field${picked.fields.length === 1 ? "" : "s"} for "${rows[0].school_name}"`,
    new_value:   { fields: picked.fields },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
