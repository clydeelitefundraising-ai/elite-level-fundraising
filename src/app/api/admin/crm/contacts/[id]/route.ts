import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAuditEvent, ipOf } from "@/lib/auditLog";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function h(extra?: Record<string, string>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_STATUSES = new Set([
  "prospect", "contacted", "demo_scheduled", "proposal_sent", "signed", "active", "returning", "lost",
]);

const EDITABLE_FIELDS = [
  "name", "email", "phone", "school_name", "sport", "city", "state", "status",
  "source", "estimated_value", "expected_close_date", "last_contacted_at",
  "next_follow_up_at", "notes",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  if (body.status !== undefined && !VALID_STATUSES.has(body.status as string)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }
  if (body.name !== undefined && !(typeof body.name === "string" && body.name.trim())) {
    return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    const v = body[field];
    patch[field] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  // Fetch previous state, needed for status-change activity + audit log
  const priorRes = await fetch(
    `${BASE}/rest/v1/coach_crm_contacts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { headers: h(), cache: "no-store" },
  );
  const priorRows = priorRes.ok ? await priorRes.json() : [];
  const prior = Array.isArray(priorRows) ? priorRows[0] : undefined;
  if (!prior) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const res = await fetch(`${BASE}/rest/v1/coach_crm_contacts?id=eq.${encodeURIComponent(id)}`, {
    method:  "PATCH",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify(patch),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to update contact: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  const contact = rows[0];

  if (typeof patch.status === "string" && patch.status !== prior.status) {
    await fetch(`${BASE}/rest/v1/coach_crm_activities`, {
      method:  "POST",
      headers: h({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        contact_id:    id,
        activity_type: "status_change",
        title:         `Status changed: ${prior.status} → ${patch.status}`,
        body:          null,
      }),
    }).catch(() => {});
  }

  logAuditEvent({
    action:        "crm.contact_updated",
    entity_type:   "coach_crm_contact",
    entity_id:     id,
    summary:       `Updated CRM contact "${contact.name as string}"`,
    previous_value: prior,
    new_value:      patch,
    ip_address:     ipOf(req),
    user_agent:     req.headers.get("user-agent"),
  });

  return NextResponse.json(contact);
}
