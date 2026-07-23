import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { campaignExists } from "@/lib/platform/campaigns";

// ── Admin campaign-route authorization contract ─────────────────────────────
//
// Identity: the `elf_admin` cookie ONLY. This is a platform-admin session —
// it carries no coach/member/account identity and is NOT a TeamActor. Do not
// pass it through `getTeamActor`/`permissions.server.ts`, and do not write it
// into coach-specific columns (e.g. `fundraising_contact_goals.set_by_coach_id`,
// which is a NOT NULL FK to `team_coaches` — an admin session has no row
// there, so any feature needing that column needs its own resolution, not a
// synthetic coach id invented here).
//
// Scope: every admin campaign route takes `slug` from the URL. `requireAdminCampaign`
// confirms that slug resolves to a real, existing campaign — callers are still
// responsible for filtering every Supabase query by that `campaign_slug`
// (directly, or via `assertOwnedByCampaign` for a resource looked up by id)
// so a valid platform-admin session can never mutate a row belonging to a
// campaign other than the one named in the URL.
//
// Failure modes: 401 (missing/invalid `elf_admin` cookie), 404 (slug does not
// resolve to an existing campaign, or a resource id doesn't belong to it).

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function restHeaders(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export type AdminCampaignAuth =
  | { ok: true; slug: string }
  | { ok: false; response: NextResponse };

export async function requireAdminCampaign(slug: string): Promise<AdminCampaignAuth> {
  const store = await cookies();
  if (!verifyToken(store.get("elf_admin")?.value)) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!slug || !(await campaignExists(slug))) {
    return { ok: false, response: NextResponse.json({ error: "Campaign not found" }, { status: 404 }) };
  }
  return { ok: true, slug };
}

// Confirms a row in `table` (by id) actually belongs to `slug` before a
// mutation is allowed to proceed — prevents an admin authenticated for one
// campaign's URL from editing/deleting a resource that belongs to another.
export async function assertOwnedByCampaign(table: string, id: string, slug: string): Promise<boolean> {
  const res = await fetch(
    `${BASE}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=campaign_slug&limit=1`,
    { headers: restHeaders(), cache: "no-store" },
  );
  if (!res.ok) return false;
  const rows: { campaign_slug: string }[] = await res.json();
  return rows[0]?.campaign_slug === slug;
}
