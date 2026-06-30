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

  const res = await fetch(`${BASE}/rest/v1/organizations?select=*&limit=1`, {
    headers: h(), cache: "no-store",
  });
  if (!res.ok) return NextResponse.json({ org: null });
  const rows = await res.json();
  return NextResponse.json({ org: rows[0] ?? null });
}

export async function PUT(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  // Strip immutable fields
  const { id: _id, created_at: _ca, slug: _slug, ...patch } = body;

  const orgId = await getFirstOrgId();

  if (orgId) {
    const res = await fetch(`${BASE}/rest/v1/organizations?id=eq.${orgId}`, {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const msg = await res.text();
      return NextResponse.json({ error: `Update failed: ${msg}` }, { status: 500 });
    }
  } else {
    // Seed row missing — recreate it
    const res = await fetch(`${BASE}/rest/v1/organizations`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ slug: "default", ...patch }),
    });
    if (!res.ok) {
      const msg = await res.text();
      return NextResponse.json({ error: `Create failed: ${msg}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
