import { isIP } from "node:net";

// Trust boundary (verified, not assumed):
//
// 1. Vercel's official docs (vercel.com/docs/headers/request-headers) state
//    that on a non-Enterprise plan (no purchased "Trusted Proxy" add-on —
//    confirmed this project has none), Vercel's edge OVERWRITES
//    x-forwarded-for and x-real-ip with the true connecting client IP and
//    "do[es] not forward external IPs" — i.e. a client-supplied value for
//    either header is discarded before the request reaches this app.
//    x-vercel-forwarded-for is documented as carrying the same value but
//    remains reliable even if an upstream proxy/CDN is later placed in
//    front of Vercel (plain x-forwarded-for "could be overwritten if
//    you're using a proxy on top of Vercel").
// 2. Empirically confirmed against a live ELF Preview deployment
//    (elf-team-fzuviptwd-…, same commit as production 201a255): sent
//    forged x-forwarded-for (single value, multi-hop chain, and IPv6),
//    x-real-ip, and x-vercel-forwarded-for values from the client on a
//    real audited request. Every attempt was attributed to the same real
//    sending IP regardless of what was claimed — none of the three
//    candidate headers were client-controllable on this deployment.
//
// This app has no CDN/WAF in front of Vercel today (DNS for
// app.elitelevelfundraising.com resolves directly to Vercel's edge), so
// cf-connecting-ip and similar third-party proxy headers are deliberately
// NOT consulted here. Add cf-connecting-ip (ahead of the Vercel headers)
// only if a CDN is introduced in front of Vercel in the future — at that
// point Vercel's own headers would reflect the CDN's edge IP, not the
// real client, and this comment block should be revisited.
//
// x-vercel-forwarded-for is checked first anyway (belt-and-suspenders):
// it is the variant Vercel documents as most robust against a future
// upstream proxy, even though today it is empirically identical to
// x-forwarded-for on this deployment.

type HeadersLike = { headers: { get(name: string): string | null } };

/** Split a (possibly absent) forwarded-header value and return the
 *  right-most syntactically valid IPv4/IPv6 address, or null.
 *  Right-most, not left-most: standard proxy chains APPEND each hop's
 *  perceived source, so the entry nearest the trusted edge — not the
 *  original, potentially attacker-supplied entry — is the one to trust
 *  if a header ever legitimately contains more than one value. */
function rightmostValidIp(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const parts = headerValue.split(",").map(p => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isIP(parts[i])) return parts[i];
  }
  return null;
}

/**
 * Resolve the trusted client IP for this deployment. See the trust-boundary
 * comment above for why this priority order and these three headers (and
 * only these three) are safe to consult.
 */
export function getTrustedClientIp(req: HeadersLike): string {
  return (
    rightmostValidIp(req.headers.get("x-vercel-forwarded-for")) ??
    rightmostValidIp(req.headers.get("x-forwarded-for")) ??
    rightmostValidIp(req.headers.get("x-real-ip")) ??
    "unknown"
  );
}
