// Internal Supabase REST client shared by Platform Services.
//
// Not meant to be imported outside src/lib/platform — pages, API routes, and
// the automation rule definitions should go through the service modules
// (health.ts, crm.ts, campaigns.ts, ...) rather than this file directly.

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function restHeaders(extra?: Record<string, string>) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra };
}

export function restUrl(path: string) {
  return `${BASE}/rest/v1/${path}`;
}

// GET that never throws — returns [] on any failure (missing table, network error, bad response).
export async function restList<T>(path: string): Promise<T[]> {
  try {
    const res = await fetch(restUrl(path), { headers: restHeaders(), cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

export async function restInsert<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T[]> {
  const res = await fetch(restUrl(path), {
    method:  "POST",
    headers: restHeaders({ Prefer: "return=representation", ...extraHeaders }),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function restUpdate<T>(path: string, body: unknown): Promise<T[]> {
  const res = await fetch(restUrl(path), {
    method:  "PATCH",
    headers: restHeaders({ Prefer: "return=representation" }),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
