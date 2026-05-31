import { cookies } from "next/headers";
import { parseCoachId, verifyCoachCookie } from "@/lib/teamAuth";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export type CoachSession = {
  id: string;
  name: string;
  role: "head_coach" | "assistant_coach" | "booster";
  campaign_slug: string;
};

/**
 * Verifies the team_coach cookie and returns the session if valid
 * and scoped to the given campaign slug. Returns null otherwise.
 * Safe to call from server components and route handlers.
 */
export async function getCoachSession(
  campaignSlug: string,
): Promise<CoachSession | null> {
  const store = await cookies();
  const cookieValue = store.get("team_coach")?.value;
  const coachId = parseCoachId(cookieValue);
  if (!coachId) return null;

  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?id=eq.${encodeURIComponent(coachId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,name,role,campaign_slug,salt&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const coach = rows[0];
  if (!verifyCoachCookie(cookieValue, coach.id, coach.salt)) return null;

  return {
    id: coach.id,
    name: coach.name,
    role: coach.role as CoachSession["role"],
    campaign_slug: coach.campaign_slug,
  };
}
