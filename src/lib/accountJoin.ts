// Shared "resolve the caller's ELF account, creating one if needed" logic
// for the canonical join flow. Extracted so /api/auth/join and
// /api/auth/join-request (Phase 1B) share one implementation instead of
// duplicating account-creation/session-reuse logic.
import { NextRequest } from "next/server";
import {
  generateAccountSalt, hashAccountPassword, makeAccountCookie,
  parseAccountId, verifyAccountCookie,
} from "@/lib/accountAuth";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export type ResolveAccountResult =
  | { ok: true;  accountId: string; newCookieValue: string | null }
  | { ok: false; status: number; error: string };

// If the caller already has a valid elf_session, reuses that account.
// Otherwise requires email+password and creates a new elf_accounts row.
// Mirrors the exact logic previously inline in /api/auth/join/route.ts.
export async function resolveOrCreateAccount(
  req: NextRequest,
  input: { name: string; email?: string; password?: string },
): Promise<ResolveAccountResult> {
  const existingCookie = req.cookies.get("elf_session")?.value;
  if (existingCookie) {
    const parsedId = parseAccountId(existingCookie);
    if (parsedId) {
      const acctRes = await fetch(
        `${BASE}/rest/v1/elf_accounts?id=eq.${encodeURIComponent(parsedId)}&select=id,salt&limit=1`,
        { headers: h(), cache: "no-store" },
      );
      if (acctRes.ok) {
        const acctRows = await acctRes.json();
        if (Array.isArray(acctRows) && acctRows.length > 0) {
          const a = acctRows[0];
          if (verifyAccountCookie(existingCookie, a.id, a.salt)) {
            return { ok: true, accountId: a.id as string, newCookieValue: null };
          }
        }
      }
    }
  }

  if (!input.email?.trim()) {
    return { ok: false, status: 400, error: "Email is required." };
  }
  if (!input.password || input.password.length < 8) {
    return { ok: false, status: 400, error: "Password must be at least 8 characters." };
  }

  const salt          = generateAccountSalt();
  const password_hash = hashAccountPassword(input.password, salt);

  const acctRes = await fetch(`${BASE}/rest/v1/elf_accounts`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify({
      email:         input.email.trim().toLowerCase(),
      password_hash,
      salt,
      name:          input.name.trim(),
    }),
  });

  if (!acctRes.ok) {
    const msg = await acctRes.text();
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
      return { ok: false, status: 409, error: "An account with that email already exists. Please log in instead." };
    }
    return { ok: false, status: 500, error: "Account creation failed. Please try again." };
  }

  const acctRows = await acctRes.json();
  const acct     = acctRows[0];
  return {
    ok:             true,
    accountId:      acct.id as string,
    newCookieValue: makeAccountCookie(acct.id as string, acct.salt as string),
  };
}
