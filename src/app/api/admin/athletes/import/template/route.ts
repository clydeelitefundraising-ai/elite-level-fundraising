import { NextResponse } from "next/server";
import { getAdminAccess, adminUnauthorized } from "@/lib/adminAccess";

export const dynamic = "force-dynamic";

// Header-only template — no example row, so a re-upload of the unmodified
// template can never be mistaken for a real athlete.
const TEMPLATE_CSV = "Athlete Name,Class Year,Event\r\n";

export async function GET() {
  const access = await getAdminAccess();
  if (!access) return adminUnauthorized();

  return new NextResponse(TEMPLATE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="elf-roster-template.csv"',
    },
  });
}
