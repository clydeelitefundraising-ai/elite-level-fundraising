import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { searchSchools } from "@/lib/platform/schoolLinks";
import { schoolLabel } from "@/lib/platform/schoolLinksLogic";
import { createSchool } from "@/lib/platform/schoolCreate";
import { validateNewSchool, type ExistingSchool } from "@/lib/platform/schoolCreateLogic";
import { ipOf } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

// GET /api/platform-admin/school-links/schools?q=<name, city or state>
// School selector for linking. Platform Admin accounts only (the shared
// /admin password session is not accepted here). Read-only; returns name,
// city and state so same-named schools stay distinct. Creating a school is
// the separate POST below.
export async function GET(req: NextRequest) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await searchSchools(req.nextUrl.searchParams.get("q"));
    return NextResponse.json(
      { schools: rows.map(o => ({ id: o.id, slug: o.slug, school_name: o.school_name, city: o.city, state: o.state, label: schoolLabel(o) })) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Schools couldn't be loaded." }, { status: 503 });
  }
}

// POST /api/platform-admin/school-links/schools
//   { school_name, city, state, acknowledgeSimilar? }
// "Create new school" — Platform Admin accounts only (checked here, like
// every handler in this tree). Creates the school record only: no season
// is linked until the admin previews and confirms. Answers:
//   201 { school, auditRecorded }        created (audited with this admin;
//                                        auditRecorded false = the audit row
//                                        couldn't be written, school kept)
//   409 { code: "duplicate", existing }  same name + city + state exists
//   409 { code: "similar", similar }     same name elsewhere — resend with
//                                        acknowledgeSimilar: true if it is
//                                        a different school
//   400 { field, error }                 invalid input
export async function POST(req: NextRequest) {
  const admin = await getPlatformAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = validateNewSchool(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ field: parsed.field, error: parsed.error }, { status: 400 });

  const view = (o: ExistingSchool) => ({ id: o.id, slug: o.slug, school_name: o.school_name, city: o.city, state: o.state, label: schoolLabel(o) });
  try {
    const result = await createSchool(parsed.value, {
      acknowledgeSimilar: parsed.acknowledgeSimilar,
      admin,
      request: { ip: ipOf(req), userAgent: req.headers.get("user-agent") },
    });
    if (result.status === "duplicate") {
      return NextResponse.json({ code: "duplicate", error: "This school already exists.", existing: view(result.existing) }, { status: 409 });
    }
    if (result.status === "similar") {
      return NextResponse.json({ code: "similar", error: "A school with this name already exists elsewhere.", similar: result.similar.map(view) }, { status: 409 });
    }
    return NextResponse.json({ school: view(result.school), auditRecorded: result.auditRecorded }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The school couldn't be created. Nothing was changed." }, { status: 503 });
  }
}
