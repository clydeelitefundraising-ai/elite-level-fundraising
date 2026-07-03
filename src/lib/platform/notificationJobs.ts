// Notification Delivery Job (Phase A18A).
//
// Drains `notification_queue` the way jobs.ts drains automation rule runs:
// this module owns "what happened when we tried to send it", not the queue
// rows themselves (that's notifications.ts). Real carriers (Resend, Twilio,
// Expo/APNs/FCM) are not wired up yet — email and SMS intentionally report
// Not Implemented so callers fail loudly instead of silently no-op-ing.

import { sendPushToParticipants } from "@/lib/push";
import {
  getQueue, markProcessing, markSent, markFailed,
  type NotificationQueueRow,
} from "./notifications";

export type ChannelResult = { success: boolean; error?: string };

export type ProcessQueueResult = {
  queued:    number;
  processed: number;
  sent:      number;
  failed:    number;
  durationMs: number;
};

export async function processEmail(_n: NotificationQueueRow): Promise<ChannelResult> {
  return { success: false, error: "Not Implemented: email delivery (no carrier configured yet)" };
}

export async function processSMS(_n: NotificationQueueRow): Promise<ChannelResult> {
  return { success: false, error: "Not Implemented: SMS delivery (no carrier configured yet)" };
}

// Reuses lib/push.ts (the existing web-push service) rather than a second
// delivery path. Requires a campaignSlug in payload — queuePush() folds it
// in when provided — since push_subscriptions are keyed by campaign_slug.
export async function processPush(n: NotificationQueueRow): Promise<ChannelResult> {
  const campaignSlug = n.payload?.campaignSlug;
  if (typeof campaignSlug !== "string" || !campaignSlug) {
    return { success: false, error: "Missing campaignSlug in payload — cannot resolve push subscriptions" };
  }
  if (n.recipient_type !== "coach" && n.recipient_type !== "member") {
    return { success: false, error: `Unsupported recipient_type for push: ${n.recipient_type}` };
  }
  if (!n.recipient_id) {
    return { success: false, error: "Missing recipient_id for push delivery" };
  }

  try {
    await sendPushToParticipants(
      campaignSlug,
      [{
        actor_type: n.recipient_type,
        coach_id:  n.recipient_type === "coach"  ? n.recipient_id : null,
        member_id: n.recipient_type === "member" ? n.recipient_id : null,
      }],
      "__notification_job__", // never matches a real participant key — don't exclude anyone
      { title: n.title, body: n.body, url: typeof n.payload?.url === "string" ? n.payload.url : "/" },
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Push delivery failed" };
  }
}

// Internal notifications carry no external carrier — existing as a row in
// the queue *is* the delivery, so this just confirms it.
export async function processInternal(_n: NotificationQueueRow): Promise<ChannelResult> {
  return { success: true };
}

function processorFor(channel: NotificationQueueRow["channel"]) {
  switch (channel) {
    case "email":    return processEmail;
    case "sms":      return processSMS;
    case "push":     return processPush;
    case "internal": return processInternal;
  }
}

// Claims due queued notifications, routes each to its channel processor, and
// records the outcome. Best-effort per row — one failure never stops the
// batch, mirroring runRules()'s all-or-nothing-per-item approach.
export async function processQueue(limit = 100): Promise<ProcessQueueResult> {
  const start = Date.now();

  const due = (await getQueue({ status: "queued", limit })).filter(
    n => new Date(n.scheduled_for).getTime() <= Date.now(),
  );

  let sent = 0;
  let failed = 0;

  for (const n of due) {
    await markProcessing(n.id);
    const processor = processorFor(n.channel);
    const result = await processor(n).catch((err): ChannelResult => ({
      success: false, error: err instanceof Error ? err.message : "Unknown delivery error",
    }));

    if (result.success) {
      await markSent(n.id);
      sent++;
    } else {
      await markFailed(n.id, n.attempts + 1, result.error ?? "Delivery failed");
      failed++;
    }
  }

  return {
    queued:     due.length,
    processed:  due.length,
    sent,
    failed,
    durationMs: Date.now() - start,
  };
}
