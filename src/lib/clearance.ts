// Phase 7: Clearance resource library (team resource/compliance links +
// attachments). Pure validation/normalization logic is exported separately
// from the REST read/write functions so it can be unit tested without a
// live database (see clearance.test.ts), matching the followUps.ts /
// donationAttribution.ts convention of separating pure logic from I/O.
//
// Attachment lifecycle: attachment_id references team_files(id) ON DELETE
// RESTRICT (see supabase/migrations/phase_7_team_hub.sql for the full
// rationale). Deleting a Clearance resource here therefore only ever
// removes the clearance_resources row — the underlying team_files row is
// never touched, because team_files is a shared table (already referenced
// separately by announcements.attachment_id) and no ownership model exists
// to safely auto-delete it. An orphaned file left behind by a deleted
// Clearance resource is visible/manageable like any other file in the
// existing Updates/Files view.
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export type ClearanceAttachment = {
  id: string;
  name: string;
  file_type: "pdf" | "image" | "doc";
  size_bytes: number;
};

export type ClearanceResourceRow = {
  id: string;
  campaign_slug: string;
  title: string;
  description: string | null;
  url: string | null;
  attachment_id: string | null;
  sort_order: number;
  created_by_account_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ClearanceResourceWithAttachment = ClearanceResourceRow & {
  attachment: ClearanceAttachment | null;
};

// ── Pure validation (unit-testable, no I/O) ────────────────────────────────

const ALLOWED_URL_SCHEMES = new Set(["http:", "https:"]);

/** Normalizes a raw URL input: trims, returns null for empty. Throws a
 *  ClearanceValidationError for anything that parses but isn't http(s), or
 *  that doesn't parse as a URL at all. Never silently accepts an unsafe
 *  scheme (javascript:, data:, file:, webcal:, etc.). */
export function normalizeClearanceUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ClearanceValidationError("Link must be a valid web address (starting with http:// or https://).");
  }
  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    throw new ClearanceValidationError("Link must start with http:// or https://.");
  }
  return parsed.toString();
}

export class ClearanceValidationError extends Error {}

export type ClearanceInput = {
  title: string;
  description?: string | null;
  url?: string | null;
  attachment_id?: string | null;
};

export type ValidatedClearanceInput = {
  title: string;
  description: string | null;
  url: string | null;
  attachment_id: string | null;
};

/** Title required; at least one of url/attachment_id required. Mirrors the
 *  DB CHECK constraint (clearance_resources_has_destination) as
 *  defense-in-depth — the DB remains authoritative. */
export function validateClearanceInput(input: ClearanceInput): ValidatedClearanceInput {
  const title = (input.title ?? "").trim();
  if (!title) throw new ClearanceValidationError("Title is required.");

  const url = normalizeClearanceUrl(input.url);
  const attachmentId = input.attachment_id?.trim() || null;

  if (!url && !attachmentId) {
    throw new ClearanceValidationError("Provide a link, an attachment, or both.");
  }

  const description = (input.description ?? "").trim() || null;

  return { title, description, url, attachment_id: attachmentId };
}

/** sort_order ASC, created_at ASC tie-break. Pure — safe to unit test and
 *  to reuse for both the DB query's ORDER BY (documentation) and any
 *  client-side re-sort after an optimistic update. */
export function sortClearanceResources<T extends { sort_order: number; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

// ── REST reads/writes ───────────────────────────────────────────────────────

export async function getClearanceResources(slug: string): Promise<ClearanceResourceWithAttachment[]> {
  const res = await fetch(
    `${BASE}/rest/v1/clearance_resources?campaign_slug=eq.${encodeURIComponent(slug)}` +
      `&select=*,attachment:team_files!attachment_id(id,name,file_type,size_bytes)` +
      `&order=sort_order.asc,created_at.asc`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return [];
  return res.json();
}

async function getOwnedResource(id: string, slug: string): Promise<ClearanceResourceRow | null> {
  const res = await fetch(
    `${BASE}/rest/v1/clearance_resources?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

export type ClearanceMutationResult =
  | { ok: true; resource: ClearanceResourceRow }
  | { ok: false; error: string; status: number };

export async function createClearanceResource(
  slug: string,
  input: ClearanceInput,
  createdByAccountId: string | null,
): Promise<ClearanceMutationResult> {
  let validated: ValidatedClearanceInput;
  try {
    validated = validateClearanceInput(input);
  } catch (err) {
    if (err instanceof ClearanceValidationError) return { ok: false, error: err.message, status: 400 };
    throw err;
  }

  // New resources go to the end of the list.
  const countRes = await fetch(
    `${BASE}/rest/v1/clearance_resources?campaign_slug=eq.${encodeURIComponent(slug)}&select=sort_order&order=sort_order.desc&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const countRows = countRes.ok ? await countRes.json() : [];
  const nextSortOrder = Array.isArray(countRows) && countRows.length > 0 ? countRows[0].sort_order + 1 : 0;

  const res = await fetch(`${BASE}/rest/v1/clearance_resources`, {
    method: "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      campaign_slug: slug,
      title: validated.title,
      description: validated.description,
      url: validated.url,
      attachment_id: validated.attachment_id,
      sort_order: nextSortOrder,
      created_by_account_id: createdByAccountId,
    }),
  });
  if (!res.ok) {
    const msg = await res.text();
    return { ok: false, error: `Failed to create resource: ${msg}`, status: 500 };
  }
  const rows = await res.json();
  return { ok: true, resource: rows[0] };
}

export async function updateClearanceResource(
  id: string,
  slug: string,
  input: ClearanceInput,
): Promise<ClearanceMutationResult> {
  const existing = await getOwnedResource(id, slug);
  if (!existing) return { ok: false, error: "Resource not found.", status: 404 };

  let validated: ValidatedClearanceInput;
  try {
    validated = validateClearanceInput(input);
  } catch (err) {
    if (err instanceof ClearanceValidationError) return { ok: false, error: err.message, status: 400 };
    throw err;
  }

  const res = await fetch(
    `${BASE}/rest/v1/clearance_resources?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({
        title: validated.title,
        description: validated.description,
        url: validated.url,
        attachment_id: validated.attachment_id,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text();
    return { ok: false, error: `Failed to update resource: ${msg}`, status: 500 };
  }
  const rows = await res.json();
  return { ok: true, resource: rows[0] };
}

export type ClearanceDeleteResult = { ok: true } | { ok: false; error: string; status: number };

/** Deletes only the clearance_resources row. Never touches team_files —
 *  see module header. */
export async function deleteClearanceResource(id: string, slug: string): Promise<ClearanceDeleteResult> {
  const existing = await getOwnedResource(id, slug);
  if (!existing) return { ok: false, error: "Resource not found.", status: 404 };

  const res = await fetch(
    `${BASE}/rest/v1/clearance_resources?id=eq.${encodeURIComponent(id)}&campaign_slug=eq.${encodeURIComponent(slug)}`,
    { method: "DELETE", headers: h({ Prefer: "return=minimal" }) },
  );
  if (!res.ok) return { ok: false, error: "Failed to delete resource.", status: 500 };
  return { ok: true };
}

/** Simple move-up/move-down — swaps sort_order with the adjacent resource
 *  in display order. No drag-and-drop, per Phase 7 scope. */
export async function reorderClearanceResource(
  id: string,
  slug: string,
  direction: "up" | "down",
): Promise<ClearanceMutationResult> {
  const all = sortClearanceResources(await getClearanceResources(slug));
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return { ok: false, error: "Resource not found.", status: 404 };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= all.length) {
    // Already at the boundary — no-op success, not an error.
    return { ok: true, resource: all[idx] };
  }

  const current = all[idx];
  const swap = all[swapIdx];

  const [resA, resB] = await Promise.all([
    fetch(`${BASE}/rest/v1/clearance_resources?id=eq.${encodeURIComponent(current.id)}&campaign_slug=eq.${encodeURIComponent(slug)}`, {
      method: "PATCH", headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ sort_order: swap.sort_order, updated_at: new Date().toISOString() }),
    }),
    fetch(`${BASE}/rest/v1/clearance_resources?id=eq.${encodeURIComponent(swap.id)}&campaign_slug=eq.${encodeURIComponent(slug)}`, {
      method: "PATCH", headers: h({ Prefer: "return=representation" }),
      body: JSON.stringify({ sort_order: current.sort_order, updated_at: new Date().toISOString() }),
    }),
  ]);

  if (!resA.ok || !resB.ok) return { ok: false, error: "Failed to reorder resource.", status: 500 };
  const rowsA = await resA.json();
  return { ok: true, resource: rowsA[0] };
}
