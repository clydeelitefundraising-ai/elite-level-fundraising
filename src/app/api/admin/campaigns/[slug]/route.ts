import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/auditLog";

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

// ── Permanent delete — admin only, irreversible ─────────────────────────────
//
// Archive (PATCH {archived:true}) remains the recommended workflow and is
// untouched by this. This is a separate, deliberately harder-to-reach nuke
// button for the rare case a campaign must be fully removed (e.g. wrong
// school entered, test data, a legal deletion request). It requires the
// caller to send back the literal string "DELETE" as server-side proof the
// client-side typed-confirmation UI was actually used — the UI enforces the
// same thing, but a destructive endpoint should never trust client-only
// validation for an action with no undo.
//
// Every table with a campaign_slug column (confirmed against the live
// schema, not guessed from migration files) is swept, in child-before-parent
// order so deletes don't fail on foreign keys regardless of whether DB-level
// cascade is configured. audit_logs is deliberately excluded — deleting a
// campaign's audit history would defeat the point of an audit trail, and a
// final "campaign.permanently_deleted" entry is written after the sweep
// completes so this action itself is always recorded.
const CAMPAIGN_SLUG_TABLES = [
  "push_subscriptions",
  "athlete_outreach",
  "fundraising_contact_goals",
  "fundraising_contacts",
  "sponsor_relationships",
  "automation_events",
  "announcements",
  "calendar_events",
  "donations",
  "fund_uses",
  "sponsors",
  "team_files",
  "team_join_codes",
  "team_orders",
  "team_products",
  "team_members",
  "team_coaches",
  "message_threads",
  "athletes",
];

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;

  const body = await req.json().catch(() => null);
  if (!body || body.confirmText !== "DELETE") {
    return NextResponse.json(
      { error: 'Type "DELETE" to confirm permanent deletion.' },
      { status: 400 },
    );
  }

  const settingsRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&select=school_name,sport_name&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  if (!settingsRows.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const { school_name, sport_name } = settingsRows[0];

  async function idsFor(table: string): Promise<string[]> {
    const res = await fetch(
      `${BASE}/rest/v1/${table}?campaign_slug=eq.${encodeURIComponent(slug)}&select=id`,
      { headers: h(), cache: "no-store" },
    );
    if (!res.ok) return [];
    const rows: { id: string }[] = await res.json();
    return rows.map(r => r.id);
  }

  const [coachIds, productIds, threadIds] = await Promise.all([
    idsFor("team_coaches"),
    idsFor("team_products"),
    idsFor("message_threads"),
  ]);

  async function deleteWhereIn(table: string, column: string, ids: string[]) {
    if (!ids.length) return;
    const list = ids.map(id => encodeURIComponent(id)).join(",");
    await fetch(`${BASE}/rest/v1/${table}?${column}=in.(${list})`, {
      method: "DELETE",
      headers: h({ Prefer: "return=minimal" }),
    });
  }

  // Grandchildren first (see CASCADE_CHILD_TABLES comment above)
  await Promise.all([
    deleteWhereIn("team_product_variants", "product_id", productIds),
    deleteWhereIn("coach_invite_tokens", "coach_id", coachIds),
    deleteWhereIn("messages", "thread_id", threadIds),
    deleteWhereIn("message_reads", "thread_id", threadIds),
    deleteWhereIn("message_thread_participants", "thread_id", threadIds),
  ]);

  // All direct campaign_slug-scoped tables, then the campaign itself
  for (const table of CAMPAIGN_SLUG_TABLES) {
    await fetch(
      `${BASE}/rest/v1/${table}?campaign_slug=eq.${encodeURIComponent(slug)}`,
      { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
    );
  }
  const finalRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!finalRes.ok) {
    return NextResponse.json({ error: "Failed to delete campaign record." }, { status: 500 });
  }

  logAuditEvent({
    actor: ADMIN_TOOL_ACTOR,
    action:        "campaign.permanently_deleted",
    entity_type:   "campaign",
    entity_id:     slug,
    campaign_slug: slug,
    summary:       `Permanently deleted campaign "${slug}" (${school_name || "unnamed"}${sport_name ? `, ${sport_name}` : ""}) — irreversible`,
    ip_address:    ipOf(req),
    user_agent:    req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
