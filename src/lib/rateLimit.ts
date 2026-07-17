import { Redis } from "@upstash/redis";

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
 * Extract the client IP from standard reverse-proxy headers.
 * Vercel sets x-forwarded-for; fallback to x-real-ip then "unknown".
 */
export function getClientIp(req: HeadersLike): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Build a namespaced rate-limit key: "rl:<prefix>:<ip>".
 * Use a distinct prefix per route so limits are independent.
 */
export function rateLimitKey(prefix: string, req: HeadersLike): string {
  return `rl:${prefix}:${getClientIp(req)}`;
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
 * Clear the failed-attempt counter for an IP after a successful authentication.
 * Prevents residual failures from locking out a user who has since provided correct credentials.
 * Fails silently: if Redis is unavailable, the stale counter is left to expire naturally.
 */
export async function clearRateLimit(req: HeadersLike, prefix: string): Promise<void> {
  try {
    await r().del(rateLimitKey(prefix, req));
  } catch (err) {
    console.error("[rateLimit] clearRateLimit error — skipping:", err);
  }
}
