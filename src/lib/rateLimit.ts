import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import { getTrustedClientIp } from "@/lib/clientIp";

let _redis: Redis | undefined;

function r(): Redis {
  if (!_redis) {
    const url   = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
    }
    _redis = new Redis({ url, token });
  }
  return _redis;
}

export interface RateLimitConfig {
  /** Maximum failed attempts before the IP is blocked. */
  limit:         number;
  /** Duration of the window in seconds, anchored to the first failure. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed:    boolean;
  /** Remaining attempts before the window blocks this IP. */
  remaining:  number;
  /** Seconds until the window resets. 0 when allowed. */
  retryAfter: number;
}

type HeadersLike = { headers: { get(name: string): string | null } };

/**
 * Extract the trusted client IP. Kept as a re-export under this name so
 * every existing caller (rateLimitKey below, and the couple of routes that
 * build their own keys directly) picks up the verified-safe implementation
 * with no call-site changes. See src/lib/clientIp.ts for the trust-boundary
 * analysis and verification behind this.
 */
export const getClientIp = getTrustedClientIp;

/**
 * Short tag identifying which deployment environment this key belongs to.
 * Upstash's free tier allows only one Redis database, so Preview and
 * Production share a single instance — this tag is what keeps their rate
 * limit buckets from colliding with each other despite that. Derived from
 * VERCEL_ENV (set by Vercel at runtime, not client-controllable), never
 * from a header, so it can't be spoofed by a request.
 */
function environmentTag(): string {
  const env = process.env.VERCEL_ENV;
  if (env === "production") return "prod";
  if (env === "preview") return "preview";
  return "dev";
}

/**
 * Build a namespaced rate-limit key: "rl:<env>:<prefix>:<ip>".
 * Use a distinct prefix per route so limits are independent.
 */
export function rateLimitKey(prefix: string, req: HeadersLike): string {
  return `rl:${environmentTag()}:${prefix}:${getClientIp(req)}`;
}

/**
 * Build a compound rate-limit key scoping a broader per-IP prefix down to a
 * specific login identifier (e.g. email): "rl:<env>:<prefix>:<ip>:<idHash>".
 * The identifier is hashed (not stored raw) so Redis keys never carry a
 * readable email address. Used alongside a plain rateLimitKey() bucket to
 * layer protection: the broad IP bucket catches one attacker spraying many
 * different accounts, while this narrow bucket protects one account without
 * locking out every other real user who happens to share that IP (school
 * networks, households, mobile carrier NAT).
 */
export function compoundRateLimitKey(prefix: string, req: HeadersLike, identifier: string): string {
  const idHash = createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex").slice(0, 16);
  return `rl:${environmentTag()}:${prefix}:${getClientIp(req)}:${idHash}`;
}

/**
 * Check whether a key is currently under the limit.
 * Read-only — does NOT increment the counter.
 * Fails open: if Redis is unavailable, the request is allowed.
 */
export async function checkRateLimit(key: string, cfg: RateLimitConfig): Promise<RateLimitResult> {
  try {
    const count = (await r().get<number>(key)) ?? 0;
    if (count >= cfg.limit) {
      const ttl = await r().ttl(key);
      return { allowed: false, remaining: 0, retryAfter: Math.max(ttl, 0) };
    }
    return { allowed: true, remaining: cfg.limit - count, retryAfter: 0 };
  } catch (err) {
    console.error("[rateLimit] checkRateLimit error — failing open:", err);
    return { allowed: true, remaining: cfg.limit, retryAfter: 0 };
  }
}

/**
 * Record a single failed attempt for a key.
 * Call ONLY on a definitive credential or code failure (401 / bad code).
 * Do NOT call on input validation errors (400) or server errors (500).
 * Fails silently: if Redis is unavailable, the failure is not counted.
 */
export async function recordFailure(key: string, cfg: RateLimitConfig): Promise<void> {
  try {
    const count = await r().incr(key);
    if (count === 1) {
      await r().expire(key, cfg.windowSeconds);
    }
  } catch (err) {
    console.error("[rateLimit] recordFailure error — skipping:", err);
  }
}

/**
 * Increment and check a counter in one call — every request counts, not just
 * failures. For throttling public, unauthenticated write endpoints (e.g. a
 * marketing lead-capture form) rather than gating repeated auth attempts.
 * Fails open: if Redis is unavailable, the request is allowed.
 */
export async function consumeRateLimit(key: string, cfg: RateLimitConfig): Promise<RateLimitResult> {
  try {
    const count = await r().incr(key);
    if (count === 1) {
      await r().expire(key, cfg.windowSeconds);
    }
    if (count > cfg.limit) {
      const ttl = await r().ttl(key);
      return { allowed: false, remaining: 0, retryAfter: Math.max(ttl, 0) };
    }
    return { allowed: true, remaining: cfg.limit - count, retryAfter: 0 };
  } catch (err) {
    console.error("[rateLimit] consumeRateLimit error — failing open:", err);
    return { allowed: true, remaining: cfg.limit, retryAfter: 0 };
  }
}

/**
 * Clear the failed-attempt counter for an already-built key after a
 * successful authentication. Prevents residual failures from locking out a
 * user who has since provided correct credentials.
 * Fails silently: if Redis is unavailable, the stale counter is left to expire naturally.
 */
export async function clearRateLimitKey(key: string): Promise<void> {
  try {
    await r().del(key);
  } catch (err) {
    console.error("[rateLimit] clearRateLimit error — skipping:", err);
  }
}

/**
 * Convenience wrapper over clearRateLimitKey for the common single-IP-key
 * case: clears "rl:<prefix>:<ip>" for the request's trusted IP.
 */
export async function clearRateLimit(req: HeadersLike, prefix: string): Promise<void> {
  await clearRateLimitKey(rateLimitKey(prefix, req));
}
