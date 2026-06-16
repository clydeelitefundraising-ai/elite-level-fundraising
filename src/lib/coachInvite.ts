import { createHash, randomBytes } from "crypto";

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteExpiresAt(): string {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d.toISOString();
}
