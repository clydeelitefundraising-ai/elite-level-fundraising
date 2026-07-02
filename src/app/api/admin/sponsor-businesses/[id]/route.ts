import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ipOf } from "@/lib/platform/audit";
import { getSponsor, updateSponsor, SPONSOR_STATUSES } from "@/lib/platform/sponsors";
import type { UpdateSponsorInput } from "@/lib/platform/sponsors";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_STATUSES = new Set<string>(SPONSOR_STATUSES);

const EDITABLE_FIELDS = [
  "business_name", "contact_name", "contact_email", "contact_phone", "website",
  "industry", "city", "state", "address", "preferred_sports", "preferred_sponsorship_level",
  "estimated_annual_budget", "next_renewal_at", "status", "source", "notes",
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
  if (body.business_name !== undefined && !(typeof body.business_name === "string" && body.business_name.trim())) {
    return NextResponse.json({ error: "business_name cannot be empty." }, { status: 400 });
  }

  const patch: UpdateSponsorInput = {};
  for (const field of EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;
    const v = body[field];
    (patch as Record<string, unknown>)[field] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const prior = await getSponsor(id);
  if (!prior) return NextResponse.json({ error: "Sponsor not found." }, { status: 404 });

  let sponsor;
  try {
    sponsor = await updateSponsor(id, patch);
  } catch (err) {
    return NextResponse.json({ error: `Failed to update sponsor: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }

  logAudit({
    action:         "sponsor_business.updated",
    entity_type:    "sponsor_business",
    entity_id:      id,
    summary:        `Updated sponsor "${sponsor.business_name}"`,
    previous_value: prior,
    new_value:      patch,
    ip_address:     ipOf(req),
    user_agent:     req.headers.get("user-agent"),
  });

  return NextResponse.json(sponsor);
}
