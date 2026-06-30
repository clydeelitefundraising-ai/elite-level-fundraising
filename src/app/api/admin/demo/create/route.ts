import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { createCampaignCore, supabaseHeaders } from "@/lib/campaignCreate";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { DEMO_TEMPLATES, DemoTemplate } from "@/lib/demoTemplates";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  return supabaseHeaders(extra);
}

async function findAvailableSlug(base: string): Promise<string> {
  for (let i = 0; i <= 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const res = await fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(candidate)}&select=campaign_slug&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    const rows: unknown[] = res.ok ? await res.json() : [];
    if (!Array.isArray(rows) || rows.length === 0) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
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

  const { templateId } = await req.json() as { templateId?: string };
  const template = DEMO_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const slug = await findAvailableSlug(template.default_slug);
  const deadline = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const demoSuffix = Date.now().toString(36).slice(-6);
  const coach_email = `demo.${template.id}.${demoSuffix}@elf-demo.test`;

  const result = await createCampaignCore({
    slug,
    school_name:     template.school_name,
    sport_name:      template.sport,
    mascot:          template.mascot,
    season:          template.season,
    location:        template.location,
    primary_color:   template.primary_color,
    secondary_color: template.secondary_color,
    logo_url:        "",
    goal_cents:      template.goal_cents,
    deadline,
    default_athlete_goal_cents: null,
    coach_name:     template.coach_name,
    coach_email,
    coach_password: "DemoELF2024!",
    contact_goal:   0,
    show_leaderboard:        true,
    show_program_identity:   true,
    show_share_section:      true,
    show_fund_uses:          true,
    show_recent_donations:   true,
    show_sponsors:           true,
    show_donation_card:      true,
    layout_variant:          template.layout_variant,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Tag as demo and store template ID
  await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ is_demo: true, demo_template: template.id }),
    },
  );

  await seedDemoData(slug, template);

  logAuditEvent({
    action:       "demo.created",
    entity_type:  "campaign",
    entity_id:    slug,
    campaign_slug: slug,
    summary:      `Created demo campaign "${template.school_name} ${template.sport}" (${slug})`,
    new_value:    { templateId: template.id, slug, school: template.school_name, sport: template.sport },
    ip_address:   ipOf(req),
    user_agent:   req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, slug, school_name: template.school_name, sport: template.sport });
}
