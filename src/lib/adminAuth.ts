import { createHash } from "crypto";

export function getAdminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return createHash("sha256").update(pw + "elf_admin_2025").digest("hex");
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = getAdminToken();
  if (!expected) return false;
  return token === expected;
}
