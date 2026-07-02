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

export async function GET(_req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${BASE}/rest/v1/coach_crm_contacts?select=*&order=created_at.desc&limit=2000`,
    { headers: h(), cache: "no-store" },
  );
  if (!res.ok) return NextResponse.json({ error: "Failed to load contacts." }, { status: 500 });

  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const status = typeof body.status === "string" && VALID_STATUSES.has(body.status) ? body.status : "prospect";

  const payload = {
    name,
    email:                normalizeStr(body.email),
    phone:                normalizeStr(body.phone),
    school_name:          normalizeStr(body.school_name),
    sport:                normalizeStr(body.sport),
    city:                 normalizeStr(body.city),
    state:                normalizeStr(body.state) ?? "AZ",
    status,
    source:               normalizeStr(body.source),
    estimated_value:      typeof body.estimated_value === "number" ? body.estimated_value : null,
    expected_close_date:  normalizeStr(body.expected_close_date),
    next_follow_up_at:    normalizeStr(body.next_follow_up_at),
    notes:                normalizeStr(body.notes),
  };

  const res = await fetch(`${BASE}/rest/v1/coach_crm_contacts`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create contact: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  const contact = rows[0];

  logAuditEvent({
    action:      "crm.contact_created",
    entity_type: "coach_crm_contact",
    entity_id:   contact.id as string,
    summary:     `Added CRM contact "${name}"${payload.school_name ? ` (${payload.school_name})` : ""}`,
    new_value:   payload,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json(contact);
}

function normalizeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}
