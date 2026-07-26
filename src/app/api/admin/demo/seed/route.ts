/**
 * POST /api/admin/demo/seed
 *
 * Idempotent. Safe to call on first setup and on every reset.
 *
 * What it does:
 *  1. Creates the demo campaign (elf-demo) if it doesn't exist
 *  2. Ensures demo coach, athlete, and parent accounts exist
 *  3. Clears transactional data (athletes, donations, sponsors, fund_uses, team_members)
 *  4. Re-seeds from the football template
 *  5. Links athlete/parent elf_accounts to the campaign via team_members
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { createCampaignCore, supabaseHeaders } from "@/lib/campaignCreate";
import { generateAccountSalt, hashAccountPassword } from "@/lib/accountAuth";
import { generateMemberSalt } from "@/lib/memberAuth";
import { logAuditEvent, ipOf } from "@/lib/auditLog";
import { DEMO_TEMPLATES, DemoTemplate } from "@/lib/demoTemplates";
import {
  DEMO_SLUG,
  DEMO_COACH_EMAIL,
  DEMO_ATHLETE_EMAIL,
  DEMO_PARENT_EMAIL,
  DEMO_TEMPLATE_ID,
} from "@/lib/demoPersonas";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  return supabaseHeaders(extra);
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function campaignExists(): Promise<boolean> {
  const res = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(DEMO_SLUG)}&select=campaign_slug&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows: unknown[] = res.ok ? await res.json() : [];
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureElfAccount(
  email: string,
  name: string,
  password: string,
): Promise<{ id: string; salt: string }> {
  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?email=eq.${encodeURIComponent(email)}&select=id,salt&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const rows: { id: string; salt: string }[] = res.ok ? await res.json() : [];
  if (rows[0]) return rows[0];

  const salt = generateAccountSalt();
  const createRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({ email, name, password_hash: hashAccountPassword(password, salt), salt }),
  });
  const created: { id: string; salt: string }[] = createRes.ok ? await createRes.json() : [];
  if (!created[0]) throw new Error(`Failed to create elf_account for ${email}`);
  return created[0];
}

async function upsertTeamMember(
  accountId: string,
  name:      string,
  role:      "athlete" | "parent",
  athleteId: string | null,
): Promise<void> {
  const res = await fetch(
    `${BASE}/rest/v1/team_members?account_id=eq.${encodeURIComponent(accountId)}&campaign_slug=eq.${encodeURIComponent(DEMO_SLUG)}&select=id&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const existing: { id: string }[] = res.ok ? await res.json() : [];

  if (existing[0]) {
    // Update athlete_id (may have changed after reseed)
    await fetch(
      `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(existing[0].id)}`,
      { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ athlete_id: athleteId }) },
    );
  } else {
    const salt = generateMemberSalt();
    await fetch(`${BASE}/rest/v1/team_members`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ campaign_slug: DEMO_SLUG, account_id: accountId, name, role, salt, athlete_id: athleteId }),
    });
  }
}

async function clearTransactionalData(): Promise<void> {
  const enc = encodeURIComponent(DEMO_SLUG);
  await Promise.all([
    fetch(`${BASE}/rest/v1/donations?campaign_slug=eq.${enc}`,  { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/sponsors?campaign_slug=eq.${enc}`,   { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
    fetch(`${BASE}/rest/v1/fund_uses?campaign_slug=eq.${enc}`,  { method: "DELETE", headers: h({ Prefer: "return=minimal" }) }),
  ]);
  // team_members → athletes (FK order)
  await fetch(`${BASE}/rest/v1/team_members?campaign_slug=eq.${enc}`,  { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
  await fetch(`${BASE}/rest/v1/athletes?campaign_slug=eq.${enc}`,      { method: "DELETE", headers: h({ Prefer: "return=minimal" }) });
}

async function seedFromTemplate(template: DemoTemplate): Promise<string | null> {
  const now      = Date.now();
  const spreadMs = 14 * 86400000 / Math.max(template.donations.length, 1);

  // Seed athletes + sponsors + fund_uses in parallel
  const [athleteRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/athletes`, {
      method:  "POST",
      headers: h({ Prefer: "return=representation" }),
      body:    JSON.stringify(template.athletes.map(a => ({ campaign_slug: DEMO_SLUG, name: a.name, event: a.event }))),
    }),
    fetch(`${BASE}/rest/v1/sponsors`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify(template.sponsors.map(s => ({ campaign_slug: DEMO_SLUG, name: s.name, url: s.url, tier: s.tier }))),
    }),
    fetch(`${BASE}/rest/v1/fund_uses`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify(template.fund_uses.map(fu => ({ campaign_slug: DEMO_SLUG, title: fu.title, description: fu.description, icon: fu.icon, sort_order: fu.sort_order }))),
    }),
  ]);

  // Get first athlete ID for team_member linking
  const seededAthletes: { id: string }[] = athleteRes.ok ? await athleteRes.json() : [];
  const firstAthleteId = seededAthletes[0]?.id ?? null;

  // Donations (spread over past 14 days)
  await fetch(`${BASE}/rest/v1/donations`, {
    method:  "POST",
    headers: h({ Prefer: "return=minimal" }),
    body:    JSON.stringify(template.donations.map((d, i) => ({
      campaign_slug:     DEMO_SLUG,
      donor_name:        d.donor_name,
      amount_cents:      d.amount_cents,
      athlete_name:      d.athlete_name,
      stripe_session_id: `demo_cs_elf_demo_${String(i).padStart(3, "0")}`,
      donation_message:  d.message,
      created_at:        new Date(now - (template.donations.length - 1 - i) * spreadMs).toISOString(),
    }))),
  });

  return firstAthleteId;
}

// ─── handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const template = DEMO_TEMPLATES.find(t => t.id === DEMO_TEMPLATE_ID);
  if (!template) return NextResponse.json({ error: "Demo template not found." }, { status: 500 });

  const created: string[] = [];
  const deadline = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10); // 1 year

  // 1. Create campaign if needed
  const exists = await campaignExists();
  if (!exists) {
    const demoSuffix = Date.now().toString(36).slice(-6);
    const coachEmail = DEMO_COACH_EMAIL;

    const result = await createCampaignCore({
      slug:            DEMO_SLUG,
      coach_mode: "new",
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
      coach_name:      template.coach_name,
      coach_email:     coachEmail,
      coach_password:  `DemoELF${demoSuffix}!`,
      contact_goal:    0,
      show_leaderboard:      true,
      show_program_identity: true,
      show_share_section:    true,
      show_fund_uses:        true,
      show_recent_donations: true,
      show_sponsors:         true,
      show_donation_card:    true,
      layout_variant:        "classic",
    });

    if (!result.ok) {
      return NextResponse.json({ error: `Failed to create demo campaign: ${result.error}` }, { status: result.status });
    }

    // Tag as demo
    await fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(DEMO_SLUG)}`,
      { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify({ is_demo: true, demo_template: DEMO_TEMPLATE_ID }) },
    );

    created.push("campaign");
  }

  // 2. Ensure demo elf_accounts (athlete + parent)
  const [athleteAcct, parentAcct] = await Promise.all([
    ensureElfAccount(DEMO_ATHLETE_EMAIL, "Demo Athlete",  "DemoELFAthlete2024!"),
    ensureElfAccount(DEMO_PARENT_EMAIL,  "Demo Parent",   "DemoELFParent2024!"),
  ]);
  if (!exists) created.push("demo_accounts");

  // 3. Clear and reseed transactional data
  await clearTransactionalData();
  const firstAthleteId = await seedFromTemplate(template);

  // 4. Re-link athlete + parent to campaign via team_members
  await Promise.all([
    upsertTeamMember(athleteAcct.id, "Demo Athlete", "athlete", firstAthleteId),
    upsertTeamMember(parentAcct.id,  "Demo Parent",  "parent",  firstAthleteId),
  ]);

  logAuditEvent({
    action:        "demo.reset",
    entity_type:   "campaign",
    entity_id:     DEMO_SLUG,
    campaign_slug: DEMO_SLUG,
    summary:       `Demo environment ${exists ? "reset" : "initialized"} from template "${DEMO_TEMPLATE_ID}"`,
    new_value:     { templateId: DEMO_TEMPLATE_ID, created },
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, created, reset: ["athletes", "donations", "sponsors", "fund_uses", "team_members"] });
}
