import { createHash, randomBytes } from "crypto";

function getPepper(): string {
  const p = process.env.ELF_ACCOUNT_PEPPER;
  if (!p) throw new Error("ELF_ACCOUNT_PEPPER environment variable is required");
  return p;
}

export function generateAccountSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashAccountPassword(password: string, salt: string): string {
  return createHash("sha256").update(password + salt + getPepper()).digest("hex");
}

export function makeAccountCookie(accountId: string, salt: string): string {
  const token = createHash("sha256").update(accountId + salt + getPepper()).digest("hex");
  return `${accountId}:${token}`;
}

export function verifyAccountCookie(
  cookieValue: string | undefined,
  accountId: string,
  salt: string,
): boolean {
  if (!cookieValue) return false;
  const idx = cookieValue.indexOf(":");
  if (idx < 0) return false;
  if (cookieValue.slice(0, idx) !== accountId) return false;
  const expected = createHash("sha256").update(accountId + salt + getPepper()).digest("hex");
  return cookieValue.slice(idx + 1) === expected;
}

export function parseAccountId(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const idx = cookieValue.indexOf(":");
  if (idx < 0) return null;
  return cookieValue.slice(0, idx) || null;
}
