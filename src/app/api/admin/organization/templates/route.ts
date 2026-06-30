import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

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

async function getFirstOrgId(): Promise<string | null> {
  const res = await fetch(`${BASE}/rest/v1/organizations?select=id&limit=1`, {
    headers: h(), cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return (rows[0] as { id: string } | undefined)?.id ?? null;
}

export async function GET(_req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getFirstOrgId();
  if (!orgId) return NextResponse.json([]);

  const res = await fetch(
    `${BASE}/rest/v1/communication_templates?organization_id=eq.${orgId}&select=*&order=type.asc`,
    { headers: h(), cache: "no-store" },
  );
  return NextResponse.json(res.ok ? await res.json() : []);
}

export async function PUT(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, subject, body_text } = await req.json() as {
    type: string; subject: string; body_text: string;
  };

  if (!type) return NextResponse.json({ error: "type is required" }, { status: 400 });

  const orgId = await getFirstOrgId();
  if (!orgId) return NextResponse.json({ error: "Organization not found. Save the organization profile first." }, { status: 404 });

  // Upsert via merge-duplicates on (organization_id, type) UNIQUE constraint
  const res = await fetch(`${BASE}/rest/v1/communication_templates`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation,resolution=merge-duplicates" }),
    body:    JSON.stringify({
      organization_id: orgId,
      type,
      subject:   subject   ?? "",
      body_text: body_text ?? "",
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Save failed: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json(rows[0] ?? { ok: true });
}
