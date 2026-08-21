// Phase 10: resolves WHICH elf_accounts.id values a native push should fan
// out to, for each of the four V1 categories. push_devices is keyed on
// account_id, but every existing recipient-targeting concept in this app
// (RecipientScope, thread participants, team_coaches roles) is keyed on
// member_id/coach_id — this module is the one place that bridges the two,
// so that bridge logic isn't duplicated per producer route.
import type { RecipientScope } from "./notifications.ts";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function dedupe(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Team Updates / Announcements / file uploads — scope-filtered members
 *  (same rule as isVisibleToMember) plus every coach (coaches are never
 *  scope-filtered, matching existing, preserved behavior). Only rows with
 *  a linked account_id can ever receive a native push — rows with none
 *  simply can't own a device yet. */
export async function getAccountIdsForScope(
  slug: string,
  scope: RecipientScope,
  recipientAthleteId: string | null,
): Promise<string[]> {
  let memberFilter = `campaign_slug=eq.${encodeURIComponent(slug)}`;
  if (scope === "athletes") memberFilter += "&role=eq.athlete";
  if (scope === "parents")  memberFilter += "&role=eq.parent";
  if (scope === "boosters") memberFilter += "&role=eq.booster";
  if (scope === "athlete_specific" && recipientAthleteId) {
    memberFilter += `&athlete_id=eq.${encodeURIComponent(recipientAthleteId)}`;
  }

  const [memberRes, coachRes] = await Promise.all([
    fetch(`${BASE}/rest/v1/team_members?${memberFilter}&select=account_id`, { headers: h(), cache: "no-store" }),
    fetch(`${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=account_id`, { headers: h(), cache: "no-store" }),
  ]);
  const members: { account_id: string | null }[] = memberRes.ok ? await memberRes.json() : [];
  const coaches: { account_id: string | null }[] = coachRes.ok  ? await coachRes.json()  : [];

  return dedupe([...members.map(m => m.account_id), ...coaches.map(c => c.account_id)]);
}

/** Direct Messages — actual thread participants only, sender excluded.
 *  excludeActorKey is "coach:<id>" or "member:<id>", matching the same
 *  convention push.ts's sendPushToParticipants already uses. */
export async function getAccountIdsForThreadParticipants(
  threadId: string,
  excludeActorKey: string,
): Promise<string[]> {
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_participants?thread_id=eq.${encodeURIComponent(threadId)}&select=actor_type,coach_id,member_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: { actor_type: "coach" | "member"; coach_id: string | null; member_id: string | null }[] = await res.json();

  const coachIds = rows.filter(r => r.actor_type === "coach" && r.coach_id && `coach:${r.coach_id}` !== excludeActorKey).map(r => r.coach_id!);
  const memberIds = rows.filter(r => r.actor_type === "member" && r.member_id && `member:${r.member_id}` !== excludeActorKey).map(r => r.member_id!);

  const [coachRes, memberRes] = await Promise.all([
    coachIds.length ? fetch(`${BASE}/rest/v1/team_coaches?id=in.(${coachIds.join(",")})&select=account_id`, { headers: h(), cache: "no-store" }) : null,
    memberIds.length ? fetch(`${BASE}/rest/v1/team_members?id=in.(${memberIds.join(",")})&select=account_id`, { headers: h(), cache: "no-store" }) : null,
  ]);
  const coaches: { account_id: string | null }[] = coachRes?.ok ? await coachRes.json() : [];
  const members: { account_id: string | null }[] = memberRes?.ok ? await memberRes.json() : [];

  return dedupe([...coaches.map(c => c.account_id), ...members.map(m => m.account_id)]);
}

/** Requests — Head Coach only (the actionable audience), even though the
 *  inbox row itself stays visible to all staff (existing, preserved
 *  coach-inbox behavior — this filter applies only at the push layer). */
export async function getHeadCoachAccountIds(slug: string): Promise<string[]> {
  const res = await fetch(
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&role=eq.head_coach&select=account_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: { account_id: string | null }[] = await res.json();
  return dedupe(rows.map(r => r.account_id));
}
