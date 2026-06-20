import webpush from "web-push";
import type { RecipientScope } from "@/lib/notifications";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

type PushSub = {
  id: string;
  platform: string;
  endpoint: string | null;
  p256dh: string | null;
  auth_key: string | null;
  expo_token: string | null;
  member_id: string | null;
  // Embedded from team_members when member_id is set
  team_members: { role: string; athlete_id: string | null } | null;
};

async function fetchSubscriptions(slug: string): Promise<PushSub[]> {
  const url =
    `${BASE}/rest/v1/push_subscriptions` +
    `?campaign_slug=eq.${encodeURIComponent(slug)}` +
    `&select=id,platform,endpoint,p256dh,auth_key,expo_token,member_id,team_members!member_id(role,athlete_id)`;
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

/** Backwards-compatible broadcast to all subscribers. */
export async function sendPushToTeam(
  slug: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  return sendPushToScope(slug, "everyone", null, payload);
}
