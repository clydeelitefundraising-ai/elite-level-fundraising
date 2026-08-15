import { createHmac, timingSafeEqual } from "crypto";

// Phase 4C: calendar subscription tokens — deterministic HMAC, NOT a
// stored secret. calendar_subscription_tokens stores only id,
// campaign_slug, created_at, revoked_at (see
// phase_4c2_calendar_subscription_tokens_hmac.sql, which dropped the
// original token_hash column/index). A bearer token is always
// `${row.id}.${HMAC-SHA256(row.id, CALENDAR_SYNC_PEPPER)}` — recomputed
// fresh from the row's own id every time it's needed, by the public feed
// route (validating an incoming token) and by the authenticated
// subscription route (handing the current active token to any team
// member). Nothing about the token itself is ever persisted, cached, or
// logged anywhere in this module.
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

// Fail closed: a missing pepper must never silently produce a workable
// (but unstable/regeneratable-by-restart) token. Thrown only when actually
// needed, matching this repo's existing *_PEPPER getters (teamAuth.ts,
// memberAuth.ts, adminAuth.ts, accountAuth.ts) — importing this module
// never throws, only computing a token does.
function getPepper(): string {
  const p = process.env.CALENDAR_SYNC_PEPPER;
  if (!p) throw new Error("CALENDAR_SYNC_PEPPER environment variable is required but not set");
  return p;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HMAC_RE = /^[0-9a-f]{64}$/;

export function computeTokenHmac(id: string): string {
  return createHmac("sha256", getPepper()).update(id).digest("hex");
}

export function buildSubscriptionToken(id: string): string {
  return `${id}.${computeTokenHmac(id)}`;
}

// Parses a raw token into {id, hmac}, validating SHAPE only (well-formed
// UUID + 64 hex chars) — never touches the database and never validates
// the HMAC's correctness. Returns null for anything malformed, exactly
// like an unknown/revoked token from the caller's point of view.
export function parseSubscriptionToken(raw: string): { id: string; hmac: string } | null {
  const dot = raw.indexOf(".");
  if (dot === -1) return null;
  const id = raw.slice(0, dot);
  const hmac = raw.slice(dot + 1);
  if (!UUID_RE.test(id)) return null;
  if (!HMAC_RE.test(hmac)) return null;
  return { id, hmac };
}

export type SubscriptionStatus =
  | { enabled: false }
  | { enabled: true; createdAt: string; token: string };

// Member-safe: recomputes the current active token (if any) from the
// active row's id. Safe to call for any authenticated team member — never
// touches CALENDAR_SYNC_PEPPER's value, database internals, or revoked
// rows in the response.
export async function getActiveSubscription(slug: string): Promise<SubscriptionStatus> {
  const res = await fetch(
    `${BASE}/rest/v1/calendar_subscription_tokens?campaign_slug=eq.${encodeURIComponent(slug)}` +
      `&revoked_at=is.null&select=id,created_at&order=created_at.desc&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return { enabled: false };
  const rows: { id: string; created_at: string }[] = await res.json();
  if (rows.length === 0) return { enabled: false };
  return { enabled: true, createdAt: rows[0].created_at, token: buildSubscriptionToken(rows[0].id) };
}

async function revokeActiveRow(slug: string): Promise<void> {
  await fetch(
    `${BASE}/rest/v1/calendar_subscription_tokens?campaign_slug=eq.${encodeURIComponent(slug)}&revoked_at=is.null`,
    { method: "PATCH", headers: h(), body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
  );
}

// Ensures exactly one fresh, active row for this campaign: revokes any
// currently-active row (no-op if none), inserts a new one, and derives
// the token from its id. Serves both "create the initial token" and
// "regenerate/rotate" — the effect (issue a fresh active token,
// invalidating any prior one) is identical either way.
//
// A single retry handles the narrow race where two regenerate requests
// overlap and the partial unique index (one active row per campaign)
// rejects our insert because a concurrent request's row won first — the
// retry revokes that row too and re-inserts, so this request's token
// ends up active (last writer wins), converging on exactly one active
// row either way. Any other failure surfaces as a generic error, never a
// raw Postgres message.
export async function issueSubscriptionToken(slug: string): Promise<{ token: string; createdAt: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await revokeActiveRow(slug);

    const res = await fetch(`${BASE}/rest/v1/calendar_subscription_tokens`, {
      method: "POST",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ campaign_slug: slug }),
    });
    if (res.ok) {
      const rows: { id: string; created_at: string }[] = await res.json();
      const row = rows[0];
      return { token: buildSubscriptionToken(row.id), createdAt: row.created_at };
    }
    // 409 = the partial unique index rejected a concurrent insert; retry
    // once. Anything else falls through to the generic error below.
    if (res.status !== 409 || attempt === 1) break;
  }
  throw new Error("Failed to issue calendar subscription token");
}

export async function revokeSubscriptionToken(slug: string): Promise<void> {
  await revokeActiveRow(slug);
}

// Public feed lookup. Token alone resolves the campaign — no slug is ever
// accepted from the caller. Malformed shape, nonexistent row, revoked
// row, and HMAC mismatch all resolve to null identically; the caller
// (the public feed route) must turn every one of those into the same
// 404, never distinguishing which case occurred.
export async function resolveCampaignByToken(rawToken: string): Promise<string | null> {
  const parsed = parseSubscriptionToken(rawToken);
  if (!parsed) return null;

  const res = await fetch(
    `${BASE}/rest/v1/calendar_subscription_tokens?id=eq.${parsed.id}&select=campaign_slug,revoked_at&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows: { campaign_slug: string; revoked_at: string | null }[] = await res.json();
  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at !== null) return null;

  const expected = computeTokenHmac(parsed.id);
  const a = Buffer.from(parsed.hmac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return row.campaign_slug;
}
