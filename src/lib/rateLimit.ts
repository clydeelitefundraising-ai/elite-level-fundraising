/**
 * In-process rate limiter — counts failed attempts per IP per window.
 *
 * Architecture note:
 *   This uses a module-level Map (in-process memory). State resets on cold
 *   start and is not shared across Vercel instances. This is acceptable for
 *   a single-region pilot deployment.
 *
 *   To upgrade to distributed rate limiting (multi-region or high traffic):
 *   replace the store Map with @upstash/ratelimit + @upstash/redis and swap
 *   checkRateLimit / recordFailure for the Upstash equivalents. The call
 *   sites in each route remain identical.
 *
 * Usage pattern (in a route handler):
 *
 *   const LIMIT = { limit: 10, windowSeconds: 900 };
 *   const key   = rateLimitKey("coach-login", req);
 *
 *   // 1. Check before processing
 *   const rl = checkRateLimit(key, LIMIT);
 *   if (!rl.allowed) {
 *     return NextResponse.json(
 *       { error: "Too many attempts.", retryAfter: rl.retryAfter },
 *       { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
 *     );
 *   }
 *
 *   // 2. Only call recordFailure when the credential/code check actually fails.
 *   //    Do NOT call it on input validation errors (400) or server errors (500).
 *   recordFailure(key, LIMIT);
 *   return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
 */

interface Entry {
  count:   number;
  resetAt: number; // unix ms
}

// Shared across all routes in this process. Never exposed to the client.
const store = new Map<string, Entry>();

export interface RateLimitConfig {
  /** Maximum failed attempts before the IP is blocked. */
  limit:         number;
  /** Duration of the sliding window, in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed:    boolean;
  /** Remaining attempts before the window blocks this IP. */
  remaining:  number;
  /** Seconds until the window resets. 0 when allowed. */
  retryAfter: number;
}

/**
 * Extract the client IP address from standard reverse-proxy headers.
 * Vercel sets x-forwarded-for; fallback to x-real-ip then "unknown".
 */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Build a namespaced rate-limit key: "<prefix>:<ip>".
 * Use a distinct prefix per route so limits are independent.
 */
export function rateLimitKey(
  prefix: string,
  req: { headers: { get(name: string): string | null } },
): string {
  return `${prefix}:${getClientIp(req)}`;
}

/**
 * Check whether a key is currently under the limit.
 * Read-only — does NOT increment the counter.
 * Call this at the top of every protected handler.
 */
export function checkRateLimit(key: string, cfg: RateLimitConfig): RateLimitResult {
  const now   = Date.now();
  const entry = store.get(key);

  // No entry yet, or the previous window has expired → clean slate
  if (!entry || entry.resetAt <= now) {
    return { allowed: true, remaining: cfg.limit, retryAfter: 0 };
  }

  if (entry.count >= cfg.limit) {
    return {
      allowed:    false,
      remaining:  0,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: cfg.limit - entry.count, retryAfter: 0 };
}

/**
 * Record a single failed attempt for a key.
 * Call this ONLY when a credential or code check definitively fails (401 / bad code).
 * Do NOT call on input validation errors or server errors.
 */
export function recordFailure(key: string, cfg: RateLimitConfig): void {
  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    // Start a fresh window anchored to this first failure
    store.set(key, { count: 1, resetAt: now + cfg.windowSeconds * 1000 });
  } else {
    entry.count += 1;
  }
}
