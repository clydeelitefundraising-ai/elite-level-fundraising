// Server-only. Phase T6 — the Location card's read-only fallback: the
// team's linked school (organizations row, Phase A29/A29b) address. Never
// written from the Team Overview page — the school record is shared by
// every team at that school and stays platform-admin-managed.
import type { OrganizationAddress } from "./teamOverview";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** null when the team has no linked school, the id is malformed, or the
 *  read fails — the card then just uses the team's own location. */
export async function getOrganizationAddress(organizationId: string | null | undefined): Promise<OrganizationAddress | null> {
  if (!organizationId || !UUID_RE.test(organizationId)) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    const res = await fetch(
      `${BASE}/rest/v1/organizations?id=eq.${encodeURIComponent(organizationId)}&select=address,city,state,zip&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as OrganizationAddress[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
