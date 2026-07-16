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

// Structured error for REST write failures. `.code`/`.constraint` are parsed
// from PostgREST's JSON error body when available, for callers that need to
// distinguish e.g. a specific unique-constraint violation from a generic
// failure — without exposing the raw DB error text (which may include query
// details) as `.message`, since `.message` is what routes tend to surface.
export class RestError extends Error {
  code?:       string;
  constraint?: string;
  // Raw PostgREST error body — for callers that need a defensive substring
  // fallback if code/constraint parsing didn't recognize the shape. Logged
  // server-side only; never return `.detail` in an HTTP response body.
  detail:      string;
  constructor(message: string, detail: string, opts?: { code?: string; constraint?: string }) {
    super(message);
    this.name = "RestError";
    this.code = opts?.code;
    this.constraint = opts?.constraint;
    this.detail = detail;
  }
}

async function toRestError(res: Response): Promise<RestError> {
  const raw = await res.text();
  let code: string | undefined;
  let constraint: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { code?: string; message?: string };
    code = parsed.code;
    constraint = parsed.message?.match(/constraint "([^"]+)"/)?.[1];
  } catch {
    // Non-JSON error body — code/constraint stay undefined; callers can
    // still substring-match `.detail` as a defensive fallback.
  }
  console.error("[platform/_client] REST write failed:", res.status, raw);
  const message = code === "23505" ? "A record with this value already exists." : "Request failed.";
  return new RestError(message, raw, { code, constraint });
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
  if (!res.ok) throw await toRestError(res);
  return res.json();
}

export async function restUpdate<T>(path: string, body: unknown): Promise<T[]> {
  const res = await fetch(restUrl(path), {
    method:  "PATCH",
    headers: restHeaders({ Prefer: "return=representation" }),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw await toRestError(res);
  return res.json();
}
