import { createHash, randomBytes } from "crypto";

// Mirrors coachInvite.ts's token pattern exactly, with a shorter expiry:
// this protects an already-existing credential rather than onboarding a
// new one, so a stale link should go stale faster.
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetTokenExpiresAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

// Never store or log a raw email address as a rate-limit key — hash the
// normalized form so Redis only ever holds an opaque identifier.
export function hashNormalizedEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
