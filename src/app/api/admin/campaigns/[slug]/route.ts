import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

type RouteCtx = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;

  const [settingsRes, donationsRes, athletesRes, membersRes, coachesRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&limit=1`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/donations?campaign_slug=eq.${encodeURIComponent(slug)}&select=amount_cents`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,event`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,role,athlete_id`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role`, { headers: h(), cache: "no-store" }),
  ]);

  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  if (!settingsRows.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const settings = settingsRows[0];
  const donations: { amount_cents: number }[] = donationsRes.ok ? await donationsRes.json() : [];
  const athletes: { id: string; name: string; event: string }[] = athletesRes.ok ? await athletesRes.json() : [];
  const members: { id: string; role: string; athlete_id: string | null }[] = membersRes.ok ? await membersRes.json() : [];
  const coaches: { id: string; name: string; role: string }[] = coachesRes.ok ? await coachesRes.json() : [];

  const raisedCents        = donations.reduce((s, d) => s + (d.amount_cents || 0), 0);
  const donorCount         = donations.length;
  const athleteCount       = athletes.length;
  const athleteAccounts    = members.filter(m => m.role === "athlete").length;
  const parentAccounts     = members.filter(m => m.role === "parent").length;
  const memberCount        = members.length;

  return NextResponse.json({
    ...settings,
    raised_cents:         raisedCents,
    donor_count:          donorCount,
    athlete_count:        athleteCount,
    athlete_account_count: athleteAccounts,
    parent_account_count: parentAccounts,
    member_count:         memberCount,
    coach_count:          coaches.length,
    athletes,
    coaches,
  });
}

// Fields confirmed in campaign_settings schema
const KNOWN_FIELDS = new Set([
  "school_name", "sport_name", "mascot", "season", "location", "logo_url",
  "goal_cents", "deadline", "default_athlete_goal_cents",
  "primary_color", "secondary_color", "layout_variant",
  "external_store_url", "store_provider",
  "archived",
  "show_leaderboard", "show_program_identity", "show_share_section",
  "show_fund_uses", "show_recent_donations", "show_sponsors", "show_donation_card",
]);

// Fields that require a DB migration before they persist
const MIGRATION_FIELDS = new Set(["contact_requirement", "status"]);

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch: Record<string, unknown>     = {};
  const migration: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
    if (KNOWN_FIELDS.has(key))     patch[key]     = val;
    if (MIGRATION_FIELDS.has(key)) migration[key] = val;
  }

  const warnings: string[] = [];

  if (Object.keys(patch).length > 0) {
    const res = await fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}`,
      { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(patch) },
    );
    if (!res.ok) {
      const msg = await res.text();
      return NextResponse.json({ error: `Failed to update campaign: ${msg}` }, { status: 500 });
    }
  }

  // Attempt migration fields — gracefully tolerate column-not-found errors
  if (Object.keys(migration).length > 0) {
    const res = await fetch(
      `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}`,
      { method: "PATCH", headers: h({ Prefer: "return=minimal" }), body: JSON.stringify(migration) },
    );
    if (!res.ok) {
      const errText = await res.text();
      const isMissingColumn = errText.includes("does not exist") || errText.includes("column");
      if (isMissingColumn) {
        for (const key of Object.keys(migration)) {
          warnings.push(`${key} requires a database migration to persist.`);
        }
      } else {
        return NextResponse.json({ error: errText }, { status: 500 });
      }
    }
  }

  if (Object.keys(patch).length === 0 && Object.keys(migration).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...(warnings.length ? { warnings } : {}) });
}
