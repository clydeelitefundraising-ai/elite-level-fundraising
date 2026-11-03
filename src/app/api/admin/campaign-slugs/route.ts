import { NextResponse } from "next/server";
import { getAllCampaignSlugs } from "@/lib/supabase";
import { getAdminAccess, adminUnauthorized } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();
  const slugs = await getAllCampaignSlugs();
  return NextResponse.json(slugs);
}
