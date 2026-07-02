import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { getContact, updateContact, CRM_STATUSES } from "@/lib/platform/crm";
import type { UpdateContactInput } from "@/lib/platform/crm";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_STATUSES = new Set<string>(CRM_STATUSES);

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

  const patch: UpdateContactInput = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    const v = body[field];
    (patch as Record<string, unknown>)[field] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const prior = await getContact(id);
  if (!prior) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  let contact;
  try {
    contact = await updateContact(id, patch);
  } catch (err) {
    return NextResponse.json({ error: `Failed to update contact: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }

  logAudit({
    action:        "crm.contact_updated",
    entity_type:   "coach_crm_contact",
    entity_id:     id,
    summary:       `Updated CRM contact "${contact.name}"`,
    previous_value: prior,
    new_value:      patch,
    ip_address:     ipOf(req),
    user_agent:     req.headers.get("user-agent"),
  });

  return NextResponse.json(contact);
}
