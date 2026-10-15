// Custom Team Ordering — account_team_order reads/writes (service role,
// server only). Ordering rules themselves are in teamOrder.ts.
//
// Missing-table safety: until supabase/migrations/phase_t1_account_team_
// order.sql has been run, PostgREST errors on the unknown table. Reads then
// return null (= default order, nothing breaks for any team list) and
// saves report "unavailable" so the Reorder control can show an error
// instead of pretending the order was kept.

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

/** The account's saved slug order, or null when none is saved / unreadable. */
export async function getSavedTeamOrder(accountId: string): Promise<string[] | null> {
  try {
    const res = await fetch(
      `${BASE}/rest/v1/account_team_order?account_id=eq.${encodeURIComponent(accountId)}&select=team_slugs&limit=1`,
      { headers: h(), cache: "no-store" },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const slugs = Array.isArray(rows) ? rows[0]?.team_slugs : null;
    return Array.isArray(slugs) ? slugs.filter((s: unknown): s is string => typeof s === "string") : null;
  } catch {
    return null;
  }
}

export type SaveTeamOrderResult = { ok: true } | { ok: false; reason: "unavailable" | "error" };

/** Replaces the account's saved order (one row per account, upsert). */
export async function saveTeamOrder(accountId: string, slugs: string[]): Promise<SaveTeamOrderResult> {
  try {
    const res = await fetch(
      `${BASE}/rest/v1/account_team_order?on_conflict=account_id`,
      {
        method:  "POST",
        headers: h({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body:    JSON.stringify({ account_id: accountId, team_slugs: slugs, updated_at: new Date().toISOString() }),
      },
    );
    if (res.ok) return { ok: true };
    // 404 = PostgREST doesn't know the table yet (migration not run).
    if (res.status === 404) return { ok: false, reason: "unavailable" };
    console.error("[accountTeamOrder] save failed:", res.status, await res.text().catch(() => ""));
    return { ok: false, reason: "error" };
  } catch (err) {
    console.error("[accountTeamOrder] save failed:", err);
    return { ok: false, reason: "error" };
  }
}
