// Notifications Service — INTERFACE ONLY (Phase A14B).
//
// This establishes the shape future phases will call into once real delivery
// (Resend email, web push, Twilio SMS) is wired up. Nothing in this file
// sends anything yet — every export throws "Not implemented" so any
// accidental early caller fails loudly instead of silently no-op-ing.
//
// Intended flow once implemented: automation.createEvent() (or any other
// service) calls one of these queue* functions, which writes a durable
// outbox row; a future scheduled job/worker drains the outbox and performs
// the actual send. That queue table does not exist yet — this phase is
// architecture only, per the Phase A14B scope.

export type NotificationRecipient = {
  email?: string | null;
  phone?: string | null;
  coachId?: string | null;
  memberId?: string | null;
};

export type QueueEmailInput = {
  to:      NotificationRecipient;
  subject: string;
  body:    string;
  campaignSlug?: string | null;
};

export type QueuePushInput = {
  to:    NotificationRecipient;
  title: string;
  body:  string;
  campaignSlug?: string | null;
};

export type QueueSMSInput = {
  to:   NotificationRecipient;
  body: string;
  campaignSlug?: string | null;
};

// "Internal" = shows up in the admin Notifications/Operations UI without
// leaving the platform (no email/push/SMS carrier involved).
export type QueueInternalInput = {
  title: string;
  body?: string | null;
  campaignSlug?: string | null;
  severity?: "info" | "warning" | "critical";
};

export type DigestInput = {
  audience: "admin" | "coach";
  campaignSlug?: string | null;
};

export async function queueEmail(_input: QueueEmailInput): Promise<never> {
  throw new Error("Not implemented: queueEmail() — Notifications Service is a stub in Phase A14B.");
}

export async function queuePush(_input: QueuePushInput): Promise<never> {
  throw new Error("Not implemented: queuePush() — Notifications Service is a stub in Phase A14B.");
}

export async function queueSMS(_input: QueueSMSInput): Promise<never> {
  throw new Error("Not implemented: queueSMS() — Notifications Service is a stub in Phase A14B.");
}

export async function queueInternal(_input: QueueInternalInput): Promise<never> {
  throw new Error("Not implemented: queueInternal() — Notifications Service is a stub in Phase A14B.");
}

export async function sendDigest(_input: DigestInput): Promise<never> {
  throw new Error("Not implemented: sendDigest() — Notifications Service is a stub in Phase A14B.");
}
