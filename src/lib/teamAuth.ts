import { createHash, randomBytes } from "crypto";

const PEPPER = process.env.TEAM_COACH_PEPPER ?? "elf_team_2025";

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return createHash("sha256").update(password + salt + PEPPER).digest("hex");
}

// Cookie value: "<coachId>:<token>" where token = SHA256(coachId + salt + PEPPER)
export function makeCoachCookie(coachId: string, salt: string): string {
  const token = createHash("sha256").update(coachId + salt + PEPPER).digest("hex");
  return `${coachId}:${token}`;
}

export function verifyCoachCookie(
  cookieValue: string | undefined,
  coachId: string,
  salt: string,
): boolean {
  if (!cookieValue) return false;
  const idx = cookieValue.indexOf(":");
  if (idx < 0) return false;
  const parsedId = cookieValue.slice(0, idx);
  const parsedToken = cookieValue.slice(idx + 1);
  if (parsedId !== coachId) return false;
  const expected = createHash("sha256").update(coachId + salt + PEPPER).digest("hex");
  return parsedToken === expected;
}

// Extracts coachId from cookie without a DB lookup — used to initiate the DB query
export function parseCoachId(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const idx = cookieValue.indexOf(":");
  if (idx < 0) return null;
  const id = cookieValue.slice(0, idx);
  return id || null;
}
