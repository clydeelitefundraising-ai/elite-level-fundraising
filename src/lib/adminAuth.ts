import { createHash } from "crypto";

export function getAdminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  const pepper = process.env.ADMIN_PEPPER ?? "elf_admin_2025";
  return createHash("sha256").update(pw + pepper).digest("hex");
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = getAdminToken();
  if (!expected) return false;
  return token === expected;
}
