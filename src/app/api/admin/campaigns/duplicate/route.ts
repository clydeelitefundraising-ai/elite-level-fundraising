import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { createCampaignCore, supabaseHeaders } from "@/lib/campaignCreate";

export const dynamic = "force-dynamic";

const BASE    = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type CopyOptions = {
  branding:        boolean;
  feature_toggles: boolean;
  fund_uses:       boolean;
  sponsors:        boolean;
  contact_goals:   boolean;
  store_products:  boolean;
  calendar_events: boolean;
};

type SourceSettings = {
  primary_color:              string;
  secondary_color:            string;
  logo_url:                   string;
  show_leaderboard:           boolean;
  show_program_identity:      boolean;
  show_share_section:         boolean;
  show_fund_uses:             boolean;
  show_recent_donations:      boolean;
  show_sponsors:              boolean;
  show_donation_card:         boolean;
  layout_variant:             string;
  default_athlete_goal_cents: number | null;
};

export async function POST(req: NextRequest) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const {
    source_slug,
    campaign_slug,
    school_name, sport_name, mascot, season, location,
    goal_cents, deadline, default_athlete_goal_cents,
    coach_name, coach_email, coach_password,
    copy,
  } = body as {
    source_slug:   string;
    campaign_slug: string;
    school_name: string; sport_name: string; mascot: string; season: string; location: string;
    goal_cents: number; deadline: string; default_athlete_goal_cents: number | null;
    coach_name: string; coach_email: string; coach_password: string;
    copy: CopyOptions;
  };

  // ── Validate ─────────────────────────────────────────────────────────────────
  const src  = String(source_slug  ?? "").trim();
  const slug = String(campaign_slug ?? "").trim();

  if (!src)                              return NextResponse.json({ error: "Source campaign is required." }, { status: 400 });
  if (!slug || slug.length < 3 || !SLUG_RE.test(slug)) return NextResponse.json({ error: "Invalid campaign slug." }, { status: 400 });
  if (!String(coach_name  ?? "").trim()) return NextResponse.json({ error: "Coach name is required." },  { status: 400 });
  if (!String(coach_email ?? "").trim()) return NextResponse.json({ error: "Coach email is required." }, { status: 400 });
  const pw = String(coach_password ?? "").trim();
  if (pw.length < 8) return NextResponse.json({ error: "Coach password must be at least 8 characters." }, { status: 400 });

  // ── Fetch source campaign settings ───────────────────────────────────────────
  const srcRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(src)}&limit=1`,
    { headers: supabaseHeaders(), cache: "no-store" },
  );
  if (!srcRes.ok) return NextResponse.json({ error: "Failed to fetch source campaign." }, { status: 500 });
  const srcRows = await srcRes.json() as SourceSettings[];
  if (!srcRows.length) return NextResponse.json({ error: "Source campaign not found." }, { status: 404 });
  const source = srcRows[0];

  // ── Resolve branding (copy from source or use safe defaults) ─────────────────
  const branding = copy?.branding
    ? {
        primary_color:   source.primary_color   ?? "#1B4FA8",
        secondary_color: source.secondary_color ?? "#C4A35A",
        logo_url:        source.logo_url        ?? "",
      }
    : {
        primary_color:   "#1B4FA8",
        secondary_color: "#C4A35A",
        logo_url:        "",
      };

  // ── Resolve feature flags (copy from source or enable all) ───────────────────
  const flags = copy?.feature_toggles
    ? {
        show_leaderboard:      source.show_leaderboard      ?? true,
        show_program_identity: source.show_program_identity ?? true,
        show_share_section:    source.show_share_section    ?? true,
        show_fund_uses:        source.show_fund_uses        ?? true,
        show_recent_donations: source.show_recent_donations ?? true,
        show_sponsors:         source.show_sponsors         ?? true,
        show_donation_card:    source.show_donation_card    ?? true,
        layout_variant:        (source.layout_variant === "premium" ? "premium" : "classic") as "classic" | "premium",
      }
    : {
        show_leaderboard: true, show_program_identity: true, show_share_section: true,
        show_fund_uses: true, show_recent_donations: true, show_sponsors: true,
        show_donation_card: true, layout_variant: "classic" as const,
      };

  // ── Resolve contact goal (copy from source or skip) ──────────────────────────
  let contactGoal = 0;
  if (copy?.contact_goals) {
    const cgRes = await fetch(
      `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(src)}&athlete_id=is.null&select=goal&limit=1`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (cgRes.ok) {
      const cgRows = await cgRes.json() as { goal: number }[];
      contactGoal = cgRows[0]?.goal ?? 0;
    }
  }

  // ── Create the new campaign ───────────────────────────────────────────────────
  const result = await createCampaignCore({
    slug,
    school_name:     String(school_name ?? "").trim(),
    sport_name:      String(sport_name  ?? "").trim(),
    mascot:          String(mascot      ?? "").trim(),
    season:          String(season      ?? "").trim(),
    location:        String(location    ?? "").trim(),
    goal_cents:      typeof goal_cents === "number" ? Math.round(goal_cents) : 0,
    deadline:        String(deadline    ?? "").trim(),
    default_athlete_goal_cents:
      typeof default_athlete_goal_cents === "number" ? Math.round(default_athlete_goal_cents) : null,
    ...branding,
    ...flags,
    coach_name:    String(coach_name).trim(),
    coach_email:   String(coach_email).trim().toLowerCase(),
    coach_password: pw,
    contact_goal:  contactGoal,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // ── Copy child records ────────────────────────────────────────────────────────
  const copied = { fund_uses: 0, sponsors: 0, contact_goals: contactGoal > 0 ? 1 : 0, store_products: 0, calendar_events: 0 };

  // fund_uses
  if (copy?.fund_uses) {
    const res = await fetch(
      `${BASE}/rest/v1/fund_uses?campaign_slug=eq.${encodeURIComponent(src)}&select=icon,title,description,sort_order&order=sort_order.asc`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (res.ok) {
      const rows = await res.json() as object[];
      if (rows.length > 0) {
        const ins = await fetch(`${BASE}/rest/v1/fund_uses`, {
          method:  "POST",
          headers: supabaseHeaders({ Prefer: "return=minimal" }),
          body:    JSON.stringify(rows.map(r => ({ ...r, campaign_slug: slug }))),
        });
        if (ins.ok) copied.fund_uses = rows.length;
      }
    }
  }

  // sponsors
  if (copy?.sponsors) {
    const res = await fetch(
      `${BASE}/rest/v1/sponsors?campaign_slug=eq.${encodeURIComponent(src)}&select=name,url,tier,logo_url,description,display_order,visible,sponsorship_amount_cents,contact_name,contact_email,contact_phone&order=display_order.asc`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (res.ok) {
      const rows = await res.json() as object[];
      if (rows.length > 0) {
        const ins = await fetch(`${BASE}/rest/v1/sponsors`, {
          method:  "POST",
          headers: supabaseHeaders({ Prefer: "return=minimal" }),
          body:    JSON.stringify(rows.map(r => ({ ...r, campaign_slug: slug }))),
        });
        if (ins.ok) copied.sponsors = rows.length;
      }
    }
  }

  // store products
  if (copy?.store_products) {
    const res = await fetch(
      `${BASE}/rest/v1/team_products?campaign_slug=eq.${encodeURIComponent(src)}&select=name,description,price_cents,image_url,external_url,visible,sort_order&order=sort_order.asc`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (res.ok) {
      const rows = await res.json() as object[];
      if (rows.length > 0) {
        const ins = await fetch(`${BASE}/rest/v1/team_products`, {
          method:  "POST",
          headers: supabaseHeaders({ Prefer: "return=minimal" }),
          body:    JSON.stringify(rows.map(r => ({ ...r, campaign_slug: slug }))),
        });
        if (ins.ok) copied.store_products = rows.length;
      }
    }
  }

  // calendar events
  if (copy?.calendar_events) {
    const res = await fetch(
      `${BASE}/rest/v1/calendar_events?campaign_slug=eq.${encodeURIComponent(src)}&select=title,event_date,event_time,location,type&order=event_date.asc`,
      { headers: supabaseHeaders(), cache: "no-store" },
    );
    if (res.ok) {
      const rows = await res.json() as object[];
      if (rows.length > 0) {
        const ins = await fetch(`${BASE}/rest/v1/calendar_events`, {
          method:  "POST",
          headers: supabaseHeaders({ Prefer: "return=minimal" }),
          body:    JSON.stringify(rows.map(r => ({ ...r, campaign_slug: slug }))),
        });
        if (ins.ok) copied.calendar_events = rows.length;
      }
    }
  }

  return NextResponse.json({
    ok:          true,
    slug,
    source_slug: src,
    join_code:   result.join_code,
    copied,
  });
}
