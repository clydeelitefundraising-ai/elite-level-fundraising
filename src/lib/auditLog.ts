export type AuditEventParams = {
  action:          string;
  entity_type?:    string;
  entity_id?:      string;
  campaign_slug?:  string | null;
  summary?:        string;
  previous_value?: Record<string, unknown> | null;
  new_value?:      Record<string, unknown> | null;
  ip_address?:     string | null;
  user_agent?:     string | null;
};

export function logAuditEvent(params: AuditEventParams): void {
  const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!BASE || !key) return;

  fetch(`${BASE}/rest/v1/audit_logs`, {
    method:  "POST",
    headers: {
      apikey:           key,
      Authorization:    `Bearer ${key}`,
      "Content-Type":   "application/json",
      Prefer:           "return=minimal",
    },
    body: JSON.stringify({
      action:           params.action,
      entity_type:      params.entity_type    ?? null,
      entity_id:        params.entity_id      ?? null,
      campaign_slug:    params.campaign_slug   ?? null,
      summary:          params.summary         ?? null,
      previous_value:   params.previous_value  ?? null,
      new_value:        params.new_value        ?? null,
      admin_identifier: "admin",
      ip_address:       params.ip_address      ?? null,
      user_agent:       params.user_agent       ?? null,
    }),
  }).catch(() => {}); // fire-and-forget — audit failures must never block responses
}

export function ipOf(req: { headers: { get(k: string): string | null } }): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}
