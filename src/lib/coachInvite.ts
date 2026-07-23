import { createHash, randomBytes } from "crypto";

// Generic hashed single-use token helpers — despite the filename, these are
// reused as-is (not duplicated) for account password resets
// (src/app/api/auth/request-reset/route.ts, src/app/api/auth/reset-password/route.ts)
// as well as the coach invite flow they were originally written for.

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenExpiresAt(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

export function inviteExpiresAt(): string {
  return tokenExpiresAt(24);
}
