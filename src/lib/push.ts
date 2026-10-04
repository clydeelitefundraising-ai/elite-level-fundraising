import webpush from "web-push";
import type { RecipientScope } from "@/lib/notifications";
import type { ParticipantRef } from "@/lib/messages";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Deferred (not module-load-time): some deployments — e.g. the marketing
// site build, which pulls in this module transitively via
// /api/jobs/notifications but never actually sends a push — don't have
// VAPID env vars configured. Configuring eagerly at import time made the
// entire build fail for those deployments even though push is never used.
let vapidConfigured = false;
function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidConfigured = true;
}

type PushSub = {
  id: string;
  platform: string;
  endpoint: string | null;
  p256dh: string | null;
  auth_key: string | null;
  expo_token: string | null;
  member_id: string | null;
  coach_id: string | null;
  // Embedded from team_members when member_id is set
  team_members: { role: string; athlete_id: string | null; account_id: string | null } | null;
  // Embedded from team_coaches when coach_id is set — account_id only,
  // needed solely for the account-id resolution in sendPushToParticipants()
  // below (Group Messaging G1 fix).
  team_coaches: { account_id: string | null } | null;
};

async function fetchSubscriptions(slug: string): Promise<PushSub[]> {
  const url =
    `${BASE}/rest/v1/push_subscriptions` +
    `?campaign_slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,platform,endpoint,p256dh,auth_key,expo_token,member_id,coach_id,` +
    `team_members!member_id(role,athlete_id,account_id),team_coaches!coach_id(account_id)`;
  const res = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return res.json();
}

async function removeStale(id: string): Promise<void> {
  await fetch(`${BASE}/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
}

async function dispatchPush(
  sub: PushSub,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  if (sub.platform === "web" && sub.endpoint && sub.p256dh && sub.auth_key) {
    try {
      ensureVapidConfigured();
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify(payload),
      );
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 410 || status === 404) await removeStale(sub.id);
    }
  }
  // expo_token path: reserved for future Expo push support
}

function subMatchesScope(
  sub: PushSub,
  scope: RecipientScope,
  recipientAthleteId: string | null,
): boolean {
  if (scope === "everyone") return true;

  // Legacy sub (no member_id) — only included in "everyone" broadcasts
  if (!sub.member_id || !sub.team_members) return false;

  const { role, athlete_id } = sub.team_members;

  switch (scope) {
    case "athletes":        return role === "athlete";
    case "parents":         return role === "parent";
    case "boosters":        return role === "booster";
    case "athlete_specific":
      return athlete_id !== null && athlete_id === recipientAthleteId;
    default: return false;
  }
}

export async function sendPushToScope(
  slug: string,
  scope: RecipientScope,
  recipientAthleteId: string | null,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  const subs = await fetchSubscriptions(slug);
  if (!subs.length) return;

  const targeted = subs.filter(s => subMatchesScope(s, scope, recipientAthleteId));
  if (!targeted.length) return;

  await Promise.allSettled(targeted.map(sub => dispatchPush(sub, payload)));
}

/** Send push to a given list of participants (a DM/group thread's active
 *  participants, or an arbitrary recipient list like "every Head Coach" —
 *  this function has always been used both ways, see
 *  notifyHeadCoachesOfPendingComment() and processPush()), excluding the
 *  sender's ACCOUNT — not just the sender's literal actor key.
 *
 *  Group Messaging G1 fix: this used to dedupe/exclude by raw actor key
 *  ("coach:<id>" / "member:<id>"), so a coach-who-is-also-a-parent
 *  (represented by two participant rows/refs that resolve to the same
 *  account) could still self-notify via this legacy web-push channel
 *  through whichever row wasn't the literal sender — even though the
 *  newer native-push path (getAccountIdsForThreadParticipants,
 *  pushRecipients.ts) already resolved this correctly for the same
 *  scenario. Every participant ref is now resolved to its account_id
 *  first (same resolve-then-dedupe-then-exclude shape as that function),
 *  so the fix applies uniformly to a thread's participant list (which
 *  getThreadParticipants() already returns with soft-removed rows
 *  excluded — a removed group participant is never in `participants` at
 *  all) and to a non-thread recipient list alike. */
// Extracted so the account-resolution/dedupe/exclusion fix is independently
// testable without needing to mock the web-push library or push_subscriptions
// — mirrors getAccountIdsForThreadParticipants's (pushRecipients.ts) exact
// resolve-then-dedupe-then-exclude shape, the function this one was
// previously NOT consistent with (see sendPushToParticipants's doc comment).
export async function resolveEligiblePushAccountIds(
  participants: ParticipantRef[],
  excludeActorKey: string,
): Promise<string[]> {
  const coachIds  = [...new Set(participants.filter(p => p.actor_type === "coach"  && p.coach_id).map(p => p.coach_id as string))];
  const memberIds = [...new Set(participants.filter(p => p.actor_type === "member" && p.member_id).map(p => p.member_id as string))];
  if (!coachIds.length && !memberIds.length) return [];

  const [coachRows, memberRows] = await Promise.all([
    coachIds.length
      ? fetch(`${BASE}/rest/v1/team_coaches?id=in.(${coachIds.join(",")})&select=id,account_id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" })
          .then(async res => (res.ok ? await res.json() : []) as { id: string; account_id: string | null }[])
      : Promise.resolve([] as { id: string; account_id: string | null }[]),
    memberIds.length
      ? fetch(`${BASE}/rest/v1/team_members?id=in.(${memberIds.join(",")})&select=id,account_id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" })
          .then(async res => (res.ok ? await res.json() : []) as { id: string; account_id: string | null }[])
      : Promise.resolve([] as { id: string; account_id: string | null }[]),
  ]);

  const [excludeKind, excludeId] = excludeActorKey.split(":");
  const senderAccountId =
    excludeKind === "coach"  ? coachRows.find(c => c.id === excludeId)?.account_id ?? null :
    excludeKind === "member" ? memberRows.find(m => m.id === excludeId)?.account_id ?? null :
    null;

  return [
    ...new Set(
      [...coachRows.map(c => c.account_id), ...memberRows.map(m => m.account_id)]
        .filter((id): id is string => Boolean(id) && id !== senderAccountId),
    ),
  ];
}

export async function sendPushToParticipants(
  slug: string,
  participants: ParticipantRef[],
  excludeActorKey: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  const eligibleAccountIds = new Set(await resolveEligiblePushAccountIds(participants, excludeActorKey));
  if (!eligibleAccountIds.size) return;

  const subs = await fetchSubscriptions(slug);
  if (!subs.length) return;

  const targeted = subs.filter(s => {
    const accountId = s.member_id ? s.team_members?.account_id : s.coach_id ? s.team_coaches?.account_id : null;
    return accountId != null && eligibleAccountIds.has(accountId);
  });

  await Promise.allSettled(targeted.map(sub => dispatchPush(sub, payload)));
}

/** Backwards-compatible broadcast to all subscribers. */
export async function sendPushToTeam(
  slug: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  return sendPushToScope(slug, "everyone", null, payload);
}
