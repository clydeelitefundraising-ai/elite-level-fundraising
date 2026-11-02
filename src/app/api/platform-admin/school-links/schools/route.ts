import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminSession } from "@/lib/platformAdminSession";
import { searchSchools } from "@/lib/platform/schoolLinks";
import { schoolLabel } from "@/lib/platform/schoolLinksLogic";

export const dynamic = "force-dynamic";

// GET /api/platform-admin/school-links/schools?q=<name, city or state>
// School selector for linking. Platform Admin accounts only (the shared
// /admin password session is not accepted here). Read-only; returns name,
// city and state so same-named schools stay distinct. Never creates.
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
