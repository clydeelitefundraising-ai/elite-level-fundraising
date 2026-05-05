import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getFundUses, addFundUse } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug") ?? "";
  if (!slug) return NextResponse.json([]);
  const items = await getFundUses(slug);
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { campaign_slug, title, description, icon, sort_order } = await req.json();
  const item = await addFundUse({ campaign_slug, title, description, icon: icon || "💰", sort_order: sort_order ?? 0 });
  return NextResponse.json(item);
}
