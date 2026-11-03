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

/** The school, if it exists (never "the first school"). */
async function organizationExists(orgId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/rest/v1/organizations?id=eq.${orgId}&select=id&limit=1`, { headers: h(), cache: "no-store" });
  if (!res.ok) return false;
  return (await res.json()).length > 0;
}

// GET /api/admin/organization/sponsor-packages?organizationId=<uuid>
export async function GET(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const orgId = organizationIdParam(req.nextUrl.searchParams.get("organizationId"));
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });

  const res = await fetch(
    `${BASE}/rest/v1/sponsor_packages?organization_id=eq.${orgId}&select=*&order=sort_order.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  return NextResponse.json(res.ok ? await res.json() : []);
}

// POST /api/admin/organization/sponsor-packages   { organizationId, name, tier, description, amount_cents, sort_order }
export async function POST(req: NextRequest) {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  const body = await req.json().catch(() => null) as {
    organizationId?: unknown; name?: string; tier?: string; description?: string; amount_cents?: number; sort_order?: number;
  } | null;
  const orgId = organizationIdParam(body?.organizationId);
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });
  const { name, tier, description, amount_cents, sort_order } = body ?? {};
  if (typeof name !== "string" || !name.trim()) return NextResponse.json({ error: "Package name is required." }, { status: 400 });
  if (!await organizationExists(orgId)) return NextResponse.json({ error: "School not found." }, { status: 404 });

  const res = await fetch(`${BASE}/rest/v1/sponsor_packages`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      organization_id: orgId,
      name:         name.trim(),
      tier:         tier         ?? "gold",
      description:  description  ?? "",
      amount_cents: amount_cents ?? 0,
      sort_order:   sort_order   ?? 0,
    }),
  });

  if (!res.ok) return NextResponse.json({ error: "Failed to create package." }, { status: 500 });
  const rows = await res.json();
  logAuditEvent({
    actor:       adminAuditActor(access),
    action:      "sponsor_package.created",
    entity_type: "sponsor_packages",
    entity_id:   String(rows[0]?.id ?? ""),
    summary:     `Sponsor package "${name.trim()}" created`,
    new_value:   { organization_id: orgId, name: name.trim(), tier: tier ?? "gold", amount_cents: amount_cents ?? 0 },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });
  return NextResponse.json(rows[0]);
}
