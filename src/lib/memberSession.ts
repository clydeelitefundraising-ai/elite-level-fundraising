import { cookies } from "next/headers";
import { parseMemberId, verifyMemberCookie } from "@/lib/memberAuth";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export type MemberSession = {
  id: string;
  name: string;
  role: "athlete" | "parent";
  campaign_slug: string;
  athlete_id: string | null;
};

/**
 * Verifies the team_member cookie and returns the session if valid
 * and scoped to the given campaign slug. Returns null otherwise.
 * Safe to call from server components and route handlers.
 */
export async function getMemberSession(
  campaignSlug: string,
): Promise<MemberSession | null> {
  const store = await cookies();
  const cookieValue = store.get("team_member")?.value;
  const memberId = parseMemberId(cookieValue);
  if (!memberId) return null;

  const res = await fetch(
    `${BASE}/rest/v1/team_members?id=eq.${encodeURIComponent(memberId)}&campaign_slug=eq.${encodeURIComponent(campaignSlug)}&select=id,name,role,campaign_slug,athlete_id,salt&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const member = rows[0];
  if (!verifyMemberCookie(cookieValue, member.id, member.salt)) return null;

  return {
    id: member.id,
    name: member.name,
    role: member.role as MemberSession["role"],
    campaign_slug: member.campaign_slug,
    athlete_id: member.athlete_id ?? null,
  };
}
