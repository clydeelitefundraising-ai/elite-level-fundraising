import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getSponsors, addSponsor } from "@/lib/supabase";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/auditLog";

const DEFAULT_SLUG = "paradise-valley-track-field-live";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug") ?? DEFAULT_SLUG;
  const sponsors = await getSponsors(slug);
  return NextResponse.json(sponsors);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { campaign_slug, name, url, tier } = await req.json();
  const slug = campaign_slug ?? DEFAULT_SLUG;
  if (!name?.trim() || !url?.trim() || !["gold", "silver", "bronze"].includes(tier)) {
    return NextResponse.json({ error: "name, url, and tier (gold/silver/bronze) are required" }, { status: 400 });
  }
  const sponsor = await addSponsor({ campaign_slug: slug, name: name.trim(), url: url.trim(), tier });
  logAuditEvent({
    actor: ADMIN_TOOL_ACTOR,
    action:        "sponsor.added",
    entity_type:   "sponsor",
    entity_id:     sponsor?.id ?? undefined,
    campaign_slug: slug,
    summary:       `Added ${tier} sponsor "${name.trim()}" to ${slug}`,
    new_value:     { name: name.trim(), url: url.trim(), tier, campaign_slug: slug },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });
  return NextResponse.json(sponsor);
}
