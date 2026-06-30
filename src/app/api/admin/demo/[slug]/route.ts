import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { supabaseHeaders } from "@/lib/campaignCreate";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  return supabaseHeaders(extra);
}

async function deleteDemoCampaign(slug: string): Promise<void> {
  const enc = encodeURIComponent(slug);

  // Get coach IDs so we can delete their invite tokens
  const coachRes = await fetch(
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${enc}&select=id`,
    { headers: h(), cache: "no-store" },
  );
  const coaches: { id: string }[] = coachRes.ok ? await coachRes.json() : [];

  if (coaches.length > 0) {
    const ids = coaches.map(c => c.id).join(",");
    await fetch(
      `${BASE}/rest/v1/coach_invite_tokens?coach_id=in.(${ids})`,
      { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
    ).catch(() => {});
  }

  // Delete child records (parallel where possible)
  await Promise.all([
    fetch(`${BASE}/rest/v1/donations?campaign_slug=eq.${enc}`,                 { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/sponsors?campaign_slug=eq.${enc}`,                  { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/fund_uses?campaign_slug=eq.${enc}`,                 { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${enc}`,      { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${enc}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/calendar_events?campaign_slug=eq.${enc}`,           { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }).catch(() => {}),
    fetch(`${BASE}/rest/v1/team_products?campaign_slug=eq.${enc}`,             { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }).catch(() => {}),
    fetch(`${BASE}/rest/v1/team_join_codes?campaign_slug=eq.${enc}`,           { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }).catch(() => {}),
  ]);

  // team_members → athletes (FK order)
  await fetch(`${BASE}/rest/v1/team_members?campaign_slug=eq.${enc}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  await fetch(`${BASE}/rest/v1/athletes?campaign_slug=eq.${enc}`,     { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  await fetch(`${BASE}/rest/v1/team_coaches?campaign_slug=eq.${enc}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });

  // Campaign settings last
  await fetch(`${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${enc}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  // Safety check — must be a demo campaign
  const checkRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=campaign_slug,is_demo,school_name,sport_name&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows: { campaign_slug: string; is_demo: boolean; school_name: string; sport_name: string }[] =
    checkRes.ok ? await checkRes.json() : [];
  const campaign = rows[0];

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.is_demo) {
    return NextResponse.json(
      { error: "This is not a demo campaign. Delete refused to protect live data." },
      { status: 403 },
    );
  }

  await deleteDemoCampaign(slug);

  logAuditEvent({
    action:        "demo.deleted",
    entity_type:   "campaign",
    entity_id:     slug,
    campaign_slug: slug,
    summary:       `Deleted demo campaign "${campaign.school_name} ${campaign.sport_name}" (${slug})`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
