// Phase 10: native push device registry + account-level preferences.
//
// push_devices is deliberately separate from the existing push_subscriptions
// table (web-push/VAPID, campaign-scoped) — see the migration file's header
// comment for the full reasoning. Keyed on elf_accounts.id, not
// team_coaches.id/team_members.id, since account_id on those per-team rows
// is not reliably populated (confirmed during the Phase 7 staff-aggregation
// audit) and a physical device belongs to the person across every
// team/role, not one team membership.
//
// UNIQUE (platform, device_token) is GLOBAL device-token ownership. Every
// registration is the exact same atomic upsert
// (on_conflict=platform,device_token, resolution=merge-duplicates)
// regardless of whether the token is new, already owned by the caller, or
// last owned by a different account — PostgREST's upsert overwrites
// account_id/active/last_seen_at unconditionally on conflict, so "refresh"
// and "transfer ownership" are the same code path. This is what guarantees
// a single physical device can never remain associated with two accounts
// at once.

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export type DevicePlatform = "ios" | "android";

export type PushDeviceRow = {
  id: string;
  account_id: string;
  platform: DevicePlatform;
  device_token: string;
  active: boolean;
  created_at: string;
  last_seen_at: string;
};

/** Registers (or refreshes, or transfers ownership of) a device token —
 *  see module header for why one upsert covers all three cases. */
export async function registerPushDevice(
  accountId: string,
  platform: DevicePlatform,
  deviceToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `${BASE}/rest/v1/push_devices?on_conflict=platform,device_token`,
    {
      method: "POST",
      headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        account_id: accountId,
        platform,
        device_token: deviceToken,
        active: true,
        last_seen_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    return { ok: false, error: `DB write failed: ${msg}` };
  }
  return { ok: true };
}

/** Deactivates ONLY the device row matching platform+device_token AND
 *  account_id === the server-derived authenticated account. The
 *  account_id clause is the actual authorization — a caller can never
 *  deactivate a device it doesn't own, even if it somehow supplied
 *  another account's token (that combination simply matches zero rows).
 *  Deliberately narrow to one row: logging out on one device must never
 *  deactivate every device belonging to the account. */
export async function deactivatePushDevice(
  accountId: string,
  platform: DevicePlatform,
  deviceToken: string,
): Promise<void> {
  await fetch(
    `${BASE}/rest/v1/push_devices` +
      `?platform=eq.${encodeURIComponent(platform)}` +
      `&device_token=eq.${encodeURIComponent(deviceToken)}` +
      `&account_id=eq.${encodeURIComponent(accountId)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({ active: false }),
    },
  );
}

/** Soft-deactivates a device by id — used by the APNs dispatch layer when
 *  Apple reports the token as invalid/unregistered. Mirrors
 *  push.ts's removeStale() exactly, except this deactivates rather than
 *  deletes (keeps history/last_seen_at, consistent with the "deactivate"
 *  language used throughout this feature's design). */
export async function deactivateDeviceById(id: string): Promise<void> {
  await fetch(`${BASE}/rest/v1/push_devices?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: h({ Prefer: "return=minimal" }),
    body: JSON.stringify({ active: false }),
  });
}

/** All active devices for a set of accounts — the dispatch-time read.
 *  Empty input short-circuits to no query. */
export async function getActiveDevicesForAccounts(accountIds: string[]): Promise<PushDeviceRow[]> {
  const ids = [...new Set(accountIds)].filter(Boolean);
  if (!ids.length) return [];
  const res = await fetch(
    `${BASE}/rest/v1/push_devices?account_id=in.(${ids.join(",")})&active=eq.true&select=*`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

// ── Preferences ────────────────────────────────────────────────────────────

export type PushCategory = "team_updates" | "messages" | "calendar" | "requests";

export type PushPreferences = {
  team_updates: boolean;
  messages: boolean;
  calendar: boolean;
  requests: boolean;
};

const DEFAULT_PREFERENCES: PushPreferences = {
  team_updates: true,
  messages: true,
  calendar: true,
  requests: true,
};

/** Defaults to all-true when no row exists yet — matches the approved "ON
 *  by default" product decision without requiring a row to be pre-created
 *  for every account. */
export async function getPushPreferences(accountId: string): Promise<PushPreferences> {
  const res = await fetch(
    `${BASE}/rest/v1/push_preferences?account_id=eq.${encodeURIComponent(accountId)}&select=team_updates,messages,calendar,requests&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return DEFAULT_PREFERENCES;
  const rows: PushPreferences[] = await res.json();
  return rows[0] ?? DEFAULT_PREFERENCES;
}

export async function updatePushPreferences(
  accountId: string,
  patch: Partial<PushPreferences>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `${BASE}/rest/v1/push_preferences?on_conflict=account_id`,
    {
      method: "POST",
      headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        account_id: accountId,
        ...DEFAULT_PREFERENCES,
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    return { ok: false, error: `DB write failed: ${msg}` };
  }
  return { ok: true };
}

/** Pure — whether a device's account has opted out of a given category.
 *  Missing preferences (undefined) default to allowed (true), matching
 *  the "default ON" rule at the individual-key level too. */
export function isCategoryEnabled(prefs: PushPreferences | null | undefined, category: PushCategory): boolean {
  if (!prefs) return true;
  return prefs[category] !== false;
}
