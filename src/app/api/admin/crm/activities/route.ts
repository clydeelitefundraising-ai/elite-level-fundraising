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

const VALID_TYPES = new Set([
  "note", "call", "email", "text", "demo", "proposal", "follow_up", "status_change",
]);

// Activity types that count as meaningful contact with the coach.
const CONTACT_TYPES = new Set(["call", "email", "text", "demo", "proposal", "note", "follow_up"]);

export async function GET(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contactId = req.nextUrl.searchParams.get("contact_id");

  let url = `${BASE}/rest/v1/coach_crm_activities?select=*&order=activity_at.desc&limit=500`;
  if (contactId) url += `&contact_id=eq.${encodeURIComponent(contactId)}`;

  const res = await fetch(url, { headers: h(), cache: "no-store" });
  if (!res.ok) return NextResponse.json({ error: "Failed to load activities." }, { status: 500 });

  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const contact_id = typeof body.contact_id === "string" ? body.contact_id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const activity_type = typeof body.activity_type === "string" && VALID_TYPES.has(body.activity_type)
    ? body.activity_type : "note";

  if (!contact_id || !title) {
    return NextResponse.json({ error: "contact_id and title are required." }, { status: 400 });
  }

  const res = await fetch(`${BASE}/rest/v1/coach_crm_activities`, {
    method:  "POST",
    headers: h({ Prefer: "return=representation" }),
    body: JSON.stringify({
      contact_id,
      activity_type,
      title,
      body: typeof body.body === "string" && body.body.trim() !== "" ? body.body.trim() : null,
    }),
  });

  if (!res.ok) {
    const msg = await res.text();
    return NextResponse.json({ error: `Failed to create activity: ${msg}` }, { status: 500 });
  }

  const rows = await res.json();
  const activity = rows[0];

  if (CONTACT_TYPES.has(activity_type)) {
    await fetch(`${BASE}/rest/v1/coach_crm_contacts?id=eq.${encodeURIComponent(contact_id)}`, {
      method:  "PATCH",
      headers: h({ Prefer: "return=minimal" }),
      body:    JSON.stringify({ last_contacted_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  logAuditEvent({
    action:      "crm.activity_added",
    entity_type: "coach_crm_activity",
    entity_id:   activity.id as string,
    summary:     `Added ${activity_type} activity: "${title}"`,
    new_value:   { contact_id, activity_type, title },
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json(activity);
}
