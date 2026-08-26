import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/adminAuth";
import { logAudit, ADMIN_TOOL_ACTOR, ipOf } from "@/lib/platform/audit";
import { getSponsors, createSponsor, SPONSOR_STATUSES } from "@/lib/platform/sponsors";
import type { SponsorStatus } from "@/lib/platform/sponsors";

async function authed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get("elf_admin")?.value);
}

const VALID_STATUSES = new Set<string>(SPONSOR_STATUSES);

export async function GET(_req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getSponsors());
}

export async function POST(req: NextRequest) {
  if (!await authed()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;
  const business_name = typeof body.business_name === "string" ? body.business_name.trim() : "";
  if (!business_name) {
    return NextResponse.json({ error: "business_name is required." }, { status: 400 });
  }

  const status: SponsorStatus = typeof body.status === "string" && VALID_STATUSES.has(body.status)
    ? body.status as SponsorStatus : "prospect";

  const preferred_sports = Array.isArray(body.preferred_sports)
    ? body.preferred_sports.filter((s): s is string => typeof s === "string")
    : [];

  let sponsor;
  try {
    sponsor = await createSponsor({
      business_name,
      contact_name:                normalizeStr(body.contact_name),
      contact_email:               normalizeStr(body.contact_email),
      contact_phone:               normalizeStr(body.contact_phone),
      website:                     normalizeStr(body.website),
      industry:                    normalizeStr(body.industry),
      city:                        normalizeStr(body.city),
      state:                       normalizeStr(body.state) ?? "AZ",
      address:                     normalizeStr(body.address),
      preferred_sports,
      preferred_sponsorship_level: normalizeStr(body.preferred_sponsorship_level),
      estimated_annual_budget:     typeof body.estimated_annual_budget === "number" ? body.estimated_annual_budget : null,
      next_renewal_at:             normalizeStr(body.next_renewal_at),
      status,
      source:                      normalizeStr(body.source),
      notes:                       normalizeStr(body.notes),
    });
  } catch (err) {
    return NextResponse.json({ error: `Failed to create sponsor: ${err instanceof Error ? err.message : "unknown error"}` }, { status: 500 });
  }

  logAudit({
    actor: ADMIN_TOOL_ACTOR,
    action:      "sponsor_business.created",
    entity_type: "sponsor_business",
    entity_id:   sponsor.id,
    summary:     `Added sponsor business "${business_name}"${sponsor.city ? ` (${sponsor.city})` : ""}`,
    new_value:   sponsor,
    ip_address:  ipOf(req),
    user_agent:  req.headers.get("user-agent"),
  });

  return NextResponse.json(sponsor);
}

function normalizeStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}
