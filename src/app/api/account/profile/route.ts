import { NextRequest, NextResponse } from "next/server";
import { getAccountSession } from "@/lib/accountSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function serviceHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export async function GET() {
  const session = await getAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    name:              session.name,
    email:             session.email,
    profile_photo_url: session.profile_photo_url,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : null;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "name too long" }, { status: 400 });

  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(session.id)}`,
    {
      method:  "PATCH",
      headers: serviceHeaders({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ name }),
    },
  );

  if (!res.ok) return NextResponse.json({ error: "Failed to update name" }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}
