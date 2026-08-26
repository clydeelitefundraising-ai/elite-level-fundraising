import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/platform/audit";
import { getContacts, createContact, CRM_STATUSES } from "@/lib/platform/crm";
import type { CrmStatus } from "@/lib/platform/crm";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_STATUSES = new Set<string>(CRM_STATUSES);

export async function GET(_req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getContacts());
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  const status: CrmStatus = typeof body.status === "string" && VALID_STATUSES.has(body.status)
    ? body.status as CrmStatus : "prospect";

  let contact;
  try {
    contact = await createContact({
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
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to create contact: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }

  logAudit({
    actor: ADMIN_TOOL_ACTOR,
    action:      "crm.contact_created",
    entity_type: "coach_crm_contact",
    entity_id:   contact.id,
    summary:     `Added CRM contact "${name}"${contact.school_name ? ` (${contact.school_name})` : ""}`,
    new_value:   contact,
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
