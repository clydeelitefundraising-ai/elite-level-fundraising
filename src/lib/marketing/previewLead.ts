// Fundraising-preview lead capture — the pure, testable core. The route
// (src/app/api/marketing/preview-lead/route.ts) only adapts HTTP to this;
// storage and email are injected (src/lib/platform/previewLeads.ts) so the
// rules below are unit-tested without a database or a mail provider.
//
// Rules this module guarantees:
//   - Full name + email are required; marketing consent is a separate,
//     optional boolean that defaults to false and never affects unlocking.
//   - Email is normalized (trimmed, lower-cased) before lookup/storage.
//   - An existing CRM contact with the same email is NEVER overwritten: its
//     name, email, status, source and notes stay exactly as they were; the
//     visit is only logged as an activity, and consent is only ever added
//     (never removed) when the visitor opts in.
//   - The notification goes only to the configured business address
//     (DEMO_NOTIFICATION_EMAIL) — never to an address the visitor typed.
//   - The whole feature is off unless every dependency is configured
//     (previewLeadReadiness): durable rate limiting, the business inbox and
//     an explicit switch that confirms the consent columns exist.

export const PREVIEW_LEAD_SOURCE = "Fundraising Preview";

/** Shown next to the checkbox and stored verbatim with an opt-in. */
export const MARKETING_CONSENT_TEXT =
  "Email me ELF product updates and fundraising tips. I can unsubscribe at any time.";
export const MARKETING_CONSENT_VERSION = "preview-v1";

const MAX_NAME = 120;
const MAX_EMAIL = 200;
// Deliberately conservative: no characters that are special in a PostgREST
// filter or a LIKE pattern beyond the escapable % and _ (see crm lookup).
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

export type PreviewLeadInput = { fullName: string; email: string; marketingConsent: boolean };

export type ValidationResult =
  | { ok: true; value: PreviewLeadInput }
  | { ok: false; errors: Partial<Record<"fullName" | "email" | "marketingConsent", string>> };

/** Escape LIKE wildcards so a PostgREST `ilike` is a case-insensitive EXACT match. */
export function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function validatePreviewLead(body: unknown): ValidationResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const fullName = str(b.fullName).replace(/\s+/g, " ").trim();
  const email = normalizeEmail(str(b.email));
  const errors: Partial<Record<"fullName" | "email" | "marketingConsent", string>> = {};

  if (!fullName) errors.fullName = "Enter your full name.";
  else if (fullName.length > MAX_NAME) errors.fullName = "That name is too long.";
  else if (/[<>{}\u0000-\u001f]/.test(fullName)) errors.fullName = "Enter your name using letters only.";

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  // Consent must be an explicit boolean true to count; anything else
  // (missing, "true", 1) is treated as not consenting.
  if (b.marketingConsent !== undefined && typeof b.marketingConsent !== "boolean") {
    errors.marketingConsent = "Invalid consent value.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { fullName, email, marketingConsent: b.marketingConsent === true } };
}

/** Honeypot: a hidden field real visitors never fill in. */
export function isBot(body: unknown): boolean {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return str(b.website).trim().length > 0;
}

export type Readiness = { ready: boolean; missing: string[] };

/** Every dependency that must be in place before the gate may go live. */
export function previewLeadReadiness(env: Record<string, string | undefined>): Readiness {
  const missing: string[] = [];
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) missing.push("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (durable rate limiting)");
  if (!env.DEMO_NOTIFICATION_EMAIL) missing.push("DEMO_NOTIFICATION_EMAIL (business notification inbox)");
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) missing.push("Supabase server credentials (CRM writes)");
  if (env.MARKETING_PREVIEW_LEAD_GATE !== "on") missing.push("MARKETING_PREVIEW_LEAD_GATE=on (confirms the consent migration is applied)");
  return { ready: missing.length === 0, missing };
}

/** Same-origin check for the browser form post (blocks cross-site posting). */
export function isSameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export type ExistingContact = { id: string; marketing_consent: boolean | null };

export type PreviewLeadStore = {
  findContactByEmail(normalizedEmail: string): Promise<ExistingContact | null>;
  createContact(input: { name: string; email: string; source: string; consent: ConsentRecord | null }): Promise<{ id: string }>;
  addActivity(contactId: string, title: string, body: string): Promise<void>;
  recordConsent(contactId: string, consent: ConsentRecord): Promise<void>;
};

export type ConsentRecord = { at: string; text: string; source: string };

export type PreviewLeadNotifier = (p: { to: string; fullName: string; email: string; marketingConsent: boolean; isNewContact: boolean }) => Promise<void>;

export type RecordResult = { contactId: string; isNewContact: boolean; notified: boolean };

export async function recordPreviewLead(
  lead: PreviewLeadInput,
  deps: { store: PreviewLeadStore; notify: PreviewLeadNotifier; notifyTo: string; now?: () => Date },
): Promise<RecordResult> {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const consent: ConsentRecord | null = lead.marketingConsent
    ? { at: now, text: MARKETING_CONSENT_TEXT, source: `${PREVIEW_LEAD_SOURCE} (${MARKETING_CONSENT_VERSION})` }
    : null;

  const existing = await deps.store.findContactByEmail(lead.email);
  let contactId: string;
  let isNewContact = false;
  if (existing) {
    contactId = existing.id;
    if (consent && existing.marketing_consent !== true) await deps.store.recordConsent(contactId, consent);
  } else {
    contactId = (await deps.store.createContact({ name: lead.fullName, email: lead.email, source: PREVIEW_LEAD_SOURCE, consent })).id;
    isNewContact = true;
  }

  await deps.store.addActivity(
    contactId,
    "Unlocked the fundraising preview",
    [
      `Name given: ${lead.fullName}`,
      `Marketing emails: ${lead.marketingConsent ? "opted in" : "not opted in"}`,
      isNewContact ? "New contact created from the website." : "Existing contact — details left unchanged.",
    ].join("\n"),
  );

  // Lead is stored; the notification is best-effort and only ever goes to
  // the configured business inbox.
  let notified = false;
  try {
    await deps.notify({ to: deps.notifyTo, fullName: lead.fullName, email: lead.email, marketingConsent: lead.marketingConsent, isNewContact });
    notified = true;
  } catch (err) {
    console.error("[preview-lead] notification failed:", err);
  }
  return { contactId, isNewContact, notified };
}
