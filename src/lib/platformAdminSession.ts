// Server-only. Imports next/headers transitively via getAccountSession.
// Never import this file from a "use client" component.
import { cache } from "react";
import { getAccountSession, type AccountSession } from "@/lib/accountSession";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

export type PlatformAdminIdentity = {
  platformAdminId: string;
  accountId:        string;
  name:             string;
  email:            string;
  role:             string; // 'platform_admin' in V1; future tiers add values, not columns
};

/** Resolves whether the current elf_session account is a platform admin.
 *
 *  Account-level, NOT campaign-scoped — a platform admin is a platform
 *  admin everywhere, independent of any team. Membership is looked up
 *  fresh from the `platform_admins` table every call (fail-closed: no
 *  cookie or session payload ever claims this role, only a live DB row
 *  keyed by account_id can). Memoized per-request via React.cache, same
 *  pattern as getAccountSession, so multiple call sites in one request
 *  (e.g. a layout and a page) cost only one extra round-trip.
 *
 *  Returns null for every non-platform-admin account, including normal
 *  coaches/parents/athletes/boosters — this table is the sole source of
 *  truth for platform-admin status. */
export const getPlatformAdminSession = cache(async (): Promise<PlatformAdminIdentity | null> => {
  const account = await getAccountSession();
  if (!account) return null;
  return lookupPlatformAdmin(account);
});

async function lookupPlatformAdmin(account: AccountSession): Promise<PlatformAdminIdentity | null> {
  const res = await fetch(
    `${BASE}/rest/v1/platform_admins?account_id=eq.${encodeURIComponent(account.id)}&select=id,role&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;

  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows[0];
  return {
    platformAdminId: row.id,
    accountId:        account.id,
    name:             account.name,
    email:            account.email,
    role:             row.role,
  };
}
