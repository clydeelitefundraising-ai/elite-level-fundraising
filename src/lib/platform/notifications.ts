// Notifications Service — Delivery Platform (Phase A18A).
//
// Centralized outbox for email, push, SMS, and internal notifications.
// This module only queues rows into `notification_queue` and manages their
// lifecycle (queued -> processing -> sent/failed/cancelled). It never sends
// anything itself — actual delivery lives in `notificationJobs.ts`, which
// drains the queue the same way `jobs.ts` drains automation rule runs.

import { restList, restInsert, restUpdate } from "./_client";

export type NotificationChannel = "email" | "push" | "sms" | "internal";
export type NotificationStatus  = "queued" | "processing" | "sent" | "failed" | "cancelled";

export type NotificationQueueRow = {
  id:             string;
  channel:        NotificationChannel;
  recipient_type: string;
  recipient_id:   string | null;
  email:          string | null;
  phone:          string | null;
  title:          string;
  body:           string;
  payload:        Record<string, unknown>;
  status:         NotificationStatus;
  attempts:       number;
  scheduled_for:  string;
  sent_at:        string | null;
  last_error:     string | null;
  created_at:     string;
};

export type QueueNotificationInput = {
  channel:        NotificationChannel;
  recipientType:  string;
  recipientId?:   string | null;
  email?:         string | null;
  phone?:         string | null;
  title:          string;
  body:           string;
  payload?:       Record<string, unknown>;
  scheduledFor?:  string; // ISO timestamp; defaults to now on the DB side
};

export type QueueEmailInput = Omit<QueueNotificationInput, "channel" | "email"> & { email: string };
export type QueuePushInput  = Omit<QueueNotificationInput, "channel"> & { campaignSlug?: string | null };
export type QueueSMSInput   = Omit<QueueNotificationInput, "channel" | "phone"> & { phone: string };
export type QueueInternalInput = Omit<QueueNotificationInput, "channel" | "recipientType" | "recipientId"> & {
  recipientType?: string;
  recipientId?:   string | null;
};

export type QueueFilters = {
  channel?:  NotificationChannel;
  status?:   NotificationStatus;
  from?:     string; // created_at >= from
  to?:       string; // created_at <= to
  limit?:    number;
};

export type QueueSummary = {
  queued:     number;
  processing: number;
  sent:       number;
  failed:     number;
  cancelled:  number;
};

// ── Queueing ────────────────────────────────────────────────────────────────

export async function queueNotification(input: QueueNotificationInput): Promise<NotificationQueueRow> {
  const rows = await restInsert<NotificationQueueRow>("notification_queue", {
    channel:        input.channel,
    recipient_type: input.recipientType,
    recipient_id:   input.recipientId ?? null,
    email:          input.email ?? null,
    phone:          input.phone ?? null,
    title:          input.title,
    body:           input.body,
    payload:        input.payload ?? {},
    scheduled_for:  input.scheduledFor ?? new Date().toISOString(),
  });
  return rows[0];
}

export function queueEmail(input: QueueEmailInput): Promise<NotificationQueueRow> {
  return queueNotification({ ...input, channel: "email" });
}

// campaignSlug is folded into payload — processPush() reads it back out to
// reuse the existing slug-scoped push service (lib/push.ts) instead of a
// second delivery path.
export function queuePush(input: QueuePushInput): Promise<NotificationQueueRow> {
  const { campaignSlug, payload, ...rest } = input;
  return queueNotification({
    ...rest,
    channel: "push",
    payload: campaignSlug ? { ...(payload ?? {}), campaignSlug } : payload,
  });
}

export function queueSMS(input: QueueSMSInput): Promise<NotificationQueueRow> {
  return queueNotification({ ...input, channel: "sms" });
}

// Internal notifications don't need a specific recipient — they exist to
// surface in the admin Notifications/Operations UI.
export function queueInternal(input: QueueInternalInput): Promise<NotificationQueueRow> {
  return queueNotification({
    ...input,
    channel:       "internal",
    recipientType: input.recipientType ?? "admin",
    body:          input.body ?? "",
  });
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

export async function cancelNotification(id: string): Promise<NotificationQueueRow | null> {
  const rows = await restUpdate<NotificationQueueRow>(
    `notification_queue?id=eq.${encodeURIComponent(id)}&status=in.(queued,processing)`,
    { status: "cancelled" },
  );
  return rows[0] ?? null;
}

export async function markSent(id: string): Promise<NotificationQueueRow | null> {
  const rows = await restUpdate<NotificationQueueRow>(`notification_queue?id=eq.${encodeURIComponent(id)}`, {
    status: "sent", sent_at: new Date().toISOString(),
  });
  return rows[0] ?? null;
}

// nextAttempts is computed by the caller (it already holds the row being
// processed), matching the jobs.ts pattern of the caller owning the counter.
export async function markFailed(id: string, nextAttempts: number, error: string): Promise<NotificationQueueRow | null> {
  const rows = await restUpdate<NotificationQueueRow>(`notification_queue?id=eq.${encodeURIComponent(id)}`, {
    status: "failed", attempts: nextAttempts, last_error: error,
  });
  return rows[0] ?? null;
}

export async function markProcessing(id: string): Promise<NotificationQueueRow | null> {
  const rows = await restUpdate<NotificationQueueRow>(`notification_queue?id=eq.${encodeURIComponent(id)}`, {
    status: "processing",
  });
  return rows[0] ?? null;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getQueue(filters: QueueFilters = {}): Promise<NotificationQueueRow[]> {
  const params = ["select=*", `order=created_at.desc`, `limit=${filters.limit ?? 200}`];
  if (filters.channel) params.push(`channel=eq.${encodeURIComponent(filters.channel)}`);
  if (filters.status)  params.push(`status=eq.${encodeURIComponent(filters.status)}`);
  if (filters.from)    params.push(`created_at=gte.${encodeURIComponent(filters.from)}`);
  if (filters.to)      params.push(`created_at=lte.${encodeURIComponent(filters.to)}`);
  return restList<NotificationQueueRow>(`notification_queue?${params.join("&")}`);
}

export async function getQueueSummary(): Promise<QueueSummary> {
  const rows = await restList<{ status: NotificationStatus }>(
    "notification_queue?select=status&limit=10000",
  );
  const summary: QueueSummary = { queued: 0, processing: 0, sent: 0, failed: 0, cancelled: 0 };
  for (const r of rows) summary[r.status]++;
  return summary;
}

// Queued notifications past their scheduled_for time by more than
// staleMinutes — a sign the delivery job isn't running or is falling behind.
export async function getStaleQueued(staleMinutes = 60): Promise<NotificationQueueRow[]> {
  const cutoff = new Date(Date.now() - staleMinutes * 60000).toISOString();
  return restList<NotificationQueueRow>(
    `notification_queue?status=eq.queued&scheduled_for=lt.${encodeURIComponent(cutoff)}&select=*&order=scheduled_for.asc&limit=200`,
  );
}

export async function getRecentFailures(limit = 20): Promise<NotificationQueueRow[]> {
  return restList<NotificationQueueRow>(
    `notification_queue?status=eq.failed&select=*&order=created_at.desc&limit=${limit}`,
  );
}
