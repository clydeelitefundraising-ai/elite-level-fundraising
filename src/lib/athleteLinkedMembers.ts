// Team Management Phase 3C-2 — the athlete and parent/guardian accounts
// linked to one athlete, for the staff athlete profile's Linked Members
// section. Server-only (service-role PostgREST).
//
// A member is linked to an athlete either through the legacy
// team_members.athlete_id column or through team_member_athletes (a
// parent's second and later children). Both are read here and merged,
// one entry per member. Strict: if any read fails the result is a failure
// — never an empty list that would read as "no linked members".
// (familyRelationships.ts is the member -> athletes direction and is
// deliberately left unchanged.)

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

export type LinkedMember = { id: string; name: string; role: string; athlete_id: string | null; campaign_slug: string };

export type LinkedMembersResult = { ok: true; members: LinkedMember[] } | { ok: false };

const MEMBER_COLUMNS = "id,name,role,athlete_id,campaign_slug";

async function rows<T>(path: string): Promise<T[]> {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { headers: h(), cache: "no-store" });
  if (!res.ok) throw new Error(`[linkedMembers] ${res.status} ${await res.text()}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error("[linkedMembers] unexpected response");
  return body as T[];
}

/** Athlete accounts first, then parents/guardians; by name within each. */
function order(members: LinkedMember[]): LinkedMember[] {
  const rank = (role: string) => (role === "athlete" ? 0 : role === "parent" ? 1 : 2);
  return [...members].sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function getAthleteLinkedMembers(slug: string, athleteId: string): Promise<LinkedMembersResult> {
  try {
    const s = encodeURIComponent(slug);
    const a = encodeURIComponent(athleteId);
    const [direct, links] = await Promise.all([
      rows<LinkedMember>(`team_members?campaign_slug=eq.${s}&athlete_id=eq.${a}&select=${MEMBER_COLUMNS}`),
      rows<{ team_member_id: string }>(`team_member_athletes?athlete_id=eq.${a}&select=team_member_id`),
    ]);
    const byId = new Map(direct.map(m => [m.id, m]));
    const extraIds = [...new Set(links.map(l => l.team_member_id))].filter(id => !byId.has(id));
    if (extraIds.length > 0) {
      const extra = await rows<LinkedMember>(
        `team_members?campaign_slug=eq.${s}&id=in.(${extraIds.map(encodeURIComponent).join(",")})&select=${MEMBER_COLUMNS}`,
      );
      // Only parents link through team_member_athletes, and only on this team.
      for (const m of extra) if (m.role === "parent" && !byId.has(m.id)) byId.set(m.id, m);
    }
    return { ok: true, members: order([...byId.values()]) };
  } catch (err) {
    console.error("[linkedMembers] lookup failed:", err);
    return { ok: false };
  }
}
