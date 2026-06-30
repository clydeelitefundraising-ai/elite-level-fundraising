import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getFundUses, addFundUse } from "@/lib/supabase";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

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
  logAuditEvent({
    action:        "fund_use.added",
    entity_type:   "fund_use",
    entity_id:     item?.id ?? undefined,
    campaign_slug: campaign_slug ?? null,
    summary:       `Added fund use "${title}" to ${campaign_slug}`,
    new_value:     { title, description, icon: icon || "💰", campaign_slug },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });
  return NextResponse.json(item);
}
