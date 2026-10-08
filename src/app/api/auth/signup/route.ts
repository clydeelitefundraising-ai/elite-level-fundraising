import { NextRequest, NextResponse } from "next/server";
import { consumeRateLimit, rateLimitKey } from "@/lib/rateLimit";
import { resolveOrCreateAccount } from "@/lib/accountJoin";

// Phase O3B — public, unauthenticated account creation only. Sole
// responsibility: validate + create an elf_accounts row and issue an
// elf_session cookie via the same resolveOrCreateAccount() logic
// /api/auth/join already uses (minus its join-code requirement). Never
// creates campaign_settings/team_coaches/team_members/a team — O2's own
// authenticated POST /api/team-onboarding/create remains solely
// responsible for provisioning, reached only afterward via /team-onboarding.
const LIMIT = { limit: 10, windowSeconds: 60 * 60 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cookieOpts = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path:     "/",
  maxAge:   60 * 60 * 24 * 30,
};

// Same-origin enforcement for this one public, account-creating endpoint.
// Deliberately NOT a general CSRF framework — no token, no change to any
// other route. Sources of truth are all platform/build-time configuration,
// never the incoming request's own Host/X-Forwarded-* headers (those are
// attacker-controlled and would make this check circular):
//   - NEXT_PUBLIC_APP_URL: the existing configured production app origin,
//     already used this way throughout the codebase (see campaignCreate.ts,
//     layout.tsx, etc.).
//   - VERCEL_URL / VERCEL_BRANCH_URL: Vercel's own system env vars, set by
//     the platform to the current deployment's real hostname — not derived
//     from anything the client sends, so trusting them here is safe and is
//     what makes feature-branch Vercel previews (this engagement's own QA
//     path) work without weakening the check.
//   - localhost, but ONLY outside production (NODE_ENV !== "production"),
//     for local dev.
// Policy for a MISSING Origin header: rejected, same as a mismatched one.
// A same-origin fetch() POST from a real browser always sends Origin; the
// only callers that omit it are non-browser clients this public endpoint
// has no reason to accept, so "missing" is never treated as "trusted."
function getTrustedOrigins(): string[] {
  const origins = new Set<string>();
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.add(process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, ""));
  }
  if (process.env.VERCEL_URL) origins.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  if (process.env.NODE_ENV !== "production") origins.add("http://localhost:3000");
  return [...origins];
}

function isTrustedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return getTrustedOrigins().includes(origin);
}

export async function POST(req: NextRequest) {
  if (!isTrustedOrigin(req.headers.get("origin"))) {
    return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  }

  const key = rateLimitKey("account-signup", req);
  const rl  = await consumeRateLimit(key, LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts. Please try again later.", retryAfter: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { name, email, password } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!email?.trim() || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Also covers the already-authenticated case: a caller with a valid
  // elf_session reuses that account (newCookieValue: null) instead of
  // creating a duplicate one.
  const result = await resolveOrCreateAccount(req, { name, email, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const response = NextResponse.json({ ok: true });
  if (result.newCookieValue) {
    response.cookies.set("elf_session", result.newCookieValue, cookieOpts);
  }
  return response;
}
