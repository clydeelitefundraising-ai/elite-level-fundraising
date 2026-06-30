import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function GET(req: NextRequest) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase() ?? "";

  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  if (slug.length < 3 || !SLUG_RE.test(slug)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=campaign_slug&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
  );

  if (!res.ok) return NextResponse.json({ error: "DB error" }, { status: 500 });

  const rows = await res.json();
  return NextResponse.json({ available: !Array.isArray(rows) || rows.length === 0 });
}
