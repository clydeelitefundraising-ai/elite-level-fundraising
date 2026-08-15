import { createHash, randomBytes } from "crypto";

// Phase 4C: calendar subscription tokens — same shape as coachInvite.ts's
// proven pattern (256-bit random hex token, SHA-256 hash stored, raw
// token never persisted). One active (non-revoked) row per campaign_slug
// at a time, enforced by calendar_subscription_tokens' partial unique
// index — see supabase/migrations/phase_4c_calendar_subscription_tokens.sql.
//
// SECURITY: never log the raw token or its hash anywhere in this module.
// The raw token is returned to the caller exactly once, at creation or
// rotation time, and is never persisted, cached, or logged again after
// that — by design, it cannot be recovered from the database afterward.

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function generateSubscriptionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSubscriptionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type SubscriptionStatus = { enabled: boolean; createdAt?: string };

// Member-safe: existence only, never the hash or any token material.
export async function getSubscriptionStatus(slug: string): Promise<SubscriptionStatus> {
  const res = await fetch(
    `${BASE}/rest/v1/calendar_subscription_tokens?campaign_slug=eq.${encodeURIComponent(slug)}` +
      `&revoked_at=is.null&select=created_at&order=created_at.desc&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return { enabled: false };
  const rows: { created_at: string }[] = await res.json();
  if (rows.length === 0) return { enabled: false };
  return { enabled: true, createdAt: rows[0].created_at };
}

// Ensures exactly one fresh, active token for this campaign: revokes any
// currently-active row (no-op if none), then inserts a new one. Serves
// both "create the initial token" and "regenerate/rotate" — the UI
// presents these as distinct staff actions, but the underlying effect
// (issue a fresh active token, invalidating any prior one) is identical,
// so one function backs both.
export async function issueSubscriptionToken(slug: string): Promise<{ token: string; createdAt: string }> {
  await fetch(
    `${BASE}/rest/v1/calendar_subscription_tokens?campaign_slug=eq.${encodeURIComponent(slug)}&revoked_at=is.null`,
    { method: "PATCH", headers: h(), body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
  );

  const token = generateSubscriptionToken();
  const tokenHash = hashSubscriptionToken(token);

  const res = await fetch(`${BASE}/rest/v1/calendar_subscription_tokens`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({ campaign_slug: slug, token_hash: tokenHash }),
  });
  if (!res.ok) {
    // Deliberately does not include response body in the thrown error —
    // it could theoretically echo back request content; keep this generic.
    throw new Error("Failed to issue calendar subscription token");
  }
  const rows: { created_at: string }[] = await res.json();
  return { token, createdAt: rows[0].created_at };
}

// Revokes the active token, if any. Idempotent — revoking when nothing is
// active is a harmless no-op (PATCH affecting zero rows).
export async function revokeSubscriptionToken(slug: string): Promise<void> {
  await fetch(
    `${BASE}/rest/v1/calendar_subscription_tokens?campaign_slug=eq.${encodeURIComponent(slug)}&revoked_at=is.null`,
    { method: "PATCH", headers: h(), body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
  );
}

// Public feed lookup: token alone resolves the campaign. Hashes the
// incoming raw token before ever touching the database — the raw token
// is never used directly in a query. Returns null for unknown, malformed,
// AND revoked tokens alike (identical outcome, by design — see the public
// feed route, which must turn all three into the same 404).
export async function resolveCampaignByToken(rawToken: string): Promise<string | null> {
  if (!rawToken || !/^[0-9a-f]{64}$/.test(rawToken)) return null;
  const tokenHash = hashSubscriptionToken(rawToken);
  const res = await fetch(
    `${BASE}/rest/v1/calendar_subscription_tokens?token_hash=eq.${tokenHash}` +
      `&revoked_at=is.null&select=campaign_slug&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: { campaign_slug: string }[] = await res.json();
  return rows[0]?.campaign_slug ?? null;
}
