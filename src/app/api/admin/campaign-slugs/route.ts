import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getAllCampaignSlugs } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET() {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slugs = await getAllCampaignSlugs();
  return NextResponse.json(slugs);
}
