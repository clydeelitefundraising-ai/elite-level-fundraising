import { NextRequest, NextResponse } from "next/server";
import { getTeamActor, isStaff } from "@/lib/permissions.server";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

type RouteCtx = { params: Promise<{ slug: string }> };

type RawContact = {
  athlete_id: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type RawAthlete = { id: string; name: string };

type RawGoal = { athlete_id: string | null; goal: number };

export type AthleteSummary = {
  athlete_id: string;
  athlete_name: string;
  total_contacts: number;
  reachable_count: number;
  phone_count: number;
  email_count: number;
  both_count: number;
  goal: number;
  completion_pct: number;
  last_added: string | null;
  status: "Not Started" | "In Progress" | "Goal Met";
};

export type CoachSummaryResponse = {
  team_goal: number;
  team_reachable: number;
  team_phone: number;
  team_email: number;
  team_completion_pct: number;
  athletes: AthleteSummary[];
};

// GET /api/team/[slug]/contacts/coach/summary
// Staff only. Returns team-level + per-athlete contact stats.
export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { slug } = await params;
  const actor = await getTeamActor(slug);

  if (actor.kind === "public" || !isStaff(actor)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [athletesRes, contactsRes, goalsRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/athletes?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name&order=name.asc`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/fundraising_contacts?campaign_slug=eq.${encodeURIComponent(slug)}&select=athlete_id,phone,email,created_at`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/fundraising_contact_goals?campaign_slug=eq.${encodeURIComponent(slug)}&select=athlete_id,goal`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  if (!athletesRes.ok) {
    return NextResponse.json({ error: "Failed to load athletes." }, { status: 500 });
  }

  const athletes: RawAthlete[] = await athletesRes.json();
  const contacts: RawContact[] = contactsRes.ok ? await contactsRes.json() : [];
  const goals: RawGoal[]       = goalsRes.ok    ? await goalsRes.json()    : [];

  // Build goal maps
  const teamDefaultGoal = goals.find(g => g.athlete_id === null)?.goal ?? 10;
  const perAthleteGoal  = new Map<string, number>(
    goals.filter(g => g.athlete_id !== null).map(g => [g.athlete_id!, g.goal]),
  );

  // Group contacts by athlete_id
  const byAthlete = new Map<string, RawContact[]>();
  for (const c of contacts) {
    const list = byAthlete.get(c.athlete_id) ?? [];
    list.push(c);
    byAthlete.set(c.athlete_id, list);
  }

  let teamReachable = 0;
  let teamPhone     = 0;
  let teamEmail     = 0;
  let teamGoalSum   = 0;

  const athleteSummaries: AthleteSummary[] = athletes.map(a => {
    const list         = byAthlete.get(a.id) ?? [];
    const phoneCount   = list.filter(c => c.phone !== null).length;
    const emailCount   = list.filter(c => c.email !== null).length;
    const bothCount    = list.filter(c => c.phone !== null && c.email !== null).length;
    const total        = list.length; // equals reachable (CHECK constraint ensures phone OR email)
    const goal         = perAthleteGoal.get(a.id) ?? teamDefaultGoal;
    const pct          = goal > 0 ? Math.round((total / goal) * 100) : 0;
    const lastAdded    = list.reduce<string | null>((acc, c) => {
      if (!acc || c.created_at > acc) return c.created_at;
      return acc;
    }, null);

    const status: AthleteSummary["status"] =
      total === 0          ? "Not Started" :
      total >= goal        ? "Goal Met"    :
                             "In Progress";

    teamReachable += total;
    teamPhone     += phoneCount;
    teamEmail     += emailCount;
    teamGoalSum   += goal;

    return {
      athlete_id:      a.id,
      athlete_name:    a.name,
      total_contacts:  total,
      reachable_count: total,
      phone_count:     phoneCount,
      email_count:     emailCount,
      both_count:      bothCount,
      goal,
      completion_pct:  Math.min(100, pct),
      last_added:      lastAdded,
      status,
    };
  });

  const teamCompletionPct = teamGoalSum > 0
    ? Math.min(100, Math.round((teamReachable / teamGoalSum) * 100))
    : 0;

  const response: CoachSummaryResponse = {
    team_goal:            teamGoalSum,
    team_reachable:       teamReachable,
    team_phone:           teamPhone,
    team_email:           teamEmail,
    team_completion_pct:  teamCompletionPct,
    athletes:             athleteSummaries,
  };

  return NextResponse.json(response);
}
