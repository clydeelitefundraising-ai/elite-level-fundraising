import { createHash, randomBytes } from "crypto";

const PEPPER = process.env.TEAM_MEMBER_PEPPER ?? "elf_member_2025";

export function generateMemberSalt(): string {
  return randomBytes(16).toString("hex");
}

// Cookie value: "<memberId>:<token>" where token = SHA256(memberId + salt + PEPPER)
export function makeMemberCookie(memberId: string, salt: string): string {
  const token = createHash("sha256").update(memberId + salt + PEPPER).digest("hex");
  return `${memberId}:${token}`;
}

export function verifyMemberCookie(
  cookieValue: string | undefined,
  memberId: string,
  salt: string,
): boolean {
  if (!cookieValue) return false;
  const idx = cookieValue.indexOf(":");
  if (idx < 0) return false;
  const parsedId = cookieValue.slice(0, idx);
  const parsedToken = cookieValue.slice(idx + 1);
  if (parsedId !== memberId) return false;
  const expected = createHash("sha256").update(memberId + salt + PEPPER).digest("hex");
  return parsedToken === expected;
}

export function parseMemberId(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const idx = cookieValue.indexOf(":");
  if (idx < 0) return null;
  const id = cookieValue.slice(0, idx);
  return id || null;
}
