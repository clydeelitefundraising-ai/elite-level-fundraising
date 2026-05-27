import webpush from "web-push";

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
};

async function fetchSubscriptions(slug: string): Promise<PushSub[]> {
  const url = `${BASE}/rest/v1/push_subscriptions?campaign_slug=eq.${encodeURIComponent(slug)}&select=id,platform,endpoint,p256dh,auth_key,expo_token`;
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

export async function sendPushToTeam(
  slug: string,
  payload: { title: string; body: string; url: string },
): Promise<void> {
  const subs = await fetchSubscriptions(slug);
  if (!subs.length) return;

  await Promise.allSettled(
    subs.map(async (sub) => {
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
      } else if (sub.platform === "expo" && sub.expo_token) {
        // Future: dispatch to Expo push service
        // await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", ... })
      }
    }),
  );
}
