import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { organizationIdParam } from "@/lib/organizationCenter";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function authed() {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

/** The school, if it exists (never "the first school"). */
async function organizationExists(orgId: string): Promise<boolean> {
  const res = await fetch(`${BASE}/rest/v1/organizations?id=eq.${orgId}&select=id&limit=1`, { headers: h(), cache: "no-store" });
  if (!res.ok) return false;
  return (await res.json()).length > 0;
}

// GET /api/admin/organization/templates?organizationId=<uuid>
export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = organizationIdParam(req.nextUrl.searchParams.get("organizationId"));
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });

  const res = await fetch(
    `${BASE}/rest/v1/communication_templates?organization_id=eq.${orgId}&select=*&order=type.asc`,
    { headers: h(), cache: "no-store" },
  );
  return NextResponse.json(res.ok ? await res.json() : []);
}

// PUT /api/admin/organization/templates   { organizationId, type, subject, body_text }
export async function PUT(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { organizationId?: unknown; type?: unknown; subject?: unknown; body_text?: unknown } | null;
  const orgId = organizationIdParam(body?.organizationId);
  if (!orgId) return NextResponse.json({ error: "Choose a school." }, { status: 400 });
  const type = typeof body?.type === "string" ? body.type.trim() : "";
  if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });
  if (!await organizationExists(orgId)) return NextResponse.json({ error: "School not found." }, { status: 404 });

  // Upsert via merge-duplicates on (organization_id, type) UNIQUE constraint
  const res = await fetch(`${BASE}/rest/v1/communication_templates`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation,resolution=merge-duplicates" }),
    body:    JSON.stringify({
      organization_id: orgId,
      type,
      subject:   typeof body?.subject === "string" ? body.subject : "",
      body_text: typeof body?.body_text === "string" ? body.body_text : "",
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) return NextResponse.json({ error: "Save failed." }, { status: 500 });
  const rows = await res.json();
  return NextResponse.json(rows[0] ?? { ok: true });
}
