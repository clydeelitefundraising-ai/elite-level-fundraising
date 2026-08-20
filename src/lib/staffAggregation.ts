// Phase 7: Team Hub Staff roster display — aggregates the two independent
// sources of Booster identity in this codebase without merging or
// duplicating either underlying table.
//
// Boosters can exist as EITHER (or both):
//   - a team_coaches row with role='booster' (added via the Head Coach's
//     existing Staff Management flow, Phase A28)
//   - a team_members row with role='booster' (joined via team code, same
//     path as parent/athlete)
// This module reads both, sources unchanged, and produces one display list.
//
// DEDUPLICATION RULE (exact, deterministic — do not weaken):
// A booster is shown once, merging a team_coaches row and a team_members
// row, ONLY when both rows have a non-null account_id AND those account_ids
// are equal (the same elf_accounts.id). This is the only durable, trustworthy
// shared identity between the two tables. If either row has no linked
// account_id, or the account_ids differ, both rows are listed independently
// — there is no fuzzy/name-based matching anywhere in this module.
import { getCampaignSettings } from "./supabase.ts";
import { resolvePhotoUrl } from "./messages.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Deliberately not importing listTeamCoaches from staffInvite.ts: that
// module pulls in @/lib/accountAuth and @/lib/coachInvite via the "@/"
// path alias, which the plain `node --test` runner (this repo's test
// convention — see package.json's "test" script) cannot resolve, unlike
// Next.js's own bundler. Every *.test.ts-covered lib in this codebase
// sticks to relative imports only for exactly this reason. This is a
// deliberately small, duplicated read of team_coaches (same shape as
// listTeamCoaches), not a second staff-management implementation.

export type StaffDisplayRole = "head_coach" | "assistant_coach" | "booster";

// Deliberately minimal — no email, phone, internal id, invite state, or
// account_id. `key` is a stable React list key only, not exposed as an
// entity id in any meaningful sense (it encodes source table + row id
// purely for de-duplication bookkeeping, never rendered to the user).
// photo_url reuses the exact same public field the rest of the app already
// treats as safe to display (elf_accounts.profile_photo_url via
// resolvePhotoUrl, see below) — same visibility rule as DM avatars.
export type StaffDisplayEntry = {
  key: string;
  name: string;
  role: StaffDisplayRole;
  photo_url: string | null;
};

export type CoachSourceRow = { id: string; name: string; role: StaffDisplayRole; account_id: string | null; photo_url: string | null };
export type MemberBoosterRow = { id: string; name: string; account_id: string | null; photo_url: string | null };

const ROLE_ORDER: Record<StaffDisplayRole, number> = { head_coach: 0, assistant_coach: 1, booster: 2 };

/** Pure aggregation — no I/O, unit-testable. */
export function aggregateTeamStaff(
  coachRows: CoachSourceRow[],
  memberBoosterRows: MemberBoosterRow[],
  showBooster: boolean,
): StaffDisplayEntry[] {
  const headAndAssistant: StaffDisplayEntry[] = coachRows
    .filter(r => r.role !== "booster")
    .map(r => ({ key: `coach:${r.id}`, name: r.name, role: r.role as StaffDisplayRole, photo_url: r.photo_url }));

  if (!showBooster) return headAndAssistant;

  const coachBoosters = coachRows.filter(r => r.role === "booster");
  const usedMemberIds = new Set<string>();

  const boosters: StaffDisplayEntry[] = coachBoosters.map(cb => {
    let matchPhoto: string | null = null;
    if (cb.account_id) {
      const match = memberBoosterRows.find(m => m.account_id && m.account_id === cb.account_id);
      if (match) { usedMemberIds.add(match.id); matchPhoto = match.photo_url; }
    }
    // Coach-side photo wins (mirrors the coach-side-wins name rule above);
    // falls back to the merged member row's photo if the coach side has none.
    return { key: `coach:${cb.id}`, name: cb.name, role: "booster" as const, photo_url: cb.photo_url ?? matchPhoto };
  });

  for (const m of memberBoosterRows) {
    if (usedMemberIds.has(m.id)) continue;
    boosters.push({ key: `member:${m.id}`, name: m.name, role: "booster", photo_url: m.photo_url });
  }

  return [...headAndAssistant, ...boosters].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

// Photo resolution reuses the exact canonical rule already used for DM
// avatars (src/lib/messages.ts's resolvePhotoUrl) rather than inventing a
// second photo system: staff (coach or booster) are never athletes, so
// this always resolves via the linked elf_accounts.profile_photo_url —
// same embedded PostgREST select convention, zero extra queries.
type RawCoachRow  = { id: string; name: string; role: StaffDisplayRole; account_id: string | null; elf_accounts: { profile_photo_url: string | null } | null };
type RawMemberRow = { id: string; name: string; account_id: string | null; elf_accounts: { profile_photo_url: string | null } | null };

async function fetchTeamCoaches(slug: string): Promise<CoachSourceRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,name,role,account_id,elf_accounts!account_id(profile_photo_url)&order=created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: RawCoachRow[] = await res.json();
  return rows.map(r => ({
    id: r.id, name: r.name, role: r.role, account_id: r.account_id,
    photo_url: resolvePhotoUrl({ name: r.name, role: r.role, elf_accounts: r.elf_accounts }, null),
  }));
}

async function fetchMemberBoosters(slug: string): Promise<MemberBoosterRow[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_members?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.booster&select=id,name,account_id,elf_accounts!account_id(profile_photo_url)&order=created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: RawMemberRow[] = await res.json();
  return rows.map(r => ({
    id: r.id, name: r.name, account_id: r.account_id,
    photo_url: resolvePhotoUrl(null, { name: r.name, role: "booster", athlete_id: null, athletes: null, elf_accounts: r.elf_accounts }),
  }));
}

/** Full read: fetches both sources + the visibility setting and returns the
 *  final display list for Team -> Roster -> Staff. */
export async function getTeamStaffDisplay(slug: string): Promise<StaffDisplayEntry[]> {
  const [coachRows, memberBoosters, settings] = await Promise.all([
    fetchTeamCoaches(slug),
    fetchMemberBoosters(slug),
    getCampaignSettings(slug),
  ]);
  // Default true — matches the migration's column default for teams whose
  // settings row predates this phase or failed to resolve.
  const showBooster = settings?.show_booster_in_staff_roster !== false;
  return aggregateTeamStaff(coachRows, memberBoosters, showBooster);
}
