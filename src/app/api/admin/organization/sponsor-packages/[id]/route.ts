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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, tier, description, amount_cents, sort_order } = await req.json() as {
    name?: string; tier?: string; description?: string; amount_cents?: number; sort_order?: number;
  };

  const res = await fetch(`${BASE}/rest/v1/sponsor_packages?id=eq.${encodeURIComponent(id)}`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify({ name, tier, description, amount_cents, sort_order }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const res = await fetch(`${BASE}/rest/v1/sponsor_packages?id=eq.${encodeURIComponent(id)}`, {
    method:  "DELETE",
    headers: h({ Prefer: "return=minimal" }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Delete failed: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
