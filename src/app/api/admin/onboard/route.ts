import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { createCampaignCore, supabaseHeaders } from "@/lib/campaignCreate";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const DEFAULT_FUND_USES = [
  { icon: "✈️",  title: "Travel & Transportation", description: "Away meets, regional championships, and travel to compete.",                             sort_order: 0 },
  { icon: "📋", title: "Meet Entry Fees",           description: "Registration costs for conference meets, invitationals, and state qualifiers.",          sort_order: 1 },
  { icon: "👟", title: "Equipment & Gear",          description: "Sport-specific equipment and training tools.",                                           sort_order: 2 },
  { icon: "👕", title: "Uniforms",                  description: "Competition uniforms, warm-up suits, and team apparel for all athletes.",                sort_order: 3 },
  { icon: "💪", title: "Recovery Tools",            description: "Foam rollers, resistance bands, ice packs, and injury prevention equipment.",            sort_order: 4 },
  { icon: "🍱", title: "Team Meals",                description: "Pre-meet fueling and post-competition meals to keep athletes performing at their best.", sort_order: 5 },
];

type StarterAthlete = { name?: unknown; event?: unknown };

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const {
    campaign_slug,
    school_name, sport_name, mascot, season, location,
    primary_color, secondary_color, logo_url,
    goal_cents, deadline,
    external_store_url, store_provider,
    coach_name, coach_email, coach_password,
    seed_fund_uses,
    starter_athletes,
    show_leaderboard, show_program_identity, show_share_section,
    show_fund_uses, show_recent_donations, show_sponsors, show_donation_card,
    layout_variant,
    default_athlete_goal_cents,
    contact_goal,
  } = body;

  const slug = String(campaign_slug ?? "").trim();
  if (!slug)                               return NextResponse.json({ error: "Campaign slug is required." }, { status: 400 });
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return NextResponse.json({ error: "Slug must be lowercase letters, numbers, and hyphens only." }, { status: 400 });
  if (slug.length < 3)                     return NextResponse.json({ error: "Slug must be at least 3 characters." }, { status: 400 });

  if (!String(coach_name  ?? "").trim()) return NextResponse.json({ error: "Coach name is required." },  { status: 400 });
  if (!String(coach_email ?? "").trim()) return NextResponse.json({ error: "Coach email is required." }, { status: 400 });
  const pw = String(coach_password ?? "").trim();
  if (pw.length < 8) return NextResponse.json({ error: "Coach password must be at least 8 characters." }, { status: 400 });

  const result = await createCampaignCore({
    slug,
    school_name:     String(school_name  ?? "").trim(),
    sport_name:      String(sport_name   ?? "").trim(),
    mascot:          String(mascot       ?? "").trim(),
    goal_cents:      typeof goal_cents === "number" ? Math.round(goal_cents) : 0,
    deadline:        String(deadline     ?? "").trim(),
    primary_color:   String(primary_color  ?? "#1B4FA8"),
    secondary_color: String(secondary_color ?? "#C4A35A"),
    location:        String(location     ?? "").trim(),
    season:          String(season       ?? "").trim(),
    logo_url:        String(logo_url     ?? "").trim(),
    external_store_url: external_store_url ? String(external_store_url).trim() || null : null,
    store_provider:  store_provider ? String(store_provider).trim() || null : null,
    show_leaderboard:      typeof show_leaderboard      === "boolean" ? show_leaderboard      : true,
    show_program_identity: typeof show_program_identity === "boolean" ? show_program_identity : true,
    show_share_section:    typeof show_share_section    === "boolean" ? show_share_section    : true,
    show_fund_uses:        typeof show_fund_uses        === "boolean" ? show_fund_uses        : true,
    show_recent_donations: typeof show_recent_donations === "boolean" ? show_recent_donations : true,
    show_sponsors:         typeof show_sponsors         === "boolean" ? show_sponsors         : true,
    show_donation_card:    typeof show_donation_card    === "boolean" ? show_donation_card    : true,
    layout_variant:        layout_variant === "premium" ? "premium" : "classic",
    default_athlete_goal_cents: typeof default_athlete_goal_cents === "number" ? Math.round(default_athlete_goal_cents) : null,
    coach_name:    String(coach_name).trim(),
    coach_email:   String(coach_email).trim().toLowerCase(),
    coach_password: pw,
    contact_goal:  typeof contact_goal === "number" && contact_goal > 0 ? Math.round(contact_goal) : 0,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // seed fund uses
  if (seed_fund_uses) {
    await Promise.all(
      DEFAULT_FUND_USES.map(fu =>
        fetch(`${BASE}/rest/v1/fund_uses`, {
          method:  "POST",
          headers: supabaseHeaders({ Prefer: "return=minimal" }),
          body:    JSON.stringify({ campaign_slug: slug, ...fu }),
        }),
      ),
    );
  }

  // starter athletes
  if (Array.isArray(starter_athletes) && starter_athletes.length > 0) {
    const valid = (starter_athletes as StarterAthlete[]).filter(
      a => typeof a.name === "string" && (a.name as string).trim(),
    );
    if (valid.length > 0) {
      await fetch(`${BASE}/rest/v1/athletes`, {
        method:  "POST",
        headers: supabaseHeaders({ Prefer: "return=minimal" }),
        body:    JSON.stringify(
          valid.map(a => ({
            campaign_slug: slug,
            name:  (a.name  as string).trim(),
            event: (typeof a.event === "string" ? a.event : "").trim(),
          })),
        ),
      });
    }
  }

  return NextResponse.json({
    ok:          true,
    slug,
    join_code:   result.join_code,
    coach_email: String(coach_email).trim().toLowerCase(),
  });
}
