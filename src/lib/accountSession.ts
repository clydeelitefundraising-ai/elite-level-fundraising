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
  id:               string;
  name:             string;
  email:            string;
  profile_photo_url: string | null;
};

export type TeamSummary = {
  campaign_slug: string;
  school_name:   string;
  mascot:        string;
  sport_name:    string;
  primary_color: string;
  season:        string;
  logo_url:      string | null;
  role:          string;       // raw role string (head_coach / assistant_coach / booster / athlete / parent)
  role_kind:     "coach" | "member";
};

// Memoized per render — prevents duplicate DB calls when both getTeamActor
// and the layout call getAccountSession within the same request.
export const getAccountSession = cache(async (): Promise<AccountSession | null> => {
  const store = await cookies();
  const raw   = store.get("elf_session")?.value;
  const id    = parseAccountId(raw);
  if (!id) return null;

  const res = await fetch(
    `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(id)}&select=id,name,email,salt,profile_photo_url&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const acct = rows[0];
  if (!verifyAccountCookie(raw, acct.id, acct.salt)) return null;
  return { id: acct.id, name: acct.name, email: acct.email, profile_photo_url: acct.profile_photo_url ?? null };
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

// A single account can hold a team_coaches row and/or a team_members row for
// the same campaign_slug (e.g. an assistant coach who is also a registered
// parent on that team), or different rows across different teams entirely
// (coach on one team, parent/athlete on another). Role display here mirrors
// getActorForAccount()'s precedence — member wins when both exist for the
// same slug — so the Team Selector's role badge always matches what the
// actor actually resolves to once they enter that team.
export async function getAccountTeams(accountId: string): Promise<TeamSummary[]> {
  const [coachRes, memberRes] = await Promise.all([
    fetch(
      `${BASE}/rest/v1/team_coaches?account_id=eq.${encodeURIComponent(accountId)}&select=campaign_slug,role`,
      { headers: h(), cache: "no-store" },
    ),
    fetch(
      `${BASE}/rest/v1/team_members?account_id=eq.${encodeURIComponent(accountId)}&select=campaign_slug,role`,
      { headers: h(), cache: "no-store" },
    ),
  ]);

  const roleBySlug: Record<string, { role: string; role_kind: "coach" | "member" }> = {};

  if (memberRes.ok) {
    const rows = await memberRes.json();
    if (Array.isArray(rows)) {
      for (const r of rows as { campaign_slug: string; role: string }[]) {
        roleBySlug[r.campaign_slug] = { role: r.role, role_kind: "member" };
      }
    }
  }
  if (coachRes.ok) {
    const rows = await coachRes.json();
    if (Array.isArray(rows)) {
      for (const r of rows as { campaign_slug: string; role: string }[]) {
        if (!roleBySlug[r.campaign_slug]) roleBySlug[r.campaign_slug] = { role: r.role, role_kind: "coach" };
      }
    }
  }

  const slugs = Object.keys(roleBySlug);
  if (slugs.length === 0) return [];

  const inList = slugs.join(",");
  const settingsRes = await fetch(
    `${BASE}/rest/v1/campaign_settings?campaign_slug=in.(${inList})&select=campaign_slug,school_name,mascot,sport_name,primary_color,season,logo_url`,
    { headers: h(), cache: "no-store" },
  );
  if (!settingsRes.ok) return [];
  const rows = await settingsRes.json();
  if (!Array.isArray(rows)) return [];

  return rows.map((r: Omit<TeamSummary, "role" | "role_kind">) => ({
    ...r,
    role:      roleBySlug[r.campaign_slug]?.role ?? "",
    role_kind: roleBySlug[r.campaign_slug]?.role_kind ?? "member",
  }));
}
