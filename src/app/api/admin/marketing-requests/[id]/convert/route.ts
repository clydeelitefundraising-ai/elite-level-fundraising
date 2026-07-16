import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { getDemoRequest } from "@/lib/platform/marketingDemoRequests";
import { getContactByDemoRequestId, createContact, createActivity } from "@/lib/platform/crm";
import { RestError } from "@/lib/platform/_client";

const DEMO_REQUEST_CONSTRAINT = "coach_crm_contacts_demo_request_id_key";

function isDemoRequestConflict(err: unknown): boolean {
  if (err instanceof RestError) {
    if (err.code === "23505" && err.constraint === DEMO_REQUEST_CONSTRAINT) return true;
    // Structured parse didn't recognize the shape — defensive fallback against
    // the raw body instead of the sanitized `.message`.
    if (err.code === "23505" && !err.constraint) return err.detail.includes(DEMO_REQUEST_CONSTRAINT);
    return false;
  }
  // Helper reduced to a plain Error (older code path, or a future regression) —
  // fall back to substring-matching whatever text is available.
  return err instanceof Error && err.message.includes(DEMO_REQUEST_CONSTRAINT);
}

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const demoRequest = await getDemoRequest(id);
  if (!demoRequest) return NextResponse.json({ error: "Demo request not found." }, { status: 404 });

  // Pre-check for a friendly response. The partial unique index on
  // coach_crm_contacts.demo_request_id is the authoritative guard underneath.
  const existing = await getContactByDemoRequestId(id);
  if (existing) {
    return NextResponse.json({ ok: true, alreadyConverted: true, contactId: existing.id });
  }

  const name = [demoRequest.first_name, demoRequest.last_name].filter(Boolean).join(" ").trim();
  const noteParts = [`Role: ${demoRequest.role}`];
  if (demoRequest.message) noteParts.push(`From demo request: ${demoRequest.message}`);

  let contact;
  try {
    contact = await createContact({
      name:            name || demoRequest.email,
      email:           demoRequest.email,
      school_name:     demoRequest.school_name,
      sport:           demoRequest.sport_program,
      status:          "prospect",
      source:          "marketing_demo_request",
      demo_request_id: demoRequest.id,
      notes:           noteParts.join("\n"),
    });
  } catch (err) {
    if (isDemoRequestConflict(err)) {
      // Race: converted concurrently between the pre-check and this insert.
      const raced = await getContactByDemoRequestId(id);
      if (raced) return NextResponse.json({ ok: true, alreadyConverted: true, contactId: raced.id });
    }
    console.error("[marketing-requests/convert] createContact failed:", err);
    return NextResponse.json({ error: "Failed to convert demo request." }, { status: 500 });
  }

  await createActivity({
    contact_id:    contact.id,
    activity_type: "note",
    title:         "Lead originated from marketing demo request",
    body:          `Converted from a public demo request submitted ${new Date(demoRequest.created_at).toLocaleDateString()}.`,
  }).catch(err => {
    console.error("[marketing-requests/convert] activity log failed:", err);
  });

  logAudit({
    action:       "crm.contact_converted_from_demo_request",
    entity_type:  "coach_crm_contact",
    entity_id:    contact.id,
    summary:      `Converted marketing demo request into CRM contact "${contact.name}"`,
    new_value:    { demo_request_id: demoRequest.id, contact_id: contact.id },
    ip_address:   ipOf(req),
    user_agent:   req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, alreadyConverted: false, contactId: contact.id });
}
