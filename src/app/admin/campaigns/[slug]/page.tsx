import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { notFound, redirect } from "next/navigation";
import CampaignControlCenter, { type CampaignDetail } from "./CampaignControlCenter";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function computeHealthScore(d: {
  athleteCount: number;
  memberCount: number;
  donorCount: number;
  raisedCents: number;
  goalCents: number;
  logoUrl: string;
  deadline: string;
  archived: boolean;
}): number {
  let score = 0;
  if (d.athleteCount > 0) score += 15;

  if (d.athleteCount > 0) {
    const rate = d.memberCount / d.athleteCount;
    if (rate >= 0.75) score += 20;
    else if (rate >= 0.50) score += 12;
    else if (rate > 0)    score += 5;
  }

  if (d.donorCount > 0) score += 15;

  if (d.goalCents > 0) {
    score += 10;
    const pct = d.raisedCents / d.goalCents;
    if (pct >= 1.0)      score += 20;
    else if (pct >= 0.5) score += 15;
    else if (pct >= 0.25) score += 8;
    else if (pct > 0)    score += 3;
  }

  if (d.logoUrl) score += 5;
  if (d.deadline) score += 5;
  if (!d.archived) score += 10;

  return Math.min(100, score);
}

type RouteCtx = { params: Promise<{ slug: string }> };

export default async function CampaignDetailPage({ params }: RouteCtx) {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) redirect("/admin");

  const { slug } = await params;

  const [settingsRes, donationsRes, athletesRes, membersRes, coachesRes, contactGoalRes, perAthleteGoalsRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/campaign_settings?campaign_slug=eq.${encodeURIComponent(slug)}&limit=1`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/donations?campaign_slug=eq.${encodeURIComponent(slug)}&select=amount_cents`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,event,jersey_number,grad_year&order=created_at.asc`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,role,athlete_id,name`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role,email`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=is.null&select=goal&limit=1`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&athlete_id=not.is.null&select=athlete_id,goal`, { headers: h(), cache: "no-store" }),
  ]);

  const settingsRows = settingsRes.ok ? await settingsRes.json() : [];
  if (!settingsRows.length) notFound();

  const settings = settingsRows[0];
  const donations: { amount_cents: number }[] = donationsRes.ok ? await donationsRes.json() : [];
  const athletes: CampaignDetail["athletes"] = athletesRes.ok ? await athletesRes.json() : [];
  const members: { id: string; role: string; athlete_id: string | null; name: string }[] = membersRes.ok ? await membersRes.json() : [];
  const coaches: CampaignDetail["coaches"]   = coachesRes.ok ? await coachesRes.json() : [];
  const contactGoalRows: { goal: number }[]  = contactGoalRes.ok ? await contactGoalRes.json() : [];
  const perAthleteGoals: { athlete_id: string; goal: number }[] = perAthleteGoalsRes.ok ? await perAthleteGoalsRes.json() : [];

  const raisedCents     = donations.reduce((s, d) => s + (d.amount_cents || 0), 0);
  const donorCount      = donations.length;
  const athleteCount    = athletes.length;
  const memberCount     = members.length;
  const athleteAccounts = members.filter(m => m.role === "athlete").length;
  const parentAccounts  = members.filter(m => m.role === "parent").length;
  const contactGoal     = contactGoalRows[0]?.goal ?? 10;

  const healthScore = computeHealthScore({
    athleteCount,
    memberCount,
    donorCount,
    raisedCents,
    goalCents:  settings.goal_cents ?? 0,
    logoUrl:    settings.logo_url   ?? "",
    deadline:   settings.deadline   ?? "",
    archived:   settings.archived   ?? false,
  });

  const perAthleteGoalMap: Record<string, number> = {};
  for (const row of perAthleteGoals) {
    perAthleteGoalMap[row.athlete_id] = row.goal;
  }

  const detail: CampaignDetail = {
    // settings
    campaign_slug:              settings.campaign_slug,
    school_name:                settings.school_name         ?? "",
    sport_name:                 settings.sport_name          ?? "",
    mascot:                     settings.mascot              ?? "",
    season:                     settings.season              ?? "",
    location:                   settings.location            ?? "",
    logo_url:                   settings.logo_url            ?? "",
    primary_color:              settings.primary_color       ?? "#1B4FA8",
    secondary_color:            settings.secondary_color     ?? "#C4A35A",
    layout_variant:             settings.layout_variant      ?? "classic",
    goal_cents:                 settings.goal_cents          ?? 0,
    deadline:                   settings.deadline            ?? "",
    default_athlete_goal_cents: settings.default_athlete_goal_cents ?? null,
    external_store_url:         settings.external_store_url  ?? "",
    store_provider:             settings.store_provider      ?? "",
    archived:                   settings.archived            ?? false,
    // feature toggles
    show_leaderboard:       settings.show_leaderboard      ?? true,
    show_program_identity:  settings.show_program_identity ?? true,
    show_share_section:     settings.show_share_section    ?? true,
    show_fund_uses:         settings.show_fund_uses        ?? true,
    show_recent_donations:  settings.show_recent_donations ?? true,
    show_sponsors:          settings.show_sponsors         ?? true,
    show_donation_card:     settings.show_donation_card    ?? true,
    // new fields (graceful fallback until migration runs)
    contact_requirement: (settings as Record<string, unknown>).contact_requirement as string ?? null,
    // contact settings
    contact_goal:        contactGoal,
    per_athlete_goals:   perAthleteGoalMap,
    // computed stats
    raised_cents:        raisedCents,
    donor_count:         donorCount,
    athlete_count:       athleteCount,
    member_count:        memberCount,
    athlete_account_count: athleteAccounts,
    parent_account_count:  parentAccounts,
    health_score:        healthScore,
    // relational
    athletes,
    coaches,
  };

  return <CampaignControlCenter detail={detail} />;
}
