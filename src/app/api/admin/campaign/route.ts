import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { getCampaignSettings, updateCampaignSettings } from "@/lib/supabase";
import { logAuditEvent, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/auditLog";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  const settings = await getCampaignSettings(slug);
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { slug, school_name, sport_name, mascot, goal_cents, deadline, primary_color, secondary_color, theme_primary_color, theme_secondary_color, theme_accent_color, theme_button_color, location, season, logo_url, archived, show_leaderboard, show_program_identity, show_share_section, show_fund_uses, show_recent_donations, show_sponsors, show_donation_card, layout_variant, default_athlete_goal_cents } = body;
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  // Theme fields use undefined (not null) when absent from the request body,
  // so partial updates — e.g. archiveCampaign() only ever sends {slug,
  // archived} — don't accidentally wipe out previously-configured theme
  // colors. JSON.stringify drops undefined keys, leaving the column untouched.
  const patch = {
    school_name, sport_name, mascot, goal_cents, deadline, primary_color, secondary_color,
    theme_primary_color:   theme_primary_color   !== undefined ? (theme_primary_color   || null) : undefined,
    theme_secondary_color: theme_secondary_color !== undefined ? (theme_secondary_color || null) : undefined,
    theme_accent_color:    theme_accent_color    !== undefined ? (theme_accent_color    || null) : undefined,
    theme_button_color:    theme_button_color    !== undefined ? (theme_button_color    || null) : undefined,
    location, season, logo_url, archived, show_leaderboard, show_program_identity, show_share_section, show_fund_uses, show_recent_donations, show_sponsors, show_donation_card, layout_variant, default_athlete_goal_cents: default_athlete_goal_cents || null,
  };
  try {
    await updateCampaignSettings(slug, patch);
    const isArchiveOp  = school_name == null && archived != null;
    const auditAction  = isArchiveOp
      ? (archived ? "campaign.archived" : "campaign.restored")
      : "campaign.updated";
    logAuditEvent({
      actor: ADMIN_TOOL_ACTOR,
      action:        auditAction,
      entity_type:   "campaign",
      entity_id:     slug,
      campaign_slug: slug,
      summary:       auditAction === "campaign.archived" ? `Archived campaign "${slug}"`
        : auditAction === "campaign.restored" ? `Restored campaign "${slug}"`
        : `Updated settings for campaign "${slug}"`,
      new_value:     isArchiveOp ? { archived } : { school_name, sport_name, season, goal_cents, deadline },
      ip_address:    ipOf(req),
      user_agent:    req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
