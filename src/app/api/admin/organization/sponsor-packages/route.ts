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
    `${BASE}/rest/v1/sponsor_packages?organization_id=eq.${orgId}&select=*&order=sort_order.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  return NextResponse.json(res.ok ? await res.json() : []);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, tier, description, amount_cents, sort_order } = await req.json() as {
    name: string; tier?: string; description?: string; amount_cents?: number; sort_order?: number;
  };

  if (!name?.trim()) return NextResponse.json({ error: "Package name is required." }, { status: 400 });

  const orgId = await getFirstOrgId();
  if (!orgId) return NextResponse.json({ error: "Organization not found. Save the organization profile first." }, { status: 404 });

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

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create package: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  return NextResponse.json(rows[0]);
}
