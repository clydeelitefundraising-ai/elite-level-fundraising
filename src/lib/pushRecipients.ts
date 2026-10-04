// Phase 10: resolves WHICH elf_accounts.id values a native push should fan
// out to, for each of the four V1 categories. push_devices is keyed on
// account_id, but every existing recipient-targeting concept in this app
// (RecipientScope, thread participants, team_coaches roles) is keyed on
// member_id/coach_id — this module is the one place that bridges the two,
// so that bridge logic isn't duplicated per producer route.
import type { RecipientScope } from "./notifications.ts";
import { getFamilyMembersForAthlete } from "./familyRelationships.ts";

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
  const coachesPromise = fetch(
    `${BASE}/rest/v1/team_coaches?campaign_slug=eq.${encodeURIComponent(slug)}&select=account_id`,
    { headers: h(), cache: "no-store" },
  );

  // athlete_specific must go through the canonical family-relationships
  // module (Family Relationships Phase B fix) — the old direct
  // team_members?athlete_id=eq.<id> filter only ever saw the legacy single
  // athlete_id column, so a parent linked to this athlete only through
  // team_member_athletes (e.g. their second child on this team) was
  // silently excluded from athlete-specific pushes for that child.
  const memberAccountIdsPromise: Promise<(string | null)[]> =
    scope === "athlete_specific" && recipientAthleteId
      ? getFamilyMembersForAthlete(recipientAthleteId, slug).then(members => members.map(m => m.account_id))
      : (() => {
          let memberFilter = `campaign_slug=eq.${encodeURIComponent(slug)}`;
          if (scope === "athletes") memberFilter += "&role=eq.athlete";
          if (scope === "parents")  memberFilter += "&role=eq.parent";
          if (scope === "boosters") memberFilter += "&role=eq.booster";
          return fetch(`${BASE}/rest/v1/team_members?${memberFilter}&select=account_id`, { headers: h(), cache: "no-store" })
            .then(async res => {
              const rows: { account_id: string | null }[] = res.ok ? await res.json() : [];
              return rows.map(r => r.account_id);
            });
        })();

  const [memberAccountIds, coachRes] = await Promise.all([memberAccountIdsPromise, coachesPromise]);
  const coaches: { account_id: string | null }[] = coachRes.ok ? await coachRes.json() : [];

  return dedupe([...memberAccountIds, ...coaches.map(c => c.account_id)]);
}

/** Direct Messages — actual thread participants only, sender's ACCOUNT
 *  excluded. excludeActorKey is "coach:<id>" or "member:<id>", matching the
 *  same convention push.ts's sendPushToParticipants already uses — but the
 *  exclusion itself is applied by resolved account_id, not by actor key
 *  (Family Relationships Phase B fix). A coach who is also a parent can be
 *  represented in the same thread by TWO participant rows (their coach
 *  identity and their member identity) that both resolve to the same
 *  account_id; excluding only the literal sending key left the other
 *  identity's account_id in the result, so the sender could receive a push
 *  for their own message. Resolving every participant's account_id first,
 *  then excluding the sender's resolved account_id from the final
 *  deduped list, closes that regardless of how many participant rows
 *  represent the sender's account — without removing or altering any
 *  participant row, and without weakening who is authorized to be in the
 *  thread at all. */
export async function getAccountIdsForThreadParticipants(
  threadId: string,
  excludeActorKey: string,
): Promise<string[]> {
  // Group Messaging G1: a soft-removed participant (removed_at set) must
  // never receive a future push — excluded here, the single place native
  // push recipients are resolved for a thread. Always null for DM
  // participant rows, so this is a no-op filter for existing DM push.
  const res = await fetch(
    `${BASE}/rest/v1/message_thread_participants?thread_id=eq.${encodeURIComponent(threadId)}&removed_at=is.null&select=actor_type,coach_id,member_id`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  const rows: { actor_type: "coach" | "member"; coach_id: string | null; member_id: string | null }[] = await res.json();

  const coachIds  = [...new Set(rows.filter(r => r.actor_type === "coach"  && r.coach_id).map(r => r.coach_id!))];
  const memberIds = [...new Set(rows.filter(r => r.actor_type === "member" && r.member_id).map(r => r.member_id!))];

  const [coachRes, memberRes] = await Promise.all([
    coachIds.length  ? fetch(`${BASE}/rest/v1/team_coaches?id=in.(${coachIds.join(",")})&select=id,account_id`, { headers: h(), cache: "no-store" }) : null,
    memberIds.length ? fetch(`${BASE}/rest/v1/team_members?id=in.(${memberIds.join(",")})&select=id,account_id`, { headers: h(), cache: "no-store" }) : null,
  ]);
  const coaches:  { id: string; account_id: string | null }[] = coachRes?.ok  ? await coachRes.json()  : [];
  const members:  { id: string; account_id: string | null }[] = memberRes?.ok ? await memberRes.json() : [];

  const [excludeKind, excludeId] = excludeActorKey.split(":");
  const senderAccountId =
    excludeKind === "coach"  ? coaches.find(c => c.id === excludeId)?.account_id ?? null :
    excludeKind === "member" ? members.find(m => m.id === excludeId)?.account_id ?? null :
    null;

  const accountIds = dedupe([...coaches.map(c => c.account_id), ...members.map(m => m.account_id)]);
  return accountIds.filter(id => id !== senderAccountId);
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
