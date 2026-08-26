import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { supabaseHeaders } from "@/lib/campaignCreate";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/auditLog";
import { DEMO_TEMPLATES, DemoTemplate } from "@/lib/demoTemplates";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  return supabaseHeaders(extra);
}

async function clearDemoChildData(slug: string): Promise<void> {
  const enc = encodeURIComponent(slug);
  // Delete child records that don't have inter-dependencies (parallel)
  await Promise.all([
    fetch(`${BASE}/rest/v1/donations?campaign_slug=eq.${enc}`,                 { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/sponsors?campaign_slug=eq.${enc}`,                  { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/fund_uses?campaign_slug=eq.${enc}`,                 { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${enc}`,      { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${enc}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
  ]);
  // team_members before athletes (FK dependency)
  await fetch(`${BASE}/rest/v1/team_members?campaign_slug=eq.${enc}`, { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  await fetch(`${BASE}/rest/v1/athletes?campaign_slug=eq.${enc}`,     { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
}

async function seedDemoData(slug: string, template: DemoTemplate): Promise<void> {
  const now = Date.now();
  const spreadMs = 14 * 86400000 / Math.max(template.donations.length, 1);

  await Promise.all([
    fetch(`${BASE}/rest/v1/athletes`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify(template.athletes.map(a => ({ campaign_slug: slug, name: a.name, event: a.event }))),
    }),
    fetch(`${BASE}/rest/v1/sponsors`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify(template.sponsors.map(s => ({ campaign_slug: slug, name: s.name, url: s.url, tier: s.tier }))),
    }),
    fetch(`${BASE}/rest/v1/fund_uses`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify(template.fund_uses.map(fu => ({
        campaign_slug: slug, title: fu.title, description: fu.description, icon: fu.icon, sort_order: fu.sort_order,
      }))),
    }),
  ]);

  await fetch(`${BASE}/rest/v1/donations`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify(template.donations.map((d, i) => ({
      campaign_slug:     slug,
      donor_name:        d.donor_name,
      amount_cents:      d.amount_cents,
      athlete_name:      d.athlete_name,
      stripe_session_id: `demo_cs_${slug.replace(/-/g, "_")}_${String(i).padStart(3, "0")}`,
      donation_message:  d.message,
      created_at:        new Date(now - (template.donations.length - 1 - i) * spreadMs).toISOString(),
    }))),
  });
}

export async function POST(req: NextRequest) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await req.json() as { slug?: string };
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const campaignRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=campaign_slug,is_demo,demo_template,school_name,sport_name&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows: { campaign_slug: string; is_demo: boolean; demo_template: string | null; school_name: string; sport_name: string }[] =
    campaignRes.ok ? await campaignRes.json() : [];
  const campaign = rows[0];

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!campaign.is_demo) {
    return NextResponse.json({ error: "This campaign is not a demo campaign. Reset refused to protect live data." }, { status: 403 });
  }

  const template = DEMO_TEMPLATES.find(t => t.id === campaign.demo_template);
  if (!template) {
    return NextResponse.json({ error: `Demo template "${campaign.demo_template}" not found.` }, { status: 404 });
  }

  await clearDemoChildData(slug);
  await seedDemoData(slug, template);

  logAuditEvent({
    actor: ADMIN_TOOL_ACTOR,
    action:        "demo.reset",
    entity_type:   "campaign",
    entity_id:     slug,
    campaign_slug: slug,
    summary:       `Reset demo campaign "${campaign.school_name} ${campaign.sport_name}" (${slug})`,
    new_value:     { templateId: template.id },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
