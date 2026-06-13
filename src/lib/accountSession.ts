import { cache } from "react";
import { cookies } from "next/headers";
import { parseAccountId, verifyAccountCookie } from "@/lib/accountAuth";
import type { TeamActor } from "@/lib/permissions";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export type AccountSession = {
  id:    string;
  name:  string;
  email: string;
};

export type TeamSummary = {
  campaign_slug: string;
  school_name:   string;
  mascot:        string;
  sport_name:    string;
  primary_color: string;
};

// Memoized per render — prevents duplicate DB calls when both getTeamActor
// and the layout call getAccountSession within the same request.
export const getAccountSession = cache(async (): Promise<AccountSession | null> => {
  const store = await cookies();
  const raw   = store.get("elf_session")?.value;
  const id    = parseAccountId(raw);
  if (!id) return null;

  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(id)}&select=id,name,email,salt&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const acct = rows[0];
  if (!verifyAccountCookie(raw, acct.id, acct.salt)) return null;
  return { id: acct.id, name: acct.name, email: acct.email };
});

export async function getActorForAccount(
  slug:    string,
  account: AccountSession,
): Promise<TeamActor | null> {
  const [memberRes, coachRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/team_members?account_id=eq.${encodeURIComponent(account.id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role,campaign_slug,athlete_id&limit=1`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(account.id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role,campaign_slug&limit=1`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  if (memberRes.ok) {
    const rows = await memberRes.json();
    if (Array.isArray(rows) && rows.length > 0) {
      const m = rows[0];
      return {
        kind: "member",
        session: {
          id:            m.id,
          name:          m.name,
          role:          m.role as "athlete" | "parent" | "booster",
          campaign_slug: m.campaign_slug,
          athlete_id:    m.athlete_id ?? null,
        },
      };
    }
  }

  if (coachRes.ok) {
    const rows = await coachRes.json();
    if (Array.isArray(rows) && rows.length > 0) {
      const c = rows[0];
      return {
        kind: "coach",
        session: {
          id:            c.id,
          name:          c.name,
          role:          c.role as "head_coach" | "assistant_coach" | "booster",
          campaign_slug: c.campaign_slug,
        },
      };
    }
  }

  return null;
}

export async function getAccountTeams(accountId: string): Promise<TeamSummary[]> {
  const [coachRes, memberRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(accountId)}&select=campaign_slug`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?account_id=eq.${encodeURIComponent(accountId)}&select=campaign_slug`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const slugs = new Set<string>();
  if (coachRes.ok) {
    const rows = await coachRes.json();
    if (Array.isArray(rows)) rows.forEach((r: { campaign_slug: string }) => slugs.add(r.campaign_slug));
  }
  if (memberRes.ok) {
    const rows = await memberRes.json();
    if (Array.isArray(rows)) rows.forEach((r: { campaign_slug: string }) => slugs.add(r.campaign_slug));
  }
  if (slugs.size === 0) return [];

  const inList = Array.from(slugs).join(",");
  const settingsRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=in.(${inList})&select=campaign_slug,school_name,mascot,sport_name,primary_color`,
    { headers: h(), cache: "no-store" },
  );
  if (!settingsRes.ok) return [];
  const rows = await settingsRes.json();
  return Array.isArray(rows) ? rows : [];
}
