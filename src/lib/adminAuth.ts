import { createHash } from "crypto";

export function getAdminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  const pepper = process.env.ADMIN_PEPPER;
  if (!pepper) throw new Error("ADMIN_PEPPER environment variable is required but not set");
  return createHash("sha256").update(pw + pepper).digest("hex");
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = getAdminToken();
  if (!expected) return false;
  return token === expected;
}
